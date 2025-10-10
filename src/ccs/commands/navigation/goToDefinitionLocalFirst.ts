import * as vscode from "vscode";

import { navigateToDefinition } from "./navigateDefinition";

export async function goToDefinitionLocalFirst(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const { document, selection } = editor;
  const position = selection.active;

  await navigateToDefinition(document, position, {
    preview: false,
    preserveFocus: false,
    viewColumn: editor.viewColumn,
  });
}
