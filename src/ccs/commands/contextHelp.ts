import * as path from "path";
import { URL } from "url";
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
  const contextInfo = getContextExpressionInfo(document, selection);
  const contextExpression = contextInfo.text;

  if (!contextExpression.trim()) {
    void vscode.window.showErrorMessage("Context expression is empty.");
    return;
  }

  const routine = path.basename(document.fileName);

  try {
    const response = await sharedClient.resolve(document, { routine, contextExpression });
    const data = response ?? {};

    if (typeof data.status === "string" && data.status.toLowerCase() === "success" && data.textExpression) {
      const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
      let normalizedTextExpression = data.textExpression.replace(/\r?\n/g, "\n");
      let gifUri: vscode.Uri | undefined;

      if (/--gif\b/i.test(contextExpression)) {
        const extracted = extractGifUri(normalizedTextExpression);
        normalizedTextExpression = extracted.textWithoutGifUri;
        gifUri = extracted.gifUri;
      }

      const textExpression = normalizedTextExpression.replace(/\r?\n/g, eol);
      const formattedTextExpression = textExpression;

      let rangeToReplace: vscode.Range;
      if (selection.isEmpty) {
        const fallbackLine = document.lineAt(selection.active.line);
        rangeToReplace = fallbackLine.range;
      } else {
        const start = document.lineAt(selection.start.line).range.start;
        const replacementEnd = contextInfo.replacementEnd ?? document.lineAt(selection.end.line).range.end;
        rangeToReplace = new vscode.Range(start, replacementEnd);
      }

      await editor.edit((editBuilder) => {
        editBuilder.replace(rangeToReplace, formattedTextExpression);
      });

      if (gifUri) {
        try {
          await showGifInWebview(gifUri);
        } catch (error) {
          handleError(error, "Failed to open GIF from context expression.");
        }
      }
    } else {
      const errorMessage = data.message || "Failed to resolve context expression.";
      void vscode.window.showErrorMessage(errorMessage);
    }
  } catch (error) {
    handleError(error, "Failed to resolve context expression.");
  }
}

type ContextExpressionInfo = {
  text: string;
  replacementEnd?: vscode.Position;
};

function getContextExpressionInfo(document: vscode.TextDocument, selection: vscode.Selection): ContextExpressionInfo {
  if (selection.isEmpty) {
    return {
      text: document.lineAt(selection.active.line).text,
    };
  }

  const startLine = selection.start.line;
  const start = document.lineAt(startLine).range.start;

  let lastLine = selection.end.line;
  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    lastLine = selection.end.line - 1;
  }

  const end = document.lineAt(lastLine).range.end;

  return {
    text: document.getText(new vscode.Range(start, end)),
    replacementEnd: end,
  };
}

function extractGifUri(text: string): {
  textWithoutGifUri: string;
  gifUri?: vscode.Uri;
} {
  const fileUriPattern = /file:\/\/\S+/i;
  const lines = text.split(/\r?\n/);
  const processedLines: string[] = [];
  let gifUri: vscode.Uri | undefined;

  for (const line of lines) {
    if (!gifUri) {
      fileUriPattern.lastIndex = 0;
      const match = fileUriPattern.exec(line);
      if (match) {
        const candidate = getFileUriFromText(match[0]);
        if (candidate) {
          gifUri = candidate;
          const before = line.slice(0, match.index);
          const after = line.slice(match.index + match[0].length);
          const cleanedLine = `${before}${after}`;
          processedLines.push(cleanedLine);
          continue;
        }
      }
    }

    processedLines.push(line);
  }

  return { textWithoutGifUri: processedLines.join("\n"), gifUri };
}

function getFileUriFromText(text: string): vscode.Uri | undefined {
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith("file://")) {
    return undefined;
  }

  try {
    const asUrl = new URL(trimmed.replace(/\\/g, "/"));
    if (asUrl.protocol !== "file:") {
      return undefined;
    }

    let fsPath = decodeURIComponent(asUrl.pathname);
    if (/^\/[a-zA-Z]:/.test(fsPath)) {
      fsPath = fsPath.slice(1);
    }

    return vscode.Uri.file(fsPath);
  } catch (error) {
    const withoutScheme = trimmed.replace(/^file:\/\//i, "");
    if (!withoutScheme) {
      return undefined;
    }

    const decoded = decodeURIComponent(withoutScheme);
    const windowsMatch = decoded.match(/^\/?([a-zA-Z]:.*)$/);
    let pathToUse: string;
    if (windowsMatch) {
      pathToUse = windowsMatch[1];
    } else if (decoded.startsWith("/")) {
      pathToUse = decoded;
    } else {
      pathToUse = `/${decoded}`;
    }

    try {
      return vscode.Uri.file(pathToUse);
    } catch (_error) {
      return undefined;
    }
  }
}

async function showGifInWebview(gifUri: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.stat(gifUri);

  const title = path.basename(gifUri.fsPath);
  const panel = vscode.window.createWebviewPanel(
    "contextHelpGif",
    title,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    {
      enableScripts: false,
      retainContextWhenHidden: false,
      enableFindWidget: false,
      localResourceRoots: [vscode.Uri.file(path.dirname(gifUri.fsPath))],
    }
  );

  panel.webview.html = getGifWebviewHtml(panel.webview, gifUri, title);
}

function getGifWebviewHtml(webview: vscode.Webview, gifUri: vscode.Uri, title: string): string {
  const escapedTitle = escapeHtml(title);
  const gifSource = escapeHtml(webview.asWebviewUri(gifUri).toString());
  const cspSource = escapeHtml(webview.cspSource);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #1e1e1e;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
      }

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
    </style>
  </head>
  <body>
    <img src="${gifSource}" alt="${escapedTitle}" />
  </body>
</html>`;
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
