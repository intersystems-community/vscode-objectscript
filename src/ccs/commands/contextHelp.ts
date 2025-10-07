import * as path from "path";
import * as vscode from "vscode";

import { ContextExpressionClient } from "../sourcecontrol/clients/contextExpressionClient";
import { handleError } from "../../utils";

const sharedClient = new ContextExpressionClient();

export async function resolveContextExpression(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const { document, selection } = editor;
  const contextExpression = selection.isEmpty
    ? document.lineAt(selection.active.line).text.trim()
    : document.getText(selection).trim();

  if (!contextExpression) {
    void vscode.window.showErrorMessage("Context expression is empty.");
    return;
  }

  const routine = path.basename(document.fileName);

  try {
    const response = await sharedClient.resolve(document, { routine, contextExpression });
    const data = response ?? {};

    if (typeof data.status === "string" && data.status.toLowerCase() === "success" && data.textExpression) {
      const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
      const textExpression = data.textExpression.replace(/\r?\n/g, eol);
      const formattedTextExpression = textExpression.replace(/^/, "\t");
      const rangeToReplace = selection.isEmpty
        ? document.lineAt(selection.active.line).range
        : new vscode.Range(selection.start, selection.end);
      await editor.edit((editBuilder) => {
        editBuilder.replace(rangeToReplace, formattedTextExpression);
      });
    } else {
      const errorMessage = data.message || "Failed to resolve context expression.";
      void vscode.window.showErrorMessage(errorMessage);
    }
  } catch (error) {
    handleError(error, "Failed to resolve context expression.");
  }
}
