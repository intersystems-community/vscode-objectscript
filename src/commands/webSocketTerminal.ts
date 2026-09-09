import * as vscode from "vscode";
import WebSocket = require("ws");

import { AtelierAPI } from "../api";
import { connectionTarget, currentFile, getWsServerConnection, handleError, notIsfs, outputChannel } from "../utils";
import { config, iscIcon, resolveConnectionSpec, sendLiteTerminalTelemetryEvent } from "../extension";

const NO_ELIGIBLE_CONNECTIONS =
  "Lite Terminal requires an active server connection to InterSystems IRIS version 2023.2 or above.";

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
  /** The current namespace. Only present for "prompt" on IRIS 2025.3+. */
  ns?: string;
}

/** Detect if `input` has any unmatched `{` or `(` */
function isInputUnterminated(input: string): boolean {
  let inString = false;
  let openParen = 0;
  let openBrace = 0;
  for (const c of input) {
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

/**
 * Escapes `input` for use as `<commandline>` by VS Code shell integration sequence `OSC 633 ; E ; <commandline> ST`.
 * See https://code.visualstudio.com/docs/terminal/shell-integration#_vs-code-custom-sequences-osc-633-st
 */
function escapeCommandLine(input: string): string {
  let result = "";
  for (const c of input) {
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

/** Build the shell integration escape sequence that reports a submitted command line */
function shellIntegrationSubmitEscape(input: string, nonce: string): string {
  return `\x1b]633;E;${escapeCommandLine(input)};${nonce}\x07\r\n\x1b]633;C\x07`;
}

/**
 * Compute the escape sequence to move the cursor based on user changes (typing/deleting characters, arrow keys) or
 * changes to the width of the terminal window, along with the resulting cursor column and column count.
 */
function computeCursorMove(
  cursorCol: number,
  cols: number,
  cursorColDelta = 0,
  colsDelta = 0
): { escape: string; cursorCol: number; cols: number } {
  // Calculate the row/column number of the current position
  const currCol = cursorCol % cols;
  const currRow = (cursorCol - currCol) / cols;
  // Work out the adjustment
  const newCursorCol = cursorColDelta != 0 ? cursorCol + cursorColDelta : cursorCol;
  const newCols = cursorColDelta != 0 ? cols : cols + colsDelta;
  // Calculate the row/column number of the new position
  const newCol = newCursorCol % newCols;
  const newRow = (newCursorCol - newCol) / newCols;
  // Move the cursor
  const rowDelta = newRow - currRow;
  const colDelta = newCol - currCol;
  const rowStr = rowDelta ? (rowDelta > 0 ? `\x1b[${rowDelta}B` : `\x1b[${Math.abs(rowDelta)}A`) : "";
  const colStr = colDelta ? (colDelta > 0 ? `\x1b[${colDelta}C` : `\x1b[${Math.abs(colDelta)}D`) : "";
  return { escape: `${rowStr}${colStr}`, cursorCol: newCursorCol, cols: newCols };
}

/**
 * Compute the escape sequence to move the cursor to the last line of the input (prompt or read)
 * so any output doesn't overwrite the end of the input
 */
function computeMoveToLastLineEscape(cursorCol: number, margin: number, input: string, cols: number): string {
  const currRow = (cursorCol - (cursorCol % cols)) / cols;
  const newRow = Math.ceil((margin + input.split("\r\n").pop()!.length + 1) / cols) - 1;
  const rowDelta = newRow - currRow;
  return rowDelta ? `\x1b[${rowDelta}B` : "";
}

/** Turn newlines/tabs into spaces, and detect and strip a trailing shell-integration submit `\r` */
function normalizeTypedChars(
  char: string,
  state: "prompt" | "read" | "eval",
  multiLinePrompt: string
): { char: string; submit: boolean } {
  // Turn all newlines and tabs into spaces
  char = char.replace(/\r?\n/g, " ");
  if (state == "prompt") {
    char = char.replace(/\t/g, " ");
  }
  let submit = false;
  if (char.endsWith("\r")) {
    // Submit the input after processing
    // This should only happen due to VS Code's shell integration
    submit = true;
    // Need to remove any multi-line prompts that are in the command lines
    // Workaround for https://github.com/microsoft/vscode/issues/258457
    char = char
      .slice(0, -1)
      .split("\r")
      .map((l) => (l.startsWith(multiLinePrompt) ? l.slice(multiLinePrompt.length) : l))
      .join("\r");
  }
  // Replace all single \r with \r\n
  char = char.replace(/\r(?!\n)/g, "\r\n");
  return { char, submit };
}

/** Compute the input line that results from inserting `char` at the cursor position */
function computeInsertedInput(
  input: string,
  cursorCol: number,
  margin: number,
  char: string
): { newInput: string; trailingText: string; eraseAfterCursor: string } {
  const inputArr = input.split("\r\n");
  let eraseAfterCursor = "",
    trailingText = "";
  let newInput: string;
  if (cursorCol < margin + inputArr[inputArr.length - 1].length) {
    // Insert the new char(s)
    trailingText = inputArr[inputArr.length - 1].slice(cursorCol - margin);
    inputArr[inputArr.length - 1] =
      `${inputArr[inputArr.length - 1].slice(0, cursorCol - margin)}${char}${trailingText}`;
    newInput = inputArr.join("\r\n");
    eraseAfterCursor = "\x1b[0J";
  } else {
    // Append the new char(s)
    newInput = input + char;
  }
  return { newInput, trailingText, eraseAfterCursor };
}

/**
 * Compute the escape sequence to move the cursor after inserting `char`, along with the resulting margin/cursor
 * column and `char` itself (which gains multi-line prompt markers when a multi-line paste lands in a prompt)
 */
function computeInsertMove(
  cursorCol: number,
  cols: number,
  margin: number,
  state: "prompt" | "read" | "eval",
  char: string,
  multiLinePrompt: string
): { char: string; newMargin: number; newCursorCol: number; escape: string } {
  const currCol = cursorCol % cols;
  const currRow = (cursorCol - currCol) / cols;
  let newMargin = margin;
  let newCursorCol: number;
  let newRow: number;
  if (char.includes("\r\n")) {
    if (state == "prompt") {
      char = char.replaceAll("\r\n", `\r\n${multiLinePrompt}`);
      newMargin = multiLinePrompt.length;
    }
    const charLines = char.split("\r\n");
    newRow =
      charLines.reduce((sum, line, i) => sum + Math.ceil(((i == 0 ? cursorCol : 0) + line.length + 1) / cols), 0) - 1;
    newCursorCol = charLines[charLines.length - 1].length;
  } else {
    newRow = Math.ceil((cursorCol + char.length + 1) / cols) - 1;
    newCursorCol = cursorCol + char.length;
  }
  const rowDelta = newRow - currRow;
  const colDelta = (newCursorCol % cols) - currCol;
  const rowStr = rowDelta ? (rowDelta > 0 ? `\x1b[${rowDelta}B` : `\x1b[${Math.abs(rowDelta)}A`) : "";
  const colStr = colDelta ? (colDelta > 0 ? `\x1b[${colDelta}C` : `\x1b[${Math.abs(colDelta)}D`) : "";
  return { char, newMargin, newCursorCol, escape: `${rowStr}${colStr}` };
}

/** There's no auto-line wrapping in read mode, so manually wrap `char` to fit the viewport width */
function wrapForReadMode(char: string, cols: number, originalCol: number, state: "prompt" | "read" | "eval"): string {
  const spaceOnCurrentLine = cols - (originalCol % cols);
  if (state != "read" || (!char.includes("\r\n") && char.length < spaceOnCurrentLine)) {
    return char;
  }
  const charLines = char.split("\r\n");
  // Extract all the characters that fit on the cursor's line
  const firstLine = charLines[0].slice(0, spaceOnCurrentLine);
  charLines[0] = charLines[0].slice(spaceOnCurrentLine);
  // Split the rest into an array of lines that fit in the viewport
  const lines = charLines.flatMap((line, idx) => {
    if (idx == charLines.length - 1 && line == "") {
      // Add a blank "line" to move the cursor to the next viewport row
      return [""];
    }
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += cols) {
      chunks.push(line.slice(i, i + cols));
    }
    return chunks;
  });
  // Join the lines with the cursor escape code
  lines.unshift(firstLine);
  return lines.join("\r\n");
}

class WebSocketTerminal implements vscode.Pseudoterminal {
  private _writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this._writeEmitter.event;
  private _closeEmitter = new vscode.EventEmitter<void>();
  onDidClose: vscode.Event<void> = this._closeEmitter.event;

  /** The number of characters on the line that the user can't delete */
  private _margin = 0;

  /** The text written by the user since the last prompt/read */
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
  public readonly multiLinePrompt = "... ";

  /** The WebSocket used to talk to the server */
  private _socket: WebSocket;

  /** The number of columns in the terminal */
  private _cols: number;

  /** The `RegExp` used to strip ANSI color escape codes from a string */
  // eslint-disable-next-line no-control-regex
  private _colorsRegex = /\x1b[^m]*?m/g;

  /** The terminal's current namespace */
  public currentNs: string;

  constructor(
    public readonly targetUri: vscode.Uri,
    private readonly _nonce: string,
    private readonly _nsOverride?: string
  ) {}

  /** Set the text of the input line */
  private _setInput(input: string): void {
    this._input = input;
  }

  /** Set the number of characters on the line that the user can't delete */
  private _setMargin(margin: number): void {
    this._margin = margin;
  }

  /** Set the position of the cursor within the line */
  private _setCursorCol(cursorCol: number): void {
    this._cursorCol = cursorCol;
  }

  /** Set the margin and place the cursor right after it */
  private _setMarginAndCursorCol(value: number): void {
    this._setMargin(value);
    this._setCursorCol(value);
  }

  /** Replace the input line with fresh text, with the cursor right after the new margin */
  private _resetLine(input: string, margin: number): void {
    this._setInput(input);
    this._setMarginAndCursorCol(margin);
  }

  /** Replace the input line's text and move the cursor within it */
  private _setInputAndCursorCol(input: string, cursorCol: number): void {
    this._setInput(input);
    this._setCursorCol(cursorCol);
  }

  /** Set the scroll position within the command history */
  private _setHistoryIdx(historyIdx: number): void {
    this._historyIdx = historyIdx;
  }

  /** Replace the command history and reset the scroll position within it */
  private _setHistory(history: string[], historyIdx: number): void {
    this._history = history;
    this._setHistoryIdx(historyIdx);
  }

  /** Set the prompt/read/eval protocol state */
  private _setState(state: "prompt" | "read" | "eval"): void {
    this._state = state;
  }

  /** Set whether the next output line is the first since sending the prompt input */
  private _setFirstOutputLineSincePrompt(firstOutputLineSincePrompt: boolean): void {
    this._firstOutputLineSincePrompt = firstOutputLineSincePrompt;
  }

  /** Set the `text` of the last `prompt` message sent by the server */
  private _setPrompt(prompt: string): void {
    this._prompt = prompt;
  }

  /** Set the exit code to report for the last prompt executed */
  private _setPromptExitCode(promptExitCode: string): void {
    this._promptExitCode = promptExitCode;
  }

  /** Record a newly received prompt and enable prompt input */
  private _setPromptReceived(prompt: string): void {
    this._setPrompt(prompt);
    this._setPromptExitCode(";0");
    this._setState("prompt");
  }

  /** Update the number of columns in the terminal */
  private _setCols(cols: number): void {
    this._cols = cols;
  }

  /** Update the terminal's current namespace */
  private _setNamespace(currentNs: string): void {
    this.currentNs = currentNs;
  }

  /** Hide the cursor, write `data` to the terminal, then show the cursor again. */
  private _hideCursorWrite(data: string): void {
    this._writeEmitter.fire(`\x1b[?25l${data}\x1b[?25h`);
  }

  open(initialDimensions?: vscode.TerminalDimensions): void {
    const api = new AtelierAPI(this.targetUri);
    if (this._nsOverride) api.setNamespace(this._nsOverride);
    const cols = initialDimensions?.columns ?? 100000;
    let socket: WebSocket;
    try {
      // Open the WebSocket
      socket = new WebSocket(api.terminalUrl(), {
        rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
        headers: {
          cookie: api.cookies,
        },
      });
    } catch (error) {
      handleError(error, "Failed to initialize Lite Terminal.");
      outputChannel.appendLine("Check that the InterSystems server's web server supports WebSockets.");
      this._closeEmitter.fire();
      return;
    }
    // Set terminal properties
    this._hideCursorWrite("\x1b]633;P;HasRichCommandDetection=True\x07");
    // Print the opening message
    const username = api.config.auth.username;
    const identity = username.includes("*")
      ? `using \x1b[0m\x1b[3m${username.slice(1, -1)}\x1b[0m\r\n`
      : `as \x1b[0m\x1b[3m${username}\x1b[0m\r\n`;
    this._hideCursorWrite(
      `\x1b[32mConnected to \x1b[0m\x1b[4m${api.config.host}:${api.config.port}${api.config.pathPrefix}\x1b[0m\x1b[32m ${identity}`
    );
    // Add event handlers to the socket
    socket
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
          case "output": {
            // Write the output to the terminal
            const wasFirstLine = this._firstOutputLineSincePrompt;
            // Strip leading \r\n since we printed it already
            const text = wasFirstLine && message.text!.startsWith("\r\n") ? message.text!.slice(2) : message.text!;
            const isInterrupt = text.includes("\x1b[31;1m<INTERRUPT>");
            const isError = !isInterrupt && text.includes("\x1b[31;1m");
            this._hideCursorWrite(text);
            if (wasFirstLine) this._setFirstOutputLineSincePrompt(false);
            // Report no exit code for interrupts
            if (isInterrupt) this._setPromptExitCode("");
            else if (isError) this._setPromptExitCode(";1");
            this._setMarginAndCursorCol(text.split("\r\n").pop()!.length);
            break;
          }
          case "prompt":
          case "read":
            if (message.type == "prompt") {
              // Write the prompt to the terminal
              this._hideCursorWrite(
                `\x1b]633;D${this._promptExitCode}\x07\r\n\x1b]633;A\x07${message.text}\x1b]633;B\x07`
              );
              this._setMarginAndCursorCol(message.text!.replace(this._colorsRegex, "").length);
              this._setPromptReceived(message.text!);
              // Store the current namespace
              this._setNamespace(message.ns!);
            } else {
              // Enable input
              this._setState("read");
            }
            break;
          case "init":
            this._socket.send(
              JSON.stringify({
                type: "config",
                // Start in the current namespace
                namespace: api.ns,
                // Have the server send ANSI escape codes since we can print them
                rawMode: false,
              })
            );
            break;
          case "color": {
            // Replace the input with the syntax colored text, keeping the cursor at the same spot
            let cursorLine = Math.ceil((this._cursorCol + 1) / this._cols) - 1;
            if (message.text!.includes("\r\n")) {
              const lines = message.text!.replace(this._colorsRegex, "").split("\r\n");
              lines.pop();
              cursorLine += lines.reduce((sum, line) => sum + Math.ceil((line.length + 1) / this._cols), 0);
            }
            this._hideCursorWrite(
              `\x1b7${cursorLine > 0 ? `\x1b[${cursorLine}A` : ""}\r\x1b[0J${this._prompt}${message.text!.replace(
                /\r\n/g,
                `\r\n${this.multiLinePrompt}`
              )}\x1b8`
            );
            break;
          }
        }
      });
    this._cols = cols;
    this._socket = socket;
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
    switch (this._state) {
      case "eval":
        // Terminal is already evaluating user input; no input is accepted, except to interrupt it
        switch (char) {
          case keys.interrupt:
            return this._handleInterrupt(this._socket, this._state);
          default:
            return;
        }
      case "prompt":
        switch (char) {
          case keys.interrupt:
            return this._handleInterrupt(this._socket, this._state);
          case keys.enter:
            return this._handleSubmitPrompt(
              this._input,
              this._history,
              this._cursorCol,
              this._margin,
              this._cols,
              this._socket
            );
          case keys.ctrlH:
          case keys.backspace:
            return this._handleBackspace(
              this._cursorCol,
              this._margin,
              this._input,
              this._cols,
              this._state,
              this._socket
            );
          case keys.del:
            return this._handleDeleteForward(this._input, this._margin, this._cursorCol, this._state, this._socket);
          case keys.up:
            return this._handleHistoryUp(
              this._input,
              this._historyIdx,
              this._history,
              this._cursorCol,
              this._cols,
              this._margin,
              this._socket
            );
          case keys.down:
            return this._handleHistoryDown(
              this._input,
              this._historyIdx,
              this._history,
              this._cursorCol,
              this._cols,
              this._margin,
              this._socket
            );
          case keys.left:
            return this._handleCursorLeft(this._cursorCol, this._margin, this._cols);
          case keys.right:
            return this._handleCursorRight(this._cursorCol, this._margin, this._input, this._cols);
          case keys.home:
          case keys.ctrlA:
            return this._handleCursorHome(this._cursorCol, this._margin, this._cols);
          case keys.end:
          case keys.ctrlE:
            return this._handleCursorEnd(this._input, this._cursorCol, this._cols);
          case keys.ctrlU:
            return this._handleEraseToEnd(this._input, this._cursorCol, this._margin, this._cols, this._socket);
          default:
            return this._handleInsertChars(
              char,
              this._state,
              this._input,
              this._cursorCol,
              this._margin,
              this._cols,
              this._history,
              this._socket
            );
        }
      case "read":
        switch (char) {
          case keys.interrupt:
            return this._handleInterrupt(this._socket, this._state);
          case keys.enter:
            return this._handleSubmitRead(this._cursorCol, this._margin, this._input, this._cols, this._socket);
          case keys.ctrlH:
          case keys.backspace:
            return this._handleBackspace(
              this._cursorCol,
              this._margin,
              this._input,
              this._cols,
              this._state,
              this._socket
            );
          case keys.del:
            return this._handleDeleteForward(this._input, this._margin, this._cursorCol, this._state, this._socket);
          case keys.up:
          case keys.down:
            // History is only available for prompts
            return;
          case keys.left:
            return this._handleCursorLeft(this._cursorCol, this._margin, this._cols);
          case keys.right:
            return this._handleCursorRight(this._cursorCol, this._margin, this._input, this._cols);
          case keys.home:
          case keys.ctrlA:
          case keys.end:
          case keys.ctrlE:
          case keys.ctrlU:
            // Cursor jump and erase-to-end are only available for prompts
            return;
          default:
            return this._handleInsertChars(
              char,
              this._state,
              this._input,
              this._cursorCol,
              this._margin,
              this._cols,
              this._history,
              this._socket
            );
        }
    }
  }

  /** Submit the current prompt input, entering multi-line mode instead if it's unterminated */
  private _handleSubmitPrompt(
    input: string,
    history: string[],
    cursorCol: number,
    margin: number,
    cols: number,
    socket: WebSocket
  ): void {
    const recordHistory = input != "" && !input.includes("\r\n");
    // Remove the input from the existing history, then append it
    const newHistory = recordHistory ? [...history.filter((h) => h != input), input] : history;

    this._setHistory(newHistory, -1);
    // Check if we should enter multi-line mode
    if (isInputUnterminated(input)) {
      // Write the multi-line mode prompt to the terminal
      this._hideCursorWrite(`\r\n${this.multiLinePrompt}`);
      this._resetLine(input + "\r\n", this.multiLinePrompt.length);
    } else {
      // Reset first line tracker
      this._setFirstOutputLineSincePrompt(true);
      // Move cursor to the last line of the input, then send it to the server for processing
      const moveEscape = computeMoveToLastLineEscape(cursorCol, margin, input, cols);
      if (moveEscape) this._hideCursorWrite(moveEscape);
      socket.send(JSON.stringify({ type: "prompt", input }));
      this._hideCursorWrite(shellIntegrationSubmitEscape(input, this._nonce));
      if (input == "") this._setPromptExitCode("");
      this._setState("eval");
      this._resetLine("", 0);
    }
  }

  /** Submit the current READ input */
  private _handleSubmitRead(cursorCol: number, margin: number, input: string, cols: number, socket: WebSocket): void {
    // Reset first line tracker
    this._setFirstOutputLineSincePrompt(false);
    // Move cursor to the last line of the input, then send it to the server for processing
    const moveEscape = computeMoveToLastLineEscape(cursorCol, margin, input, cols);
    if (moveEscape) this._hideCursorWrite(moveEscape);
    socket.send(JSON.stringify({ type: "read", input }));
    this._setState("eval");
    this._resetLine("", 0);
  }

  /** Erase to the left */
  private _handleBackspace(
    cursorCol: number,
    margin: number,
    input: string,
    cols: number,
    state: "prompt" | "read" | "eval",
    socket: WebSocket
  ): void {
    if (cursorCol <= margin) {
      // Don't delete the prompt
      return;
    }
    const inputArr = input.split("\r\n");
    const trailingText = inputArr[inputArr.length - 1].slice(cursorCol - margin);
    inputArr[inputArr.length - 1] = inputArr[inputArr.length - 1].slice(0, cursorCol - margin - 1) + trailingText;
    const newInput = inputArr.join("\r\n");
    const move = computeCursorMove(cursorCol, cols, -1);
    this._hideCursorWrite(move.escape);
    this._hideCursorWrite(`\x1b7\x1b[0J${trailingText}\x1b8`);
    if (newInput != "" && state == "prompt") {
      // Syntax color input
      socket.send(JSON.stringify({ type: "color", input: newInput }));
    }
    this._setCursorCol(move.cursorCol);
    this._setInput(newInput);
  }

  /** Erase to the right */
  private _handleDeleteForward(
    input: string,
    margin: number,
    cursorCol: number,
    state: "prompt" | "read" | "eval",
    socket: WebSocket
  ): void {
    const inputArr = input.split("\r\n");
    if (margin + inputArr[inputArr.length - 1].length - cursorCol <= 0) {
      return;
    }
    const trailingText = inputArr[inputArr.length - 1].slice(cursorCol - margin + 1);
    inputArr[inputArr.length - 1] = inputArr[inputArr.length - 1].slice(0, cursorCol - margin) + trailingText;
    const newInput = inputArr.join("\r\n");
    this._hideCursorWrite(`\x1b7\x1b[0J${trailingText}\x1b8`);
    if (newInput != "" && state == "prompt") {
      // Syntax color input
      socket.send(JSON.stringify({ type: "color", input: newInput }));
    }
    this._setInput(newInput);
  }

  /** Scroll backwards through the history */
  private _handleHistoryUp(
    input: string,
    historyIdx: number,
    history: string[],
    cursorCol: number,
    cols: number,
    margin: number,
    socket: WebSocket
  ): void {
    if (input.includes("\r\n")) {
      // History only available for single-line input
      return;
    }
    let newHistoryIdx = historyIdx;
    if (newHistoryIdx == -1) {
      // Show the most recent input
      newHistoryIdx = history.length - 1;
    } else if (newHistoryIdx == 0) {
      // This is the end of our history
      newHistoryIdx = -2;
    } else if (newHistoryIdx == -2) {
      // We hit the end of our history
      return;
    } else {
      // Scroll back one more input
      newHistoryIdx--;
    }
    let newInput: string;
    if (newHistoryIdx >= 0) {
      newInput = history[newHistoryIdx];
    } else if (newHistoryIdx == -1) {
      // There is no history, so do nothing
      return;
    } else {
      // If we hit the end, leave the input blank
      newInput = "";
    }
    // Move cursor to start of input, clear everything, then write new input
    const move = computeCursorMove(cursorCol, cols, margin - cursorCol);
    this._hideCursorWrite(move.escape);
    this._hideCursorWrite(`\x1b[0J${newInput}`);
    if (newInput != "") {
      // Syntax color input
      socket.send(JSON.stringify({ type: "color", input: newInput }));
    }
    this._setHistoryIdx(newHistoryIdx);
    this._setInputAndCursorCol(newInput, margin + newInput.length);
  }

  /** Scroll forwards through the history */
  private _handleHistoryDown(
    input: string,
    historyIdx: number,
    history: string[],
    cursorCol: number,
    cols: number,
    margin: number,
    socket: WebSocket
  ): void {
    if (input.includes("\r\n")) {
      // History only available for single-line input
      return;
    }
    let newHistoryIdx = historyIdx;
    if (newHistoryIdx == -1) {
      // We're not in the history
      return;
    } else if (newHistoryIdx == -2) {
      // We hit the end of our history
      newHistoryIdx = 0;
    } else if (newHistoryIdx == history.length - 1) {
      // We hit the beginning of our history
      newHistoryIdx = -1;
    } else {
      newHistoryIdx++;
    }
    const newInput = newHistoryIdx != -1 ? history[newHistoryIdx] : "";
    // Move cursor to start of input, clear everything, then write new input
    const move = computeCursorMove(cursorCol, cols, margin - cursorCol);
    this._hideCursorWrite(move.escape);
    this._hideCursorWrite(`\x1b[0J${newInput}`);
    if (newInput != "") {
      // Syntax color input
      socket.send(JSON.stringify({ type: "color", input: newInput }));
    }
    this._setHistoryIdx(newHistoryIdx);
    this._setInputAndCursorCol(newInput, margin + newInput.length);
  }

  /** Move the cursor back one column */
  private _handleCursorLeft(cursorCol: number, margin: number, cols: number): void {
    if (cursorCol > margin) {
      if (cursorCol % cols == 0) {
        // Move the cursor to the end of the previous line
        this._hideCursorWrite(`${actions.cursorUp}\x1b[${cols}G`);
      } else {
        // Move the cursor back one column
        this._hideCursorWrite(actions.cursorBack);
      }
      this._setCursorCol(cursorCol - 1);
    }
  }

  /** Move the cursor forward one column */
  private _handleCursorRight(cursorCol: number, margin: number, input: string, cols: number): void {
    if (cursorCol < margin + input.split("\r\n").pop()!.length) {
      const newCursorCol = cursorCol + 1;
      if (newCursorCol % cols == 0) {
        // Move the cursor to the beginning of the next line
        this._hideCursorWrite("\x1b[1E");
      } else {
        // Move the cursor forward one column
        this._hideCursorWrite(actions.cursorForward);
      }
      this._setCursorCol(newCursorCol);
    }
  }

  /** Send an interrupt to the server and return to the eval state */
  private _handleInterrupt(socket: WebSocket, state: "prompt" | "read" | "eval"): void {
    // Send interrupt message
    socket.send(JSON.stringify({ type: "interrupt" }));
    const wasPrompting = state == "prompt";
    if (wasPrompting) {
      this._hideCursorWrite("\r\n");
    }
    this._setInput("");
    // Reset first line tracker
    if (wasPrompting) this._setFirstOutputLineSincePrompt(true);
    this._setState("eval");
  }

  /** Move the cursor to the beginning of the input */
  private _handleCursorHome(cursorCol: number, margin: number, cols: number): void {
    if (cursorCol - margin > 0) {
      const move = computeCursorMove(cursorCol, cols, margin - cursorCol);
      this._hideCursorWrite(move.escape);
      this._setCursorCol(move.cursorCol);
    }
  }

  /** Move the cursor to the end of the input */
  private _handleCursorEnd(input: string, cursorCol: number, cols: number): void {
    const lineLength = input.split("\r\n").pop()!.length;
    if (lineLength > cursorCol) {
      const move = computeCursorMove(cursorCol, cols, lineLength - cursorCol);
      this._hideCursorWrite(move.escape);
      this._setCursorCol(move.cursorCol);
    }
  }

  /** Erase the input if the cursor is at the end of it */
  private _handleEraseToEnd(input: string, cursorCol: number, margin: number, cols: number, socket: WebSocket): void {
    const inputArr = input.split("\r\n");
    if (cursorCol != margin + inputArr[inputArr.length - 1].length) {
      return;
    }
    // Move the cursor to the beginning of the input
    const move = computeCursorMove(cursorCol, cols, margin - cursorCol);
    this._hideCursorWrite(move.escape);
    // Erase everything to the right of the cursor
    this._hideCursorWrite("\x1b[0J");
    inputArr[inputArr.length - 1] = "";
    const newInput = inputArr.join("\r\n");
    if (newInput != "") {
      // Syntax color input
      socket.send(JSON.stringify({ type: "color", input: newInput }));
    }
    this._setCursorCol(move.cursorCol);
    this._setInput(newInput);
  }

  /** Insert one or more typed characters into the input at the cursor position */
  private _handleInsertChars(
    char: string,
    state: "prompt" | "read" | "eval",
    input: string,
    cursorCol: number,
    margin: number,
    cols: number,
    history: string[],
    socket: WebSocket
  ): void {
    const normalized = normalizeTypedChars(char, state, this.multiLinePrompt);
    const inserted = computeInsertedInput(input, cursorCol, margin, normalized.char);
    const move = computeInsertMove(cursorCol, cols, margin, state, normalized.char, this.multiLinePrompt);
    const displayChar = wrapForReadMode(move.char + inserted.trailingText, cols, cursorCol, state);

    // Save the cursor position, write the text, restore the cursor position, then move the cursor manually
    this._hideCursorWrite(`\x1b7${inserted.eraseAfterCursor}${displayChar}\x1b8${move.escape}`);

    if (normalized.submit) {
      const isPrompt = state == "prompt";
      if (isPrompt) {
        // Remove the input from the existing history, then append it, and reset historyIdx
        const newHistory =
          inserted.newInput != "" && !inserted.newInput.includes("\r\n")
            ? [...history.filter((h) => h != inserted.newInput), inserted.newInput]
            : history;
        this._setHistory(newHistory, -1);
        // Reset first line tracker
        this._setFirstOutputLineSincePrompt(true);
      } else {
        // Reset first line tracker
        this._setFirstOutputLineSincePrompt(false);
      }
      // Move cursor to the last line of the input, then send it to the server for processing
      const moveEscape = computeMoveToLastLineEscape(move.newCursorCol, move.newMargin, inserted.newInput, cols);
      if (moveEscape) this._hideCursorWrite(moveEscape);
      socket.send(JSON.stringify({ type: state, input: inserted.newInput }));
      if (isPrompt) {
        this._hideCursorWrite(shellIntegrationSubmitEscape(inserted.newInput, this._nonce));
        if (inserted.newInput == "") this._setPromptExitCode("");
      }
      this._setState("eval");
      this._resetLine("", 0);
    } else {
      this._setInput(inserted.newInput);
      this._setMargin(move.newMargin);
      this._setCursorCol(move.newCursorCol);
      if (inserted.newInput != "" && state == "prompt") {
        // Syntax color input
        socket.send(JSON.stringify({ type: "color", input: inserted.newInput }));
      }
    }
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (this._state != "eval" && this._input != "") {
      // Move the cursor to the correct new position
      const move = computeCursorMove(this._cursorCol, this._cols, 0, dimensions.columns - this._cols);
      this._hideCursorWrite(move.escape);
      // Save the cursor position, move the cursor to just after the margin,
      // clear the screen from that point, write the input, then restore the cursor
      let cursorLine = Math.ceil((this._cursorCol + 1) / move.cols) - 1;
      if (this._input.includes("\r\n")) {
        const lines = this._input.split("\r\n");
        lines.pop();
        cursorLine += lines.reduce((sum, line) => sum + Math.ceil((line.length + 1) / move.cols), 0);
      }
      this._hideCursorWrite(
        `\x1b7${cursorLine > 0 ? `\x1b[${cursorLine}A` : ""}\r\x1b[${this._margin}C\x1b[0J${this._input.replace(
          /\r\n/g,
          `\r\n${this.multiLinePrompt}`
        )}\x1b8`
      );
      if (this._state == "prompt") {
        // Syntax color input
        this._socket.send(JSON.stringify({ type: "color", input: this._input }));
      }
      this._setCols(move.cols);
    } else {
      this._setCols(dimensions.columns);
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
  throwErrors: boolean,
  nsOverride?: string
): vscode.ExtensionTerminalOptions | undefined {
  // Make sure the server connection is active
  if (!api.active || api.ns == "") {
    reportError("Lite Terminal requires an active server connection.", throwErrors);
    return;
  }
  // Make sure the server has the terminal endpoint
  if (api.config.apiVersion! < 7) {
    reportError("Lite Terminal requires InterSystems IRIS version 2023.2 or above.", throwErrors);
    return;
  }

  sendLiteTerminalTelemetryEvent(throwErrors ? "profile" : "command");
  const nonce = crypto.randomUUID();
  return {
    name: api.config.serverName && api.config.serverName != "" ? api.config.serverName : "iris",
    location:
      // Mimic what a built-in profile does. When it is the default and the Terminal tab is selected while empty,
      // a terminal is always created in the Panel.
      vscode.workspace.getConfiguration("terminal.integrated", targetUri).get("defaultLocation") === "editor" &&
      vscode.window.terminals.length > 0
        ? vscode.TerminalLocation.Editor
        : vscode.TerminalLocation.Panel,
    pty: new WebSocketTerminal(targetUri, nonce, nsOverride),
    isTransient: true,
    iconPath: iscIcon,
    shellIntegrationNonce: nonce,
  };
}

export async function launchWebSocketTerminal(targetUri?: vscode.Uri | null, nsOverride?: string): Promise<void> {
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
    if (targetUri === undefined) {
      vscode.window.showErrorMessage(NO_ELIGIBLE_CONNECTIONS);
    }
    if (!targetUri) return;
  }
  const api = new AtelierAPI(targetUri);

  // Guarantee that we know the apiVersion of the server and that cookies are fresh
  await api.serverInfo();

  // Get the terminal configuration
  const terminalOpts = terminalConfigForUri(api, targetUri, false, nsOverride);
  if (terminalOpts) {
    // Launch the terminal
    const terminal = vscode.window.createTerminal(terminalOpts);
    terminal.show();
  }
}

export class WebSocketTerminalProfileProvider implements vscode.TerminalProfileProvider {
  async provideTerminalProfile(): Promise<vscode.TerminalProfile> {
    // Determine the server connection to use
    const uri: vscode.Uri | null | undefined = await getWsServerConnection("2023.2.0");

    if (uri) {
      const api = new AtelierAPI(uri);
      // Ensure cookies aren't stale because a 401 error will kill the terminal with no error log
      await api.serverInfo();
      // Get the terminal configuration. Will throw if there's an error.
      const terminalOpts = terminalConfigForUri(api, uri, true);
      return new vscode.TerminalProfile(terminalOpts!);
    } else if (uri === undefined) {
      throw new Error(NO_ELIGIBLE_CONNECTIONS);
    } else {
      throw new Error("No connection was chosen.");
    }
  }
}
