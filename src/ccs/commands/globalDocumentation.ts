import * as vscode from "vscode";

import { GlobalDocumentationClient } from "../sourcecontrol/clients/globalDocumentationClient";
import { handleError, outputChannel } from "../../utils";

const sharedClient = new GlobalDocumentationClient();

function getSelectedOrCurrentLineText(editor: vscode.TextEditor): string {
  const { selection, document } = editor;

  if (!selection || selection.isEmpty) {
    return document.lineAt(selection.active.line).text.trim();
  }

  return document.getText(selection).trim();
}

export async function showGlobalDocumentation(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const selectedText = getSelectedOrCurrentLineText(editor);

  if (!selectedText) {
    void vscode.window.showErrorMessage("Selection is empty. Select text or place the cursor on a line with content.");
    return;
  }

  try {
    const content = await sharedClient.fetch(editor.document, { selectedText });

    if (!content || !content.trim()) {
      void vscode.window.showInformationMessage("Global documentation did not return any content.");
      return;
    }

    outputChannel.appendLine("==================== Global Documentation ====================");
    for (const line of content.split(/\r?\n/)) {
      outputChannel.appendLine(line);
    }
    outputChannel.show(true);
  } catch (error) {
    handleError(error, "Failed to retrieve global documentation.");
  }
}
