import * as path from "path";
import { URL } from "url";
import * as vscode from "vscode";

import { ContextExpressionClient } from "../sourcecontrol/clients/contextExpressionClient";
import { GlobalDocumentationResponse, ResolveContextExpressionResponse } from "../core/types";
import { handleError } from "../../utils";

const sharedClient = new ContextExpressionClient();
const CONTEXT_HELP_PANEL_VIEW_TYPE = "contextHelpPreview";
const CONTEXT_HELP_TITLE = "Ajuda de Contexto";

export async function resolveContextExpression(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const { document, selection } = editor;
  const contextInfo = getContextExpressionInfo(document, selection);
  const contextExpression = contextInfo.text;

  if (!contextExpression.trim()) {
    void vscode.window.showErrorMessage("A expressão da ajuda de contexto está vazia.");
    return;
  }

  const routine = path.basename(document.fileName);

  try {
    const response = await sharedClient.resolve(document, { routine, contextExpression });
    const data = response ?? {};

    if (typeof data === "string") {
      const { previewContent, textExpression } = extractEmbeddedContextExpression(data);

      if (textExpression && textExpression.trim()) {
        await applyResolvedTextExpression(editor, document, selection, contextInfo, contextExpression, textExpression);
      }

      await handleContextHelpDocumentationContent(previewContent);
      return;
    }

    if (hasGlobalDocumentationContent(data)) {
      const normalizedContent = normalizeGlobalDocumentationContent(data.content);

      if (normalizedContent.trim()) {
        await handleContextHelpDocumentationContent(normalizedContent);
      } else {
        const message = data.message || "A ajuda de contexto não retornou nenhum conteúdo.";
        void vscode.window.showInformationMessage(message);
      }
      return;
    }

    if (isSuccessfulTextExpression(data)) {
      await applyResolvedTextExpression(
        editor,
        document,
        selection,
        contextInfo,
        contextExpression,
        data.textExpression
      );
      return;
    }

    const errorMessage =
      typeof data === "object" && data && "message" in data && typeof data.message === "string"
        ? data.message
        : "Falha ao resolver a ajuda de contexto.";
    void vscode.window.showErrorMessage(errorMessage);
  } catch (error) {
    handleError(error, "Falha ao resolver a ajuda de contexto.");
  }
}

type ContextExpressionInfo = {
  text: string;
  replacementRange?: vscode.Range;
};

function getContextExpressionInfo(document: vscode.TextDocument, selection: vscode.Selection): ContextExpressionInfo {
  if (selection.isEmpty) {
    return {
      text: document.lineAt(selection.active.line).text,
    };
  }

  let replacementRange = new vscode.Range(selection.start, selection.end);

  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    const adjustedEnd = document.lineAt(selection.end.line - 1).range.end;
    replacementRange = new vscode.Range(selection.start, adjustedEnd);
  }

  return {
    text: document.getText(replacementRange),
    replacementRange,
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

async function applyResolvedTextExpression(
  editor: vscode.TextEditor,
  document: vscode.TextDocument,
  selection: vscode.Selection,
  contextInfo: ContextExpressionInfo,
  contextExpression: string,
  rawTextExpression: string
): Promise<void> {
  const hasGifCommand = /--gif\b/i.test(contextExpression);
  let normalizedTextExpression = rawTextExpression.replace(/\r?\n/g, "\n");
  let gifUri: vscode.Uri | undefined;

  if (hasGifCommand) {
    const extracted = extractGifUri(normalizedTextExpression);
    normalizedTextExpression = extracted.textWithoutGifUri;
    gifUri = extracted.gifUri;
  }

  if (!hasGifCommand) {
    const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
    const textExpression = normalizedTextExpression.replace(/\r?\n/g, eol);
    const formattedTextExpression = textExpression;

    let rangeToReplace: vscode.Range;
    if (selection.isEmpty) {
      const fallbackLine = document.lineAt(selection.active.line);
      rangeToReplace = fallbackLine.range;
    } else {
      rangeToReplace = contextInfo.replacementRange ?? new vscode.Range(selection.start, selection.end);
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(rangeToReplace, formattedTextExpression);
    });
  }

  if (gifUri) {
    try {
      await showGifInWebview(gifUri);
    } catch (error) {
      handleError(error, "Falha ao abrir o GIF da ajuda de contexto.");
    }
  }
}

