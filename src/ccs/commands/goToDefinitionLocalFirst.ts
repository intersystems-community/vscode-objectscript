import * as vscode from "vscode";

import { lookupCcsDefinition } from "../features/definitionLookup/lookup";

export async function goToDefinitionLocalFirst(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const { document, selection } = editor;
  const position = selection.active;
  const tokenSource = new vscode.CancellationTokenSource();

  try {
    const location = await lookupCcsDefinition(document, position, tokenSource.token);
    if (location) {
      await vscode.window.showTextDocument(location.uri, { selection: location.range });
      return;
    }
  } finally {
    tokenSource.dispose();
  }

  await vscode.commands.executeCommand("editor.action.revealDefinition");
}
