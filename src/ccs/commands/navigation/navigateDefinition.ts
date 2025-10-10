import * as vscode from "vscode";

import { currentFile, type CurrentTextFile } from "../../../utils";
import { extractDefinitionQuery, type QueryMatch } from "../../features/definitionLookup/extractQuery";
import { lookupCcsDefinition } from "../../features/definitionLookup/lookup";

export interface NavigateOpts {
  preview?: boolean;
  preserveFocus?: boolean;
  viewColumn?: vscode.ViewColumn;
}

export async function navigateToDefinition(
  document: vscode.TextDocument,
  position: vscode.Position,
  opts: NavigateOpts = {}
): Promise<boolean> {
  const tokenSource = new vscode.CancellationTokenSource();
  try {
    const ccsLocation = await lookupCcsDefinition(document, position, tokenSource.token);
    if (tokenSource.token.isCancellationRequested) {
      return false;
    }
    if (ccsLocation) {
      await showLocation(ccsLocation, opts);
      return true;
    }

    if (tokenSource.token.isCancellationRequested) {
      return false;
    }

    const match = extractDefinitionQuery(document, position);
    if (match) {
      const current = currentFile(document);
      if (current && isLocalDefinition(match, current)) {
        return await useNativeDefinitionProvider(document, position);
      }
    }

    return await useNativeDefinitionProvider(document, position);
  } finally {
    tokenSource.dispose();
  }
}

type DefinitionResults = vscode.Location | vscode.Location[] | vscode.LocationLink[];

/*
 * Ask VS Code's definition providers first (non-UI), then run the standard reveal command.
 * This preserves native behaviors (peek/preview) and avoids unnecessary reopens.
 */
async function useNativeDefinitionProvider(document: vscode.TextDocument, position: vscode.Position): Promise<boolean> {
  let definitions: DefinitionResults | undefined;
  try {
    definitions = await vscode.commands.executeCommand<DefinitionResults>(
      "vscode.executeDefinitionProvider",
      document.uri,
      position
    );
  } catch (error) {
    return false;
  }

  if (!hasDefinitions(definitions)) {
    return false;
  }

  // Center the source position if it's outside the viewport, without smooth animation
  const editor = getEditorForDocument(document);
  if (editor) {
    const selection = new vscode.Selection(position, position);
    editor.selection = selection;
    editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  await vscode.commands.executeCommand("editor.action.revealDefinition");
  return true;
}

// Minimal “has result” check for any of the definition shapes
function hasDefinitions(definitions: DefinitionResults | undefined): boolean {
  if (!definitions) {
    return false;
  }
  if (Array.isArray(definitions)) {
    return definitions.length > 0;
  }
  return true;
}

// Open the target and place the caret exactly at the returned range (no extra reveal)
async function showLocation(location: vscode.Location, opts: NavigateOpts): Promise<void> {
  const showOptions: vscode.TextDocumentShowOptions = { selection: location.range };
  if (opts.preview !== undefined) {
    showOptions.preview = opts.preview;
  }
  if (opts.preserveFocus !== undefined) {
    showOptions.preserveFocus = opts.preserveFocus;
  }
  if (opts.viewColumn !== undefined) {
    showOptions.viewColumn = opts.viewColumn;
  }
  await vscode.window.showTextDocument(location.uri, showOptions);
}

// Try to reuse an already visible editor for the document (avoids reopen flicker)
function getEditorForDocument(document: vscode.TextDocument): vscode.TextEditor | undefined {
  return (
    vscode.window.visibleTextEditors.find((editor) => editor.document === document) ??
    (vscode.window.activeTextEditor?.document === document ? vscode.window.activeTextEditor : undefined)
  );
}

// Compare current file name (without extension) to routine name (case-insensitive)
function isCurrentRoutine(current: CurrentTextFile, routineName: string): boolean {
  const match = current.name.match(/^(.*)\.(mac|int|inc)$/i);
  if (!match) {
    return false;
  }
  return match[1].toLowerCase() === routineName.toLowerCase();
}

// Compare current .cls name (without .cls) to class name (case-insensitive)
function isCurrentClass(current: CurrentTextFile, className: string): boolean {
  if (!current.name.toLowerCase().endsWith(".cls")) {
    return false;
  }
  const currentClassName = current.name.slice(0, -4);
  return currentClassName.toLowerCase() === className.toLowerCase();
}

// Local if symbol belongs to the same routine or same class as the current file
function isLocalDefinition(match: QueryMatch, current: CurrentTextFile): boolean {
  if (!match.symbolName) {
    return false;
  }

  if (match.kind === "labelRoutine") {
    return isCurrentRoutine(current, match.symbolName);
  }

  if (match.kind === "class") {
    return isCurrentClass(current, match.symbolName);
  }

  return false;
}
