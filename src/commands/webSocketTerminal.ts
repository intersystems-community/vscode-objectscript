import * as vscode from "vscode";
import WebSocket = require("ws");

import { AtelierAPI } from "../api";
import { currentFile, outputChannel } from "../utils";

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

  open(): void {
    try {
      // Open the WebSocket
      this._socket = new WebSocket(this._api.terminalUrl(), {
        rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
        headers: {
          cookie: this._api.cookies,
        },
      });
    } catch (error) {
      outputChannel.appendLine(
        typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
      );
      outputChannel.show(true);
      vscode.window.showErrorMessage(
        "Failed to initialize WebSocket Terminal. Check 'ObjectScript' Output channel for details.",
        "Dismiss"
      );
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
        outputChannel.appendLine(`WebSocket error: ${error.toString()}`);
        outputChannel.show(true);
        vscode.window.showErrorMessage(
          "WebSocket Terminal failed. Check 'ObjectScript' Output channel for details.",
          "Dismiss"
        );
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
            outputChannel.appendLine(message.text);
            outputChannel.show(true);
            vscode.window.showErrorMessage(
              "WebSocket Terminal failed. Check 'ObjectScript' Output channel for details.",
              "Dismiss"
            );
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
              this._margin = this._cursorCol = message.text.length;
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
            const lines = message.text.split("\r\n").length;
            if (lines > 1) {
              this._hideCursorWrite(
                `\x1b7\x1b[${lines - 1}A\r\x1b[0J${this._prompt}${message.text.replace(
                  /\r\n/g,
                  `\r\n${this._multiLinePrompt}`
                )}\x1b8`
              );
            } else {
              this._hideCursorWrite(`\x1b7\x1b[2K\r${this._prompt}${message.text}\x1b8`);
            }
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
        inputArr[inputArr.length - 1] =
          inputArr[inputArr.length - 1].slice(0, this._cursorCol - this._margin - 1) +
          inputArr[inputArr.length - 1].slice(this._cursorCol - this._margin);
        this._input = inputArr.join("\r\n");
        this._cursorCol--;
        this._hideCursorWrite(actions.cursorBack + actions.deleteChar);
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
          inputArr[inputArr.length - 1] =
            inputArr[inputArr.length - 1].slice(0, this._cursorCol - this._margin) +
            inputArr[inputArr.length - 1].slice(this._cursorCol - this._margin + 1);
          this._input = inputArr.join("\r\n");
          this._hideCursorWrite(actions.cursorForward + actions.deleteChar + actions.cursorBack);
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
        const oldInput = this._input;
        if (this._historyIdx >= 0) {
          this._input = this._history[this._historyIdx];
        } else if (this._historyIdx == -1) {
          // There is no history, so do nothing
          return;
        } else {
          // If we hit the end, leave the input blank
          this._input = "";
        }
        this._cursorCol = this._margin + this._input.length;
        this._hideCursorWrite(`${oldInput.length ? `\x1b[${oldInput.length}D\x1b[0K` : ""}${this._input}`);
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
        const oldInput = this._input;
        if (this._historyIdx != -1) {
          this._input = this._history[this._historyIdx];
        } else {
          // If we hit the beginning, leave the input blank
          this._input = "";
        }
        this._cursorCol = this._margin + this._input.length;
        this._hideCursorWrite(`${oldInput.length ? `\x1b[${oldInput.length}D\x1b[0K` : ""}${this._input}`);
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
          // Move the cursor back one column
          this._cursorCol--;
          this._hideCursorWrite(actions.cursorBack);
        }
        return;
      }
      case keys.right: {
        if (this._state == "eval") {
          // User can't move cursor
          return;
        }
        if (this._cursorCol < this._margin + this._input.length) {
          // Move the cursor forward one column
          this._cursorCol++;
          this._hideCursorWrite(actions.cursorForward);
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
      case keys.ctrlA: {
        if (this._state == "prompt" && this._cursorCol - this._margin > 0) {
          // Move the cursor to the beginning of the line
          this._hideCursorWrite(`\x1b[${this._cursorCol - this._margin}D`);
          this._cursorCol = this._margin;
        }
        return;
      }
      case keys.ctrlE: {
        if (this._state == "prompt") {
          // Move the cursor to the end of the line
          const inputArr = this._input.split("\r\n");
          if (this._margin + inputArr[inputArr.length - 1].length - this._cursorCol > 0) {
            this._hideCursorWrite(`\x1b[${this._margin + inputArr[inputArr.length - 1].length - this._cursorCol}C`);
            this._cursorCol = this._margin + inputArr[inputArr.length - 1].length;
          }
        }
        return;
      }
      case keys.ctrlU: {
        if (this._state == "prompt") {
          // Erase the line if the cursor is at the end
          const inputArr = this._input.split("\r\n");
          if (this._cursorCol == this._margin + inputArr[inputArr.length - 1].length) {
            this._hideCursorWrite(`\x1b[2K\r${inputArr.length > 1 ? this._multiLinePrompt : this._prompt}`);
            this._cursorCol = this._margin;
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
        char = char.replace(/\r/, this._state == "prompt" ? "\r\n" : " ");
        const inputArr = this._input.split("\r\n");
        if (this._cursorCol < this._margin + inputArr[inputArr.length - 1].length) {
          // Insert the new char(s)
          inputArr[inputArr.length - 1] = `${inputArr[inputArr.length - 1].slice(
            0,
            this._cursorCol - this._margin
          )}${char}${inputArr[inputArr.length - 1].slice(this._cursorCol - this._margin)}`;
          this._input = inputArr.join("\r\n");
          this._cursorCol += char.length;
          this._hideCursorWrite(`\x1b[4h${char.replace(/\r\n/g, `\r\n${this._multiLinePrompt}`)}\x1b[4l`);
        } else {
          // Append the new char(s)
          this._input += char;
          this._cursorCol += char.length;
          this._hideCursorWrite(char.replace(/\r\n/g, `\r\n${this._multiLinePrompt}`));
        }
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
}

function terminalConfigForUri(api: AtelierAPI, extensionUri: vscode.Uri): vscode.ExtensionTerminalOptions | undefined {
  // Make sure the server connection is active
  if (!api.active || api.ns == "") {
    vscode.window.showErrorMessage("WebSocket Terminal requires an active server connection.", "Dismiss");
    return;
  }
  // Make sure the server has the terminal endpoint
  if (api.config.apiVersion < 7) {
    vscode.window.showErrorMessage("WebSocket Terminal requires Atelier API version 7 or above.", "Dismiss");
    return;
  }

  return {
    name: api.config.serverName && api.config.serverName != "" ? api.config.serverName : "iris",
    location: vscode.TerminalLocation.Panel,
    pty: new WebSocketTerminal(api),
    isTransient: true,
    iconPath: vscode.Uri.joinPath(extensionUri, "images", "fileIcon.svg"),
  };
}

export async function launchWebSocketTerminal(extensionUri: vscode.Uri): Promise<void> {
  // Determine the server to connect to
  const api = new AtelierAPI(currentFile()?.uri);

  // Get the terminal configuration
  const terminalOpts = terminalConfigForUri(api, extensionUri);
  if (terminalOpts) {
    // Launch the terminal
    const terminal = vscode.window.createTerminal(terminalOpts);
    terminal.show();
  }
}

export class WebSocketTerminalProfileProvider implements vscode.TerminalProfileProvider {
  constructor(private readonly _extensionUri: vscode.Uri) {}

  async provideTerminalProfile(token: vscode.CancellationToken): Promise<vscode.TerminalProfile> {
    // Determine the server connection to use
    let uri: vscode.Uri;
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    if (workspaceFolders.length == 0) {
      vscode.window.showErrorMessage("WebSocket Terminal requires an open workspace.", "Dismiss");
    } else if (workspaceFolders.length == 1) {
      // Use the current connection
      uri = workspaceFolders[0].uri;
    } else {
      // Pick from the workspace folders
      uri = (
        await vscode.window.showWorkspaceFolderPick({
          ignoreFocusOut: true,
          placeHolder: "Pick the workspace folder to get server connection info from.",
        })
      )?.uri;
    }

    if (uri) {
      // Get the terminal configuration
      const terminalOpts = terminalConfigForUri(new AtelierAPI(uri), this._extensionUri);
      if (terminalOpts) {
        return new vscode.TerminalProfile(terminalOpts);
      }
    }
  }
}
