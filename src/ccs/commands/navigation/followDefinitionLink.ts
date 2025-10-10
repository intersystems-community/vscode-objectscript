import * as vscode from "vscode";

import { navigateToDefinition } from "./navigateDefinition";

export async function followDefinitionLink(documentUri: string, line: number, character: number): Promise<void> {
  if (!documentUri || typeof line !== "number" || typeof character !== "number") {
    return;
  }

  const uri = vscode.Uri.parse(documentUri);
  const document =
    vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === documentUri) ??
    (await vscode.workspace.openTextDocument(uri));

  const position = new vscode.Position(line, character);
  const editor = vscode.window.visibleTextEditors.find((item) => item.document === document);

  await navigateToDefinition(document, position, {
    preview: false,
    preserveFocus: false,
    viewColumn: editor?.viewColumn,
  });
}
