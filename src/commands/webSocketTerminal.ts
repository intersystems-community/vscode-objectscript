import * as vscode from "vscode";
import WebSocket = require("ws");

import { AtelierAPI } from "../api";
import { connectionTarget, currentFile, getWsServerConnection, handleError, notIsfs, outputChannel } from "../utils";
import { config, iscIcon, resolveConnectionSpec } from "../extension";

const keys = {
  enter: "\r",
  backspace: "\x7f",
  up: "\x1b\x5b\x41",
  down: "\x1b\x5b\x42",
  left: "\x1b\x5b\x44",
  right: "\x1b\x5b\x43",
  interrupt: "\x03",
  ctrlU: "\x15",
  ctrlA: "\x01",
  ctrlE: "\x05",
  ctrlH: "\x08",
  del: "\x1b[3~",
  home: "\x1b\x5b\x48",
  end: "\x1b\x5b\x46",
};

const actions = {
  cursorUp: "\x1b[A",
  cursorDown: "\x1b[B",
  cursorForward: "\x1b[C",
  cursorBack: "\x1b[D",
  deleteChar: "\x1b[P",
  clearLine: "\x1b[2K\r",
  clear: "\x1b[2J\x1b[3J\x1b[;H",
};

/** Data received from the WebSocket */
interface WebSocketMessage {
  /** The type of the message */
  type: "prompt" | "read" | "error" | "output" | "init" | "color";
  /** The text of the message. Present for all types but "read" and "init". */
  text?: string;
  /** The WebSocket protocol version. Only present for "init". */
  protocol?: number;
  /** The InterSystems IRIS `$ZVERSION`. Only present for "init". */
  version?: string;
}

class WebSocketTerminal implements vscode.Pseudoterminal {
  private _writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this._writeEmitter.event;
  private _closeEmitter = new vscode.EventEmitter<void>();
  onDidClose: vscode.Event<void> = this._closeEmitter.event;

  /** The number of characters on the line that the user can't delete */
  private _margin = 0;

  /** The text writted by the user since the last prompt/read */
  private _input = "";

  /** The position of the cursor within the line */
  private _cursorCol = 0;

  /** All command input that have been sent to the server */
  private _history: string[] = [];

  /**
   * The index in the `history` that we last showed the user.
   * -1 if we haven't begun a history scroll, -2 if we scrolled to the end.
   */
  private _historyIdx = -1;

  /** Current state */
  private _state: "prompt" | "read" | "eval" = "eval";

  /** If `true`, the next output line is the first since sending the prompt input */
  private _firstOutputLineSincePrompt = true;

  /** The `text` of the last `prompt` message sent by the server */
  private _prompt = "";

  /** The exit code to report for the last prompt executed */
  private _promptExitCode = ";0";

  /** The leading characters for multi-line editing mode */
  private readonly _multiLinePrompt: string = "... ";

  /** The WebSocket used to talk to the server */
  private _socket: WebSocket;

  /** The number of columns in the terminal */
  private _cols: number;

  /** The `RegExp` used to strip ANSI color escape codes from a string */
  // eslint-disable-next-line no-control-regex
  private _colorsRegex = /\x1b[^m]*?m/g;

  constructor(private readonly _api: AtelierAPI) {}

  /** Hide the cursor, write `data` to the terminal, then show the cursor again. */
  private _hideCursorWrite(data: string): void {
    this._writeEmitter.fire(`\x1b[?25l${data}\x1b[?25h`);
  }

  /** Detect if `this._input` has any unmatched `{` or `(` */
  private _inputIsUnterminated(): boolean {
    let inString = false;
    let openParen = 0;
    let openBrace = 0;
    for (const c of this._input) {
      switch (c) {
        case '"':
          inString = !inString;
          break;
        case "(":
          if (!inString) {
            openParen++;
          }
          break;
        case ")":
          if (!inString) {
            openParen--;
          }
          break;
        case "{":
          if (!inString) {
            openBrace++;
          }
          break;
        case "}":
          if (!inString) {
            openBrace--;
          }
          break;
      }
    }
    return openParen > 0 || openBrace > 0;
  }

