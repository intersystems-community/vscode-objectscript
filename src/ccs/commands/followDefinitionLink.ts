import * as vscode from "vscode";

import { lookupCcsDefinition } from "../features/definitionLookup/lookup";

export async function followDefinitionLink(documentUri: string, line: number, character: number): Promise<void> {
  if (!documentUri || typeof line !== "number" || typeof character !== "number") {
    return;
  }

  const uri = vscode.Uri.parse(documentUri);
  const document =
    vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === documentUri) ??
    (await vscode.workspace.openTextDocument(uri));

  const position = new vscode.Position(line, character);
  const tokenSource = new vscode.CancellationTokenSource();

  try {
    const location = await lookupCcsDefinition(document, position, tokenSource.token);
    if (location) {
      await vscode.window.showTextDocument(location.uri, { selection: location.range });
      return;
    }

    await vscode.window.showTextDocument(document, {
      selection: new vscode.Range(position, position),
    });
    await vscode.commands.executeCommand("editor.action.revealDefinition");
  } finally {
    tokenSource.dispose();
  }
}