async function handleContextHelpDocumentationContent(rawContent: string): Promise<void> {
  const { previewContent } = extractEmbeddedContextExpression(rawContent);
  const sanitizedContent = sanitizeContextHelpContent(previewContent);

  if (!sanitizedContent.trim()) {
    void vscode.window.showInformationMessage("A ajuda de contexto não retornou nenhum conteúdo.");
    return;
  }

  const errorMessage = extractContextHelpError(sanitizedContent);
  if (errorMessage) {
    void vscode.window.showErrorMessage(errorMessage);
    return;
  }

  await showContextHelpPreview(sanitizedContent);
}

function extractEmbeddedContextExpression(content: string): {
  previewContent: string;
  textExpression?: string;
} {
  const jsonPattern = /\{[\s\S]*\}\s*$/;
  const match = jsonPattern.exec(content);
  if (!match || match.index === undefined) {
    return { previewContent: content };
  }

  const previewWithoutJson = content.slice(0, match.index).replace(/\s+$/, "");
  const jsonText = content.slice(match.index).trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (!isRecord(parsed)) {
      return { previewContent: previewWithoutJson };
    }

    const { status, textExpression } = parsed as ResolveContextExpressionResponse;
    if (typeof status !== "string" || status.toLowerCase() !== "success") {
      return { previewContent: previewWithoutJson };
    }

    if (typeof textExpression !== "string") {
      return { previewContent: previewWithoutJson };
    }

    if (!textExpression.trim()) {
      return { previewContent: previewWithoutJson };
    }

    return { previewContent: previewWithoutJson, textExpression };
  } catch (_error) {
    return { previewContent: content };
  }
}

function sanitizeContextHelpContent(content: string): string {
  let sanitized = content.replace(/\{"status":"success","textExpression":""\}\s*$/i, "");

  sanitized = sanitized.replace(/^\s*=+\s*Global Documentation\s*=+\s*(?:\r?\n)?/i, "");

  return sanitized.replace(/\r?\n/g, "\n");
}

function extractContextHelpError(content: string): string | undefined {
  const commandNotImplemented = content.match(/Comando\s+"([^"]+)"\s+n[ãa]o implementado!/i);
  if (commandNotImplemented) {
    return commandNotImplemented[0].replace(/\s+/g, " ");
  }

  return undefined;
}

async function showContextHelpPreview(content: string): Promise<void> {
  const panel = vscode.window.createWebviewPanel(
    CONTEXT_HELP_PANEL_VIEW_TYPE,
    CONTEXT_HELP_TITLE,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    {
      enableFindWidget: true,
      enableScripts: false,
      retainContextWhenHidden: false,
    }
  );

  panel.webview.html = getContextHelpWebviewHtml(panel.webview, content);
}

function getContextHelpWebviewHtml(webview: vscode.Webview, content: string): string {
  const escapedContent = escapeHtml(content);
  const cspSource = escapeHtml(webview.cspSource);
  const escapedTitle = escapeHtml(CONTEXT_HELP_TITLE);

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapedTitle}</title>
    <style>
      body {
        margin: 0;
        padding: 16px;
        background-color: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-editor-foreground, #d4d4d4);
        font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
        font-size: var(--vscode-editor-font-size, 14px);
        line-height: 1.5;
      }   

     pre {
        white-space: pre;       /* em vez de pre-wrap */
        word-break: normal;     /* em vez de break-word */
        overflow-x: auto;       /* barra horizontal quando precisar */
        overflow-y: auto;       /* mantém a vertical também */
        max-width: 100%;
      }
    </style>

  </head>
  <body>
    <pre>${escapedContent}</pre>
  </body>
</html>`;
}

function hasGlobalDocumentationContent(
  value: unknown
): value is Pick<GlobalDocumentationResponse, "content" | "message"> {
  if (!isRecord(value)) {
    return false;
  }

  if (!("content" in value)) {
    return false;
  }

  const content = (value as GlobalDocumentationResponse).content;

  return (
    typeof content === "string" ||
    Array.isArray(content) ||
    (content !== null && typeof content === "object") ||
    content === null
  );
}

function normalizeGlobalDocumentationContent(content: GlobalDocumentationResponse["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.join("\n");
  }

  if (content && typeof content === "object") {
    try {
      return JSON.stringify(content, null, 2);
    } catch (error) {
      handleError(error, "Falha ao processar o conteúdo da documentação global.");
    }
  }

  return "";
}

function isSuccessfulTextExpression(
  value: unknown
): value is Required<Pick<ResolveContextExpressionResponse, "textExpression">> & ResolveContextExpressionResponse {
  if (!isRecord(value)) {
    return false;
  }

  const { status, textExpression } = value as ResolveContextExpressionResponse;

  return (
    typeof status === "string" &&
    status.toLowerCase() === "success" &&
    typeof textExpression === "string" &&
    textExpression.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
<html lang="pt-BR">
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