  /** Checks if syntax coloring is enabled */
  private _syntaxColoringEnabled(): boolean {
    return vscode.workspace
      .getConfiguration(
        "objectscript.webSocketTerminal",
        vscode.workspace.getWorkspaceFolder(this._api.wsOrFile instanceof vscode.Uri ? this._api.wsOrFile : undefined)
      )
      .get("syntaxColoring");
  }

  /**
   * Converts `_input` for use as `<commandline>` by VS Code shell integration sequence `OSC 633 ; E ; <commandline> ST`.
   * See https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st
   */
  private _inputEscaped(): string {
    let result = "";
    for (const c of this._input) {
      const cc = c.charCodeAt(0);
      if (cc <= 0x20 || c == ";") {
        result += `\\x${cc.toString(16).padStart(2, "0")}`;
      } else if (c == "\\") {
        result += "\\\\";
      } else {
        result += c;
      }
    }
    return result;
  }

  /**
   * Move the cursor based on user changes (typing/deleting characters, arrow keys) or
   * changes to the width of the terminal window
   */
  private _moveCursor(cursorColDelta = 0, colsDelta = 0): void {
    if (cursorColDelta == 0 && colsDelta == 0) return;
    // Calculate the row/column number of the current position
    const currCol = this._cursorCol % this._cols;
    const currRow = (this._cursorCol - currCol) / this._cols;
    // Make the adjustment
    if (cursorColDelta != 0) {
      this._cursorCol += cursorColDelta;
    } else {
      this._cols += colsDelta;
    }
    // Calculate the row/column number of the new position
    const newCol = this._cursorCol % this._cols;
    const newRow = (this._cursorCol - newCol) / this._cols;
    // Move the cursor
    const rowDelta = newRow - currRow;
    const colDelta = newCol - currCol;
    const rowStr = rowDelta ? (rowDelta > 0 ? `\x1b[${rowDelta}B` : `\x1b[${Math.abs(rowDelta)}A`) : "";
    const colStr = colDelta ? (colDelta > 0 ? `\x1b[${colDelta}C` : `\x1b[${Math.abs(colDelta)}D`) : "";
    this._hideCursorWrite(`${rowStr}${colStr}`);
  }

  /**
   * Move the cursor to the last line of the input (prompt or read)
   * so any output doesn't overwrite the end of the input
   */
  private _moveCursorToLastLine(): void {
    const currRow = (this._cursorCol - (this._cursorCol % this._cols)) / this._cols;
    const newRow = Math.ceil((this._margin + this._input.split("\r\n").pop().length + 1) / this._cols) - 1;
    const rowDelta = newRow - currRow;
    if (rowDelta) this._hideCursorWrite(`\x1b[${rowDelta}B`);
  }

