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

/** The subset of `WebSocketTerminal`'s fields that a `handleInput` key handler can read and change */
interface HandlerState {
  margin: number;
  input: string;
  cursorCol: number;
  history: string[];
  historyIdx: number;
  mode: "prompt" | "read" | "eval";
  firstOutputLineSincePrompt: boolean;
  promptExitCode: string;
}

/** The result of a key handler: the next state, terminal writes to perform, and an optional message to send */
interface HandlerEffect {
  state: HandlerState;
  writes: string[];
  send?: Record<string, unknown>;
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
  // Work out the adjustment
  const newCursorCol = cursorColDelta != 0 ? cursorCol + cursorColDelta : cursorCol;
  const newCols = cursorColDelta != 0 ? cols : cols + colsDelta;
  // Calculate the row/column number of the new position
  const newCol = newCursorCol % newCols;
  // Move the cursor
  const rowDelta = (newCursorCol - newCol) / newCols - (cursorCol - currCol) / cols;
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
  const rowDelta =
    Math.ceil((margin + input.split("\r\n").pop()!.length + 1) / cols) - 1 - (cursorCol - (cursorCol % cols)) / cols;
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
  const rowDelta = newRow - (cursorCol - currCol) / cols;
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

/** Submit the current prompt input, entering multi-line mode instead if it's unterminated */
function handleSubmitPrompt(state: HandlerState, cols: number, nonce: string, multiLinePrompt: string): HandlerEffect {
  const { input, history, cursorCol, margin } = state;
  // Remove the input from the existing history, then append it
  const newHistory = input != "" && !input.includes("\r\n") ? [...history.filter((h) => h != input), input] : history;
  // Check if we should enter multi-line mode
  const unterminated = isInputUnterminated(input);
  // Move cursor to the last line of the input, then send it to the server for processing
  const moveEscape = computeMoveToLastLineEscape(cursorCol, margin, input, cols);
  const newMargin = unterminated ? multiLinePrompt.length : 0;

  const writes: string[] = [];
  let send: Record<string, unknown> | undefined;
  if (unterminated) {
    // Write the multi-line mode prompt to the terminal
    writes.push(`\r\n${multiLinePrompt}`);
  } else {
    if (moveEscape) writes.push(moveEscape);
    send = { type: "prompt", input };
    writes.push(shellIntegrationSubmitEscape(input, nonce));
  }

  return {
    state: {
      ...state,
      history: newHistory,
      historyIdx: -1,
      input: unterminated ? input + "\r\n" : "",
      margin: newMargin,
      cursorCol: newMargin,
      mode: unterminated ? state.mode : "eval",
      // Reset first line tracker
      firstOutputLineSincePrompt: unterminated ? state.firstOutputLineSincePrompt : true,
      promptExitCode: !unterminated && input == "" ? "" : state.promptExitCode,
    },
    writes,
    send,
  };
}

/** Submit the current READ input */
function handleSubmitRead(state: HandlerState, cols: number): HandlerEffect {
  const { cursorCol, margin, input } = state;
  // Move cursor to the last line of the input, then send it to the server for processing
  const moveEscape = computeMoveToLastLineEscape(cursorCol, margin, input, cols);

  return {
    state: {
      ...state,
      // Reset first line tracker
      firstOutputLineSincePrompt: false,
      mode: "eval",
      input: "",
      margin: 0,
      cursorCol: 0,
    },
    writes: moveEscape ? [moveEscape] : [],
    send: { type: "read", input },
  };
}

/** Erase to the left */
function handleBackspace(state: HandlerState, cols: number): HandlerEffect {
  const { cursorCol, margin, input, mode } = state;
  if (cursorCol <= margin) {
    // Don't delete the prompt
    return { state, writes: [] };
  }
  const inputArr = input.split("\r\n");
  const trailingText = inputArr[inputArr.length - 1].slice(cursorCol - margin);
  inputArr[inputArr.length - 1] = inputArr[inputArr.length - 1].slice(0, cursorCol - margin - 1) + trailingText;
  const newInput = inputArr.join("\r\n");
  const move = computeCursorMove(cursorCol, cols, -1);

  return {
    state: { ...state, cursorCol: move.cursorCol, input: newInput },
    writes: [move.escape, `\x1b7\x1b[0J${trailingText}\x1b8`],
    // Syntax color input
    send: newInput != "" && mode == "prompt" ? { type: "color", input: newInput } : undefined,
  };
}

/** Erase to the right */
function handleDeleteForward(state: HandlerState): HandlerEffect {
  const { input, margin, cursorCol, mode } = state;
  const inputArr = input.split("\r\n");
  if (margin + inputArr[inputArr.length - 1].length - cursorCol <= 0) {
    return { state, writes: [] };
  }
  const trailingText = inputArr[inputArr.length - 1].slice(cursorCol - margin + 1);
  inputArr[inputArr.length - 1] = inputArr[inputArr.length - 1].slice(0, cursorCol - margin) + trailingText;
  const newInput = inputArr.join("\r\n");

  return {
    state: { ...state, input: newInput },
    writes: [`\x1b7\x1b[0J${trailingText}\x1b8`],
    // Syntax color input
    send: newInput != "" && mode == "prompt" ? { type: "color", input: newInput } : undefined,
  };
}

/** Scroll backwards through the history */
function handleHistoryUp(state: HandlerState, cols: number): HandlerEffect {
  const { input, historyIdx, history, cursorCol, margin } = state;
  if (input.includes("\r\n")) {
    // History only available for single-line input
    return { state, writes: [] };
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
    return { state, writes: [] };
  } else {
    // Scroll back one more input
    newHistoryIdx--;
  }
  let newInput: string;
  if (newHistoryIdx >= 0) {
    newInput = history[newHistoryIdx];
  } else if (newHistoryIdx == -1) {
    // There is no history, so do nothing
    return { state, writes: [] };
  } else {
    // If we hit the end, leave the input blank
    newInput = "";
  }

  return {
    state: { ...state, historyIdx: newHistoryIdx, input: newInput, cursorCol: margin + newInput.length },
    // Move cursor to start of input, clear everything, then write new input
    writes: [computeCursorMove(cursorCol, cols, margin - cursorCol).escape, `\x1b[0J${newInput}`],
    // Syntax color input
    send: newInput != "" ? { type: "color", input: newInput } : undefined,
  };
}

/** Scroll forwards through the history */
function handleHistoryDown(state: HandlerState, cols: number): HandlerEffect {
  const { input, historyIdx, history, cursorCol, margin } = state;
  if (input.includes("\r\n")) {
    // History only available for single-line input
    return { state, writes: [] };
  }
  let newHistoryIdx = historyIdx;
  if (newHistoryIdx == -1) {
    // We're not in the history
    return { state, writes: [] };
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

  return {
    state: { ...state, historyIdx: newHistoryIdx, input: newInput, cursorCol: margin + newInput.length },
    // Move cursor to start of input, clear everything, then write new input
    writes: [computeCursorMove(cursorCol, cols, margin - cursorCol).escape, `\x1b[0J${newInput}`],
    // Syntax color input
    send: newInput != "" ? { type: "color", input: newInput } : undefined,
  };
}

/** Move the cursor back one column */
function handleCursorLeft(state: HandlerState, cols: number): HandlerEffect {
  const { cursorCol, margin } = state;
  if (cursorCol <= margin) {
    return { state, writes: [] };
  }
  const wrapsToPrevLine = cursorCol % cols == 0;

  return {
    state: { ...state, cursorCol: cursorCol - 1 },
    // Move the cursor to the end of the previous line, or back one column
    writes: [wrapsToPrevLine ? `${actions.cursorUp}\x1b[${cols}G` : actions.cursorBack],
  };
}

/** Move the cursor forward one column */
function handleCursorRight(state: HandlerState, cols: number): HandlerEffect {
  const { cursorCol, margin, input } = state;
  if (cursorCol >= margin + input.split("\r\n").pop()!.length) {
    return { state, writes: [] };
  }
  const newCursorCol = cursorCol + 1;
  const wrapsToNextLine = newCursorCol % cols == 0;

  return {
    state: { ...state, cursorCol: newCursorCol },
    // Move the cursor to the beginning of the next line, or forward one column
    writes: [wrapsToNextLine ? "\x1b[1E" : actions.cursorForward],
  };
}

/** Send an interrupt to the server and return to the eval state */
function handleInterrupt(state: HandlerState): HandlerEffect {
  const wasPrompting = state.mode == "prompt";

  return {
    state: {
      ...state,
      input: "",
      mode: "eval",
      // Reset first line tracker
      firstOutputLineSincePrompt: wasPrompting ? true : state.firstOutputLineSincePrompt,
    },
    writes: wasPrompting ? ["\r\n"] : [],
    // Send interrupt message
    send: { type: "interrupt" },
  };
}

/** Move the cursor to the beginning of the input */
function handleCursorHome(state: HandlerState, cols: number): HandlerEffect {
  const { cursorCol, margin } = state;
  if (cursorCol - margin <= 0) {
    return { state, writes: [] };
  }
  const move = computeCursorMove(cursorCol, cols, margin - cursorCol);

  return {
    state: { ...state, cursorCol: move.cursorCol },
    writes: [move.escape],
  };
}

/** Move the cursor to the end of the input */
function handleCursorEnd(state: HandlerState, cols: number): HandlerEffect {
  const { input, cursorCol } = state;
  const lineLength = input.split("\r\n").pop()!.length;
  if (lineLength <= cursorCol) {
    return { state, writes: [] };
  }
  const move = computeCursorMove(cursorCol, cols, lineLength - cursorCol);

  return {
    state: { ...state, cursorCol: move.cursorCol },
    writes: [move.escape],
  };
}

/** Erase the input if the cursor is at the end of it */
function handleEraseToEnd(state: HandlerState, cols: number): HandlerEffect {
  const { input, cursorCol, margin } = state;
  const inputArr = input.split("\r\n");
  if (cursorCol != margin + inputArr[inputArr.length - 1].length) {
    return { state, writes: [] };
  }
  const move = computeCursorMove(cursorCol, cols, margin - cursorCol);
  inputArr[inputArr.length - 1] = "";
  const newInput = inputArr.join("\r\n");

  return {
    state: { ...state, cursorCol: move.cursorCol, input: newInput },
    writes: [
      // Move the cursor to the beginning of the input
      move.escape,
      // Erase everything to the right of the cursor
      "\x1b[0J",
    ],
    // Syntax color input
    send: newInput != "" ? { type: "color", input: newInput } : undefined,
  };
}

/**
 * Insert one or more already-normalized characters into the input at the cursor position.
 * `char` must never contain a trailing submit marker — callers handle submission separately.
 */
function handleInsertChars(state: HandlerState, char: string, cols: number, multiLinePrompt: string): HandlerEffect {
  const { input, cursorCol, margin, mode } = state;
  const inserted = computeInsertedInput(input, cursorCol, margin, char);
  const move = computeInsertMove(cursorCol, cols, margin, mode, char, multiLinePrompt);
  const isPrompt = mode == "prompt";

  return {
    state: { ...state, input: inserted.newInput, margin: move.newMargin, cursorCol: move.newCursorCol },
    // Save the cursor position, write the text, restore the cursor position, then move the cursor manually
    writes: [
      `\x1b7${inserted.eraseAfterCursor}${wrapForReadMode(
        move.char + inserted.trailingText,
        cols,
        cursorCol,
        mode
      )}\x1b8${move.escape}`,
    ],
    // Syntax color input
    send: inserted.newInput != "" && isPrompt ? { type: "color", input: inserted.newInput } : undefined,
  };
}

/** Write a chunk of the server's evaluation output, tracking exit code and cursor position as it streams in */
function handleOutputMessage(state: HandlerState, text: string): HandlerEffect {
  // Strip leading \r\n since we printed it already
  const stripped = state.firstOutputLineSincePrompt && text.startsWith("\r\n") ? text.slice(2) : text;
  const isInterrupt = stripped.includes("\x1b[31;1m<INTERRUPT>");
  const lastLineLength = stripped.split("\r\n").pop()!.length;

  return {
    state: {
      ...state,
      // The first output line has now been written, if it hadn't already
      firstOutputLineSincePrompt: false,
      // Report no exit code for interrupts
      promptExitCode: isInterrupt ? "" : stripped.includes("\x1b[31;1m") ? ";1" : state.promptExitCode,
      margin: lastLineLength,
      cursorCol: lastLineLength,
    },
    writes: [stripped],
  };
}

/** Write the next prompt and switch into "prompt" mode */
function handlePromptMessage(state: HandlerState, text: string, colorsRegex: RegExp): HandlerEffect {
  const promptLength = text.replace(colorsRegex, "").length;

  return {
    state: { ...state, margin: promptLength, cursorCol: promptLength, promptExitCode: ";0", mode: "prompt" },
    // Write the prompt to the terminal
    writes: [`\x1b]633;D${state.promptExitCode}\x07\r\n\x1b]633;A\x07${text}\x1b]633;B\x07`],
  };
}

/** Switch into "read" mode to accept the server's requested input */
function handleReadMessage(state: HandlerState): HandlerEffect {
  return { state: { ...state, mode: "read" }, writes: [] };
}

class WebSocketTerminal implements vscode.Pseudoterminal {
  private _writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this._writeEmitter.event;
  private _closeEmitter = new vscode.EventEmitter<void>();
  onDidClose: vscode.Event<void> = this._closeEmitter.event;

  /** The fields that key handlers (and the "output"/"prompt"/"read" messages) read and change */
  private _handlerState: HandlerState = {
    margin: 0,
    input: "",
    cursorCol: 0,
    history: [],
    historyIdx: -1,
    mode: "eval",
    firstOutputLineSincePrompt: true,
    promptExitCode: ";0",
  };

  /** The `text` of the last `prompt` message sent by the server */
  private _prompt = "";

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

  /** Hide the cursor, write `data` to the terminal, then show the cursor again. */
  private _write(data: string): void {
    this._writeEmitter.fire(`\x1b[?25l${data}\x1b[?25h`);
  }

  /** Compute a key handler's effect from the current state, then apply it: update state, write, send if any */
  private _applyEffect(f: (state: HandlerState) => HandlerEffect): void {
    const effect = f(this._handlerState);
    this._handlerState = effect.state;
    for (const write of effect.writes) this._write(write);
    if (effect.send) this._socket.send(JSON.stringify(effect.send));
  }

  /** Insert typed/pasted text, then submit it if it ended with a shell-integration submit marker */
  private _insertAndSubmitIfNeeded(char: string, mode: "prompt" | "read"): void {
    const { char: normalizedChar, submit } = normalizeTypedChars(char, mode, this.multiLinePrompt);
    this._applyEffect((state) => handleInsertChars(state, normalizedChar, this._cols, this.multiLinePrompt));
    if (submit) {
      this._applyEffect((state) =>
        mode == "prompt"
          ? handleSubmitPrompt(state, this._cols, this._nonce, this.multiLinePrompt)
          : handleSubmitRead(state, this._cols)
      );
    }
  }

  open(initialDimensions?: vscode.TerminalDimensions): void {
    const api = new AtelierAPI(this.targetUri);
    if (this._nsOverride) api.setNamespace(this._nsOverride);
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
    this._write("\x1b]633;P;HasRichCommandDetection=True\x07");
    // Print the opening message
    const username = api.config.auth.username;
    this._write(
      `\x1b[32mConnected to \x1b[0m\x1b[4m${api.config.host}:${api.config.port}${api.config.pathPrefix}\x1b[0m\x1b[32m ${
        username.includes("*")
          ? `using \x1b[0m\x1b[3m${username.slice(1, -1)}\x1b[0m\r\n`
          : `as \x1b[0m\x1b[3m${username}\x1b[0m\r\n`
      }`
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
          case "output":
            this._applyEffect((state) => handleOutputMessage(state, message.text!));
            break;
          case "prompt":
            this._applyEffect((state) => handlePromptMessage(state, message.text!, this._colorsRegex));
            this._prompt = message.text!;
            // Store the current namespace
            this.currentNs = message.ns!;
            break;
          case "read":
            this._applyEffect(handleReadMessage);
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
            // A late reply for input that's already been submitted; nothing to redraw
            if (this._handlerState.mode != "prompt") break;
            // Replace the input with the syntax colored text, keeping the cursor at the same spot
            let cursorLine = Math.ceil((this._handlerState.cursorCol + 1) / this._cols) - 1;
            if (message.text!.includes("\r\n")) {
              const lines = message.text!.replace(this._colorsRegex, "").split("\r\n");
              lines.pop();
              cursorLine += lines.reduce((sum, line) => sum + Math.ceil((line.length + 1) / this._cols), 0);
            }
            this._write(
              `\x1b7${cursorLine > 0 ? `\x1b[${cursorLine}A` : ""}\r\x1b[0J${this._prompt}${message.text!.replace(
                /\r\n/g,
                `\r\n${this.multiLinePrompt}`
              )}\x1b8`
            );
            break;
          }
        }
      });
    this._cols = initialDimensions?.columns ?? 100000;
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

  handleInput(char: string): void {
    // Interrupt is always accepted, regardless of mode
    if (char == keys.interrupt) return this._applyEffect(handleInterrupt);
    switch (this._handlerState.mode) {
      case "eval":
        // Terminal is already evaluating user input; no input is accepted, except to interrupt it
        return;
      case "prompt":
        switch (char) {
          case keys.enter:
            return this._applyEffect((state) =>
              handleSubmitPrompt(state, this._cols, this._nonce, this.multiLinePrompt)
            );
          case keys.ctrlH:
          case keys.backspace:
            return this._applyEffect((state) => handleBackspace(state, this._cols));
          case keys.del:
            return this._applyEffect(handleDeleteForward);
          case keys.up:
            return this._applyEffect((state) => handleHistoryUp(state, this._cols));
          case keys.down:
            return this._applyEffect((state) => handleHistoryDown(state, this._cols));
          case keys.left:
            return this._applyEffect((state) => handleCursorLeft(state, this._cols));
          case keys.right:
            return this._applyEffect((state) => handleCursorRight(state, this._cols));
          case keys.home:
          case keys.ctrlA:
            return this._applyEffect((state) => handleCursorHome(state, this._cols));
          case keys.end:
          case keys.ctrlE:
            return this._applyEffect((state) => handleCursorEnd(state, this._cols));
          case keys.ctrlU:
            return this._applyEffect((state) => handleEraseToEnd(state, this._cols));
          default:
            return this._insertAndSubmitIfNeeded(char, "prompt");
        }
      case "read":
        switch (char) {
          case keys.enter:
            return this._applyEffect((state) => handleSubmitRead(state, this._cols));
          case keys.ctrlH:
          case keys.backspace:
            return this._applyEffect((state) => handleBackspace(state, this._cols));
          case keys.del:
            return this._applyEffect(handleDeleteForward);
          case keys.up:
          case keys.down:
            // History is only available for prompts
            return;
          case keys.left:
            return this._applyEffect((state) => handleCursorLeft(state, this._cols));
          case keys.right:
            return this._applyEffect((state) => handleCursorRight(state, this._cols));
          case keys.home:
          case keys.ctrlA:
          case keys.end:
          case keys.ctrlE:
          case keys.ctrlU:
            // Cursor jump and erase-to-end are only available for prompts
            return;
          default:
            return this._insertAndSubmitIfNeeded(char, "read");
        }
    }
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    if (this._handlerState.mode != "eval" && this._handlerState.input != "") {
      // Move the cursor to the correct new position
      const move = computeCursorMove(this._handlerState.cursorCol, this._cols, 0, dimensions.columns - this._cols);
      this._write(move.escape);
      // Save the cursor position, move the cursor to just after the margin,
      // clear the screen from that point, write the input, then restore the cursor
      let cursorLine = Math.ceil((this._handlerState.cursorCol + 1) / move.cols) - 1;
      if (this._handlerState.input.includes("\r\n")) {
        const lines = this._handlerState.input.split("\r\n");
        lines.pop();
        cursorLine += lines.reduce((sum, line) => sum + Math.ceil((line.length + 1) / move.cols), 0);
      }
      this._write(
        `\x1b7${cursorLine > 0 ? `\x1b[${cursorLine}A` : ""}\r\x1b[${this._handlerState.margin}C\x1b[0J${this._handlerState.input.replace(
          /\r\n/g,
          `\r\n${this.multiLinePrompt}`
        )}\x1b8`
      );
      if (this._handlerState.mode == "prompt") {
        // Syntax color input
        this._socket.send(JSON.stringify({ type: "color", input: this._handlerState.input }));
      }
      this._cols = move.cols;
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
    await resolveConnectionSpec(notIsfs(targetUri) ? config("conn", configName).server : configName);
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
    vscode.window.createTerminal(terminalOpts).show();
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
      return new vscode.TerminalProfile(terminalConfigForUri(api, uri, true)!);
    } else if (uri === undefined) {
      throw new Error(NO_ELIGIBLE_CONNECTIONS);
    } else {
      throw new Error("No connection was chosen.");
    }
  }
}
