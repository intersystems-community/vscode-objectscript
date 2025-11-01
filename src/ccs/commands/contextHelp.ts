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
      let normalizedTextExpression = data.textExpression.replace(/\r?\n/g, "\n");
      let gifUri: vscode.Uri | undefined;

      if (/--gif\b/i.test(contextExpression)) {
        const extracted = extractGifUri(normalizedTextExpression);
        normalizedTextExpression = extracted.textWithoutGifUri;
        gifUri = extracted.gifUri;
      }

      const textExpression = normalizedTextExpression.replace(/\r?\n/g, eol);
      let formattedTextExpression = textExpression;

      let rangeToReplace: vscode.Range;
      if (selection.isEmpty) {
        const fallbackLine = document.lineAt(selection.active.line);
        const fallbackRange = fallbackLine.range;

        rangeToReplace = getRangeToReplaceForLine(document, selection.active.line, contextExpression) ?? fallbackRange;

        const preservedPrefix = document.getText(new vscode.Range(fallbackLine.range.start, rangeToReplace.start));

        formattedTextExpression = normalizeInsertionWithPrefix(formattedTextExpression, preservedPrefix, eol);
      } else {
        // Multi-line or partial selection
        const firstSelLine = document.lineAt(selection.start.line);
        const preservedPrefix = document.getText(new vscode.Range(firstSelLine.range.start, selection.start));
        const leadingWS = firstSelLine.text.match(/^[\t ]*/)?.[0] ?? "";

        // 1) Normalize snippet to avoid duplicating "."/";" according to the prefix that will remain in the file
        formattedTextExpression = normalizeInsertionWithPrefix(formattedTextExpression, preservedPrefix, eol);

        // 2) Only prefix indentation if the selection started at column 0 (i.e., NO preserved prefix)
        formattedTextExpression = maybePrefixFirstLineIndent(
          formattedTextExpression,
          preservedPrefix.length === 0 ? leadingWS : "",
          eol
        );

        rangeToReplace = new vscode.Range(selection.start, selection.end);
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

function getRangeToReplaceForLine(
  document: vscode.TextDocument,
  lineNumber: number,
  contextExpression: string
): vscode.Range | undefined {
  if (!contextExpression) {
    return undefined;
  }

  const line = document.lineAt(lineNumber);
  const expressionIndex = line.text.indexOf(contextExpression);
  if (expressionIndex === -1) {
    return undefined;
  }

  const prefixLength = getPrefixLengthToPreserve(contextExpression);
  const startCharacter = expressionIndex + prefixLength;
  const endCharacter = expressionIndex + contextExpression.length;

  const start = line.range.start.translate(0, startCharacter);
  const end = line.range.start.translate(0, endCharacter);
  return new vscode.Range(start, end);
}

/**
 * Based on the preserved line prefix, remove from the BEGINNING of the snippet's first line:
 *  - if the prefix ends with ";": remove ^[\t ]*(?:\.\s*)*;\s*
 *  - otherwise, if it ends with dots: remove ^[\t ]*(?:\.\s*)+
 *  - neutral case: try to remove comment; otherwise remove dots
 */
function normalizeInsertionWithPrefix(text: string, preservedPrefix: string, eol: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return text;

  const preservedEnd = preservedPrefix.replace(/\s+$/g, "");

  const endsWithSemicolon = /(?:\.\s*)*;\s*$/.test(preservedEnd);
  const endsWithDotsOnly = !endsWithSemicolon && /(?:\.\s*)+$/.test(preservedEnd);

  if (endsWithSemicolon) {
    lines[0] = lines[0].replace(/^[\t ]*(?:\.\s*)*;\s*/, "");
  } else if (endsWithDotsOnly) {
    lines[0] = lines[0].replace(/^[\t ]*(?:\.\s*)+/, "");
  } else {
    const removedComment = lines[0].replace(/^[\t ]*(?:\.\s*)?;\s*/, "");
    if (removedComment !== lines[0]) {
      lines[0] = removedComment;
    } else {
      lines[0] = lines[0].replace(/^[\t ]*(?:\.\s*)+/, "");
    }
  }

  return lines.join(eol);
}

/**
 * Prefix indentation (tabs/spaces) ONLY if provided.
 * Useful when the selection started at column 0 (no preserved prefix).
 */
function maybePrefixFirstLineIndent(text: string, leadingWS: string, eol: string): string {
  if (!text || !leadingWS) return text;
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return text;

  // Do not force replacement if there is already some whitespace; just prefix it.
  lines[0] = leadingWS + lines[0];
  return lines.join(eol);
}

/**
 * Keep: preserve level dots / indentation and, if present, '; ' before the typed content.
 * Returns how many characters of the contextExpression belong to that prefix.
 */
function getPrefixLengthToPreserve(contextExpression: string): number {
  let index = 0;

  while (index < contextExpression.length) {
    const char = contextExpression[index];

    if (char === ".") {
      index++;
      while (index < contextExpression.length && contextExpression[index] === " ") {
        index++;
      }
      continue;
    }

    if (char === " " || char === "\t") {
      index++;
      continue;
    }

    break;
  }

  if (index < contextExpression.length && contextExpression[index] === ";") {
    index++;
    while (
      index < contextExpression.length &&
      (contextExpression[index] === " " || contextExpression[index] === "\t")
    ) {
      index++;
    }
  }

  return index;
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