  open(initialDimensions?: vscode.TerminalDimensions): void {
    this._cols = initialDimensions?.columns ?? 100000;
    try {
      // Open the WebSocket
      this._socket = new WebSocket(this._api.terminalUrl(), {
        rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
        headers: {
          cookie: this._api.cookies,
        },
      });
    } catch (error) {
      handleError(error, "Failed to initialize Lite Terminal.");
      outputChannel.appendLine("Check that the InterSystems server's web server supports WebSockets.");
      this._closeEmitter.fire();
      return;
    }
    // Print the opening message
    this._hideCursorWrite(
      `\x1b[32mConnected to \x1b[0m\x1b[4m${this._api.config.host}:${this._api.config.port}${this._api.config.pathPrefix}\x1b[0m\x1b[32m as \x1b[0m\x1b[3m${this._api.config.username}\x1b[0m\r\n\r\n`
    );
    // Add event handlers to the socket
    this._socket
      .on("error", (error) => {
        // Log the error and close
        handleError(`WebSocket error: ${error.toString()}`, "Lite Terminal failed.");
        this._closeEmitter.fire();
      })
      .on("close", () => {
        // Close the terminal
        this._closeEmitter.fire();
      })
      .on("message", (data: string) => {
        let message: WebSocketMessage;
        try {
          message = JSON.parse(data);
        } catch {
          return;
        }
        switch (message.type) {
          case "error":
            // Log the error and close
            handleError(message.text, "Lite Terminal failed.");
            this._closeEmitter.fire();
            break;
          case "output":
            // Write the output to the terminal
            if (this._firstOutputLineSincePrompt) {
              // Strip leading \r\n since we printed it already
              message.text = message.text.startsWith("\r\n") ? message.text.slice(2) : message.text;
              this._firstOutputLineSincePrompt = false;
            }
            if (message.text.includes("\x1b[31;1m")) {
              if (message.text.includes("\x1b[31;1m<INTERRUPT>")) {
                // Report no exit code for interrupts
                this._promptExitCode = "";
              } else {
                this._promptExitCode = ";1";
              }
            }
            this._margin = this._cursorCol = message.text.split("\r\n").pop().length;
            this._hideCursorWrite(message.text);
            break;
          case "prompt":
          case "read":
            if (message.type == "prompt") {
              // Write the prompt to the terminal
              this._hideCursorWrite(
                `\x1b]633;D${this._promptExitCode}\x07${this._margin ? "\r\n" : ""}\x1b]633;A\x07${
                  message.text
                }\x1b]633;B\x07`
              );
              this._margin = this._cursorCol = message.text.replace(this._colorsRegex, "").length;
              this._prompt = message.text;
              this._promptExitCode = ";0";
            }
            // Enable input
            this._state = message.type;
            break;
          case "init":
            this._socket.send(
              JSON.stringify({
                type: "config",
                // Start in the current namespace
                namespace: this._api.ns,
                // Have the server send ANSI escape codes since we can print them
                rawMode: false,
              })
            );
            break;
          case "color": {
            // Replace the input with the syntax colored text, keeping the cursor at the same spot
            let cursorLine = Math.ceil((this._cursorCol + 1) / this._cols) - 1;
            if (message.text.includes("\r\n")) {
              const lines = message.text.replace(this._colorsRegex, "").split("\r\n");
              lines.pop();
              cursorLine += lines.reduce((sum, line) => sum + Math.ceil((line.length + 1) / this._cols), 0);
            }
            this._hideCursorWrite(
              `\x1b7${cursorLine > 0 ? `\x1b[${cursorLine}A` : ""}\r\x1b[0J${this._prompt}${message.text.replace(
                /\r\n/g,
                `\r\n${this._multiLinePrompt}`
              )}\x1b8`
            );
            break;
          }
        }
      });
  }

  close(): void {
    if (
      this._socket &&
      this._socket.readyState != this._socket.CLOSED &&
      this._socket.readyState != this._socket.CLOSING
    ) {
      this._socket.close();
    }
  }

  async handleInput(char: string): Promise<void> {
    switch (char) {
      case keys.enter: {
        if (this._state == "eval") {
          // Terminal is already evaluating user input
          return;
        }

        if (this._state == "prompt") {
          // Reset historyIdx
          this._historyIdx = -1;

          if (this._input != "" && !this._input.includes("\r\n")) {
            // Remove the input from the existing history
            this._history = this._history.filter((h) => h != this._input);

            // Append this input to the history
            this._history.push(this._input);
          }

          // Check if we should enter multi-line mode
          if (this._inputIsUnterminated()) {
            // Write the multi-line mode prompt to the terminal
            this._hideCursorWrite(`\r\n${this._multiLinePrompt}`);
            this._margin = this._cursorCol = this._multiLinePrompt.length;
            this._input += "\r\n";
            return;
          }

          // Reset first line tracker
          this._firstOutputLineSincePrompt = true;
        } else {
          // Reset first line tracker
          this._firstOutputLineSincePrompt = false;
        }
        // Move cursor to the last line of the input
        this._moveCursorToLastLine();

        // Send the input to the server for processing
        this._socket.send(JSON.stringify({ type: this._state, input: this._input }));
        if (this._state == "prompt") {
          this._hideCursorWrite(`\x1b]633;C\x07\x1b]633;E;${this._inputEscaped()}\x07\r\n`);
          if (this._input == "") {
            this._promptExitCode = "";
          }
        }
        this._input = "";
        this._state = "eval";
        return;
      }
      case keys.ctrlH:
      case keys.backspace: {
        // Erase to the left
        if (this._state == "eval") {
          // We're not accepting user input
          return;
        }
        if (this._cursorCol <= this._margin) {
          // Don't delete the prompt
          return;
        }
        const inputArr = this._input.split("\r\n");
        const trailingText = inputArr[inputArr.length - 1].slice(this._cursorCol - this._margin);
        inputArr[inputArr.length - 1] =
          inputArr[inputArr.length - 1].slice(0, this._cursorCol - this._margin - 1) + trailingText;
        this._input = inputArr.join("\r\n");
        this._moveCursor(-1);
        this._hideCursorWrite(`\x1b7\x1b[0J${trailingText}\x1b8`);
        if (this._input != "" && this._state == "prompt" && this._syntaxColoringEnabled()) {
          // Syntax color input
          this._socket.send(JSON.stringify({ type: "color", input: this._input }));
        }
        return;
      }
      case keys.del: {
        // Erase to the right
        if (this._state == "eval") {
          // We're not accepting user input
          return;
        }
        const inputArr = this._input.split("\r\n");
        if (this._margin + inputArr[inputArr.length - 1].length - this._cursorCol > 0) {
          const trailingText = inputArr[inputArr.length - 1].slice(this._cursorCol - this._margin + 1);
          inputArr[inputArr.length - 1] =
            inputArr[inputArr.length - 1].slice(0, this._cursorCol - this._margin) + trailingText;
          this._input = inputArr.join("\r\n");
          this._hideCursorWrite(`\x1b7\x1b[0J${trailingText}\x1b8`);
          if (this._input != "" && this._state == "prompt" && this._syntaxColoringEnabled()) {
            // Syntax color input
            this._socket.send(JSON.stringify({ type: "color", input: this._input }));
          }
        }
        return;
      }
      case keys.up: {
        if (this._state != "prompt" || this._input.includes("\r\n")) {
          // History only available for prompts
          return;
        }
        if (this._historyIdx == -1) {
          // Show the most recent input
          this._historyIdx = this._history.length - 1;
        } else if (this._historyIdx == 0) {
          // This is the end of our history
          this._historyIdx = -2;
        } else if (this._historyIdx == -2) {
          // We hit the end of our history
          return;
        } else {
          // Scroll back one more input
          this._historyIdx--;
        }
        if (this._historyIdx >= 0) {
          this._input = this._history[this._historyIdx];
        } else if (this._historyIdx == -1) {
          // There is no history, so do nothing
          return;
        } else {
          // If we hit the end, leave the input blank
          this._input = "";
        }
        // Move cursor to start of input, clear everything, then write new input
        this._moveCursor(this._margin - this._cursorCol);
        this._hideCursorWrite(`\x1b[0J${this._input}`);
        this._cursorCol = this._margin + this._input.length;
        if (this._input != "" && this._syntaxColoringEnabled()) {
          // Syntax color input
          this._socket.send(JSON.stringify({ type: "color", input: this._input }));
        }
        return;
      }
      case keys.down: {
        if (this._state != "prompt" || this._input.includes("\r\n")) {
          // History only available for prompts
          return;
        }
        if (this._historyIdx == -1) {
          // We're not in the history
          return;
        } else if (this._historyIdx == -2) {
          // We hit the end of our history
          this._historyIdx = 0;
        } else if (this._historyIdx == this._history.length - 1) {
          // We hit the beginning of our history
          this._historyIdx = -1;
        } else {
          this._historyIdx++;
        }
        if (this._historyIdx != -1) {
          this._input = this._history[this._historyIdx];
        } else {
          // If we hit the beginning, leave the input blank
          this._input = "";
        }
        // Move cursor to start of input, clear everything, then write new input
        this._moveCursor(this._margin - this._cursorCol);
        this._hideCursorWrite(`\x1b[0J${this._input}`);
        this._cursorCol = this._margin + this._input.length;
        if (this._input != "" && this._syntaxColoringEnabled()) {
          // Syntax color input
          this._socket.send(JSON.stringify({ type: "color", input: this._input }));
        }
        return;
      }
      case keys.left: {
        if (this._state == "eval") {
          // User can't move cursor
          return;
        }
        if (this._cursorCol > this._margin) {
          if (this._cursorCol % this._cols == 0) {
            // Move the cursor to the end of the previous line
            this._hideCursorWrite(`${actions.cursorUp}\x1b[${this._cols}G`);
          } else {
            // Move the cursor back one column
            this._hideCursorWrite(actions.cursorBack);
          }
          this._cursorCol--;
        }
        return;
      }
      case keys.right: {
        if (this._state == "eval") {
          // User can't move cursor
          return;
        }
        if (this._cursorCol < this._margin + this._input.split("\r\n").pop().length) {
          this._cursorCol++;
          if (this._cursorCol % this._cols == 0) {
            // Move the cursor to the beginning of the next line
            this._hideCursorWrite("\x1b[1E");
          } else {
            // Move the cursor forward one column
            this._hideCursorWrite(actions.cursorForward);
          }
        }
        return;
      }
      case keys.interrupt: {
        // Send interrupt message
        this._socket.send(JSON.stringify({ type: "interrupt" }));
        this._input = "";
        if (this._state == "prompt") {
          this._hideCursorWrite("\r\n");
          // Reset first line tracker
          this._firstOutputLineSincePrompt = true;
        }
        this._state = "eval";
        return;
      }
      case keys.home:
      case keys.ctrlA: {
        if (this._state == "prompt" && this._cursorCol - this._margin > 0) {
          // Move the cursor to the beginning of the input
          this._moveCursor(this._margin - this._cursorCol);
        }
        return;
      }
      case keys.end:
      case keys.ctrlE: {
        if (this._state == "prompt") {
          // Move the cursor to the end of the input
          const lineLength = this._input.split("\r\n").pop().length;
          if (lineLength > this._cursorCol) {
            this._moveCursor(lineLength - this._cursorCol);
          }
        }
        return;
      }
      case keys.ctrlU: {
        if (this._state == "prompt") {
          // Erase the input if the cursor is at the end of it
          const inputArr = this._input.split("\r\n");
          if (this._cursorCol == this._margin + inputArr[inputArr.length - 1].length) {
            // Move the cursor to the beginning of the input
            this._moveCursor(this._margin - this._cursorCol);
            // Erase everyhting to the right of the cursor
            this._hideCursorWrite("\x1b[0J");
            inputArr[inputArr.length - 1] = "";
            this._input = inputArr.join("\r\n");
            if (this._input != "" && this._syntaxColoringEnabled()) {
              // Syntax color input
              this._socket.send(JSON.stringify({ type: "color", input: this._input }));
            }
          }
        }
        return;
      }
      default: {
        if (this._state == "eval") {
          // Terminal is already evaluating user input
          return;
        }
        // Turn all newlines and tabs into spaces
        char = char.replace(/\r?\n/g, " ");
        if (this._state == "prompt") {
          char = char.replace(/\t/g, " ");
        }
        let submit = false;
        if (char.endsWith("\r")) {
          // Submit the input after processing
          // This should only happen due to VS Code's shell integration
          submit = true;
          char = char.slice(0, -1);
        }
        // Replace all single \r with \r\n (prompt) or space (read)
        char = char.replace(/\r/g, this._state == "prompt" ? "\r\n" : " ");
        const inputArr = this._input.split("\r\n");
        let eraseAfterCursor = "",
          trailingText = "";
        if (this._cursorCol < this._margin + inputArr[inputArr.length - 1].length) {
          // Insert the new char(s)
          trailingText = inputArr[inputArr.length - 1].slice(this._cursorCol - this._margin);
          inputArr[inputArr.length - 1] = `${inputArr[inputArr.length - 1].slice(
            0,
            this._cursorCol - this._margin
          )}${char}${trailingText}`;
          this._input = inputArr.join("\r\n");
          eraseAfterCursor = "\x1b[0J";
        } else {
          // Append the new char(s)
          this._input += char;
        }
        const currCol = this._cursorCol % this._cols;
        const currRow = (this._cursorCol - currCol) / this._cols;
        const originalCol = this._cursorCol;
        let newRow: number;
        if (char.includes("\r\n")) {
          char = char.replace(/\r\n/g, `\r\n${this._multiLinePrompt}`);
          this._margin = this._multiLinePrompt.length;
          const charLines = char.split("\r\n");
          newRow =
            charLines.reduce(
              (sum, line, i) => sum + Math.ceil(((i == 0 ? this._cursorCol : 0) + line.length + 1) / this._cols),
              0
            ) - 1;
          this._cursorCol = charLines[charLines.length - 1].length;
        } else {
          newRow = Math.ceil((this._cursorCol + char.length + 1) / this._cols) - 1;
          this._cursorCol += char.length;
        }
        const rowDelta = newRow - currRow;
        const colDelta = (this._cursorCol % this._cols) - currCol;
        const rowStr = rowDelta ? (rowDelta > 0 ? `\x1b[${rowDelta}B` : `\x1b[${Math.abs(rowDelta)}A`) : "";
        const colStr = colDelta ? (colDelta > 0 ? `\x1b[${colDelta}C` : `\x1b[${Math.abs(colDelta)}D`) : "";
        char += trailingText;
        const spaceOnCurrentLine = this._cols - (originalCol % this._cols);
        if (this._state == "read" && char.length >= spaceOnCurrentLine) {
          // There's no auto-line wrapping when in read mode, so we must move the cursor manually
          // Extract all the characters that fit on the cursor's line
          const firstLine = char.slice(0, spaceOnCurrentLine);
          const otherLines = char.slice(spaceOnCurrentLine);
          const lines: string[] = [];
          if (otherLines.length) {
            // Split the rest into an array of lines that fit in the viewport
            for (let line = 0, i = 0; line < Math.ceil(otherLines.length / this._cols); line++, i += this._cols) {
              lines[line] = otherLines.slice(i, i + this._cols);
            }
          } else {
            // Add a blank "line" to move the cursor to the next viewport row
            lines.push("");
          }
          // Join the lines with the cursor escape code
          lines.unshift(firstLine);
          char = lines.join("\r\n");
        }
        // Save the cursor position, write the text, restore the cursor position, then move the cursor manually
        this._hideCursorWrite(`\x1b7${eraseAfterCursor}${char}\x1b8${rowStr}${colStr}`);
        if (submit) {
          if (this._state == "prompt") {
            // Reset historyIdx
            this._historyIdx = -1;

            if (this._input != "" && !this._input.includes("\r\n")) {
              // Remove the input from the existing history
              this._history = this._history.filter((h) => h != this._input);

              // Append this input to the history
              this._history.push(this._input);
            }

            // Reset first line tracker
            this._firstOutputLineSincePrompt = true;
          } else {
            // Reset first line tracker
            this._firstOutputLineSincePrompt = false;
          }
          // Move cursor to the last line of the input
          this._moveCursorToLastLine();

          // Send the input to the server for processing
          this._socket.send(JSON.stringify({ type: this._state, input: this._input }));
          if (this._state == "prompt") {
            this._hideCursorWrite(`\x1b]633;C\x07\x1b]633;E;${this._inputEscaped()}\x07\r\n`);
            if (this._input == "") {
              this._promptExitCode = "";
            }
          }
          this._input = "";
          this._state = "eval";
        } else if (this._input != "" && this._state == "prompt" && this._syntaxColoringEnabled()) {
          // Syntax color input
          this._socket.send(JSON.stringify({ type: "color", input: this._input }));
        }
      }
    }
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (this._state != "eval" && this._input != "") {
      // Move the cursor to the correct new position
      this._moveCursor(undefined, dimensions.columns - this._cols);
      // Save the cursor position, move the cursor to just after the margin,
      // clear the screen from that point, write the input, then restore the cursor
      let cursorLine = Math.ceil((this._cursorCol + 1) / this._cols) - 1;
      if (this._input.includes("\r\n")) {
        const lines = this._input.split("\r\n");
        lines.pop();
        cursorLine += lines.reduce((sum, line) => sum + Math.ceil((line.length + 1) / this._cols), 0);
      }
      this._hideCursorWrite(
        `\x1b7${cursorLine > 0 ? `\x1b[${cursorLine}A` : ""}\r\x1b[${this._margin}C\x1b[0J${this._input.replace(
          /\r\n/g,
          `\r\n${this._multiLinePrompt}`
        )}\x1b8`
      );
      if (this._state == "prompt" && this._syntaxColoringEnabled()) {
        // Syntax color input
        this._socket.send(JSON.stringify({ type: "color", input: this._input }));
      }
    } else {
      this._cols = dimensions.columns;
    }
  }
}

function reportError(msg: string, throwErrors = false) {
  if (throwErrors) {
    throw new Error(msg);
  } else {
    vscode.window.showErrorMessage(msg, "Dismiss");
  }
}

function terminalConfigForUri(
  api: AtelierAPI,
  targetUri: vscode.Uri,
  throwErrors = false
): vscode.ExtensionTerminalOptions | undefined {
  // Make sure the server connection is active
  if (!api.active || api.ns == "") {
    reportError("Lite Terminal requires an active server connection.", throwErrors);
    return;
  }
  // Make sure the server has the terminal endpoint
  if (api.config.apiVersion < 7) {
    reportError("Lite Terminal requires InterSystems IRIS version 2023.2 or above.", throwErrors);
    return;
  }

  return {
    name: api.config.serverName && api.config.serverName != "" ? api.config.serverName : "iris",
    location:
      // Mimic what a built-in profile does. When it is the default and the Terminal tab is selected while empty,
      // a terminal is always created in the Panel.
      vscode.workspace.getConfiguration("terminal.integrated", targetUri).get("defaultLocation") === "editor" &&
      vscode.window.terminals.length > 0
        ? vscode.TerminalLocation.Editor
        : vscode.TerminalLocation.Panel,
    pty: new WebSocketTerminal(api),
    isTransient: true,
    iconPath: iscIcon,
  };
}

export async function launchWebSocketTerminal(targetUri?: vscode.Uri): Promise<void> {
  // Determine the server to connect to
  if (targetUri) {
    // Uri passed as command argument might be for a server we haven't yet resolved
    // connection details such as password, so make sure that happens now if needed
    const { configName } = connectionTarget(targetUri);
    const serverName = notIsfs(targetUri) ? config("conn", configName).server : configName;
    await resolveConnectionSpec(serverName);
  } else {
    // Determine the server connection to use
    targetUri = currentFile()?.uri ?? (await getWsServerConnection("2023.2.0"));
    if (!targetUri) return;
  }
  const api = new AtelierAPI(targetUri);

  // Guarantee we know the apiVersion of the server
  await api.serverInfo();

  // Get the terminal configuration
  const terminalOpts = terminalConfigForUri(api, targetUri);
  if (terminalOpts) {
    // Launch the terminal
    const terminal = vscode.window.createTerminal(terminalOpts);
    terminal.show();
  }
}

export class WebSocketTerminalProfileProvider implements vscode.TerminalProfileProvider {
  async provideTerminalProfile(): Promise<vscode.TerminalProfile> {
    // Determine the server connection to use
    const uri: vscode.Uri = await getWsServerConnection("2023.2.0");

    if (uri) {
      // Get the terminal configuration. Will throw if there's an error.
      const terminalOpts = terminalConfigForUri(new AtelierAPI(uri), uri, true);
      return new vscode.TerminalProfile(terminalOpts);
    } else {
      throw new Error(
        "Lite Terminal requires an active server connection to InterSystems IRIS version 2023.2 or above."
      );
    }
  }
}
