import * as vscode from "vscode";

import { AtelierAPI } from "../api";
import { currentFile, handleError, outputChannel } from "../utils";

function getSelectedOrCurrentLineText(editor: vscode.TextEditor): string {
  const { selection, document } = editor;
  if (!selection || selection.isEmpty) {
    return document.lineAt(selection.active.line).text.trim();
  }
  return document.getText(selection).trim();
}

export async function showGlobalDocumentation(): Promise<void> {
  const file = currentFile();
  const editor = vscode.window.activeTextEditor;

  if (!file || !editor) {
    return;
  }

  const selectedText = getSelectedOrCurrentLineText(editor);

  if (!selectedText) {
    void vscode.window.showErrorMessage("Selection is empty. Select text or place the cursor on a line with content.");
    return;
  }

  const api = new AtelierAPI(file.uri);

  if (!api.active) {
    void vscode.window.showErrorMessage("No active connection to retrieve global documentation.");
    return;
  }

  try {
    const response = await api.getGlobalDocumentation({ selectedText });
    const content = response?.result?.content;
    let output = "";

    if (Array.isArray(content)) {
      output = content.join("\n");
    } else if (typeof content === "string") {
      output = content;
    } else if (content && typeof content === "object") {
      output = JSON.stringify(content, null, 2);
    }

    if (!output) {
      void vscode.window.showInformationMessage("Global documentation did not return any content.");
      return;
    }

    outputChannel.appendLine("==================== Global Documentation ====================");
    outputChannel.appendLine(output);
    outputChannel.show(true);
  } catch (error) {
    handleError(error, "Failed to retrieve global documentation.");
  }
}
