import * as vscode from "vscode";

import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { logDebug } from "../core/logging";

export const followSourceAnalysisLinkCommand = "vscode-objectscript.ccs.followSourceAnalysisLink" as const;

const METHOD_WITH_OFFSET_REGEX = /([%\w.]+)\(([\w%]+)\+(\d+)\)/g;
const ROUTINE_OFFSET_REGEX = /([%\w.]+)\((\d+)\)/g;

export interface SourceAnalysisLinkArgs {
  targetUri: string;
  offset: number;
  methodName?: string;
}

export class SourceAnalysisLinkProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const text = document.lineAt(lineIndex).text;

      METHOD_WITH_OFFSET_REGEX.lastIndex = 0;
      for (const match of text.matchAll(METHOD_WITH_OFFSET_REGEX)) {
        const [fullMatch, filename, methodName, offsetString] = match;
        const range = new vscode.Range(
          new vscode.Position(lineIndex, match.index ?? 0),
          new vscode.Position(lineIndex, (match.index ?? 0) + fullMatch.length)
        );
        const link = this.createLink(range, filename, Number.parseInt(offsetString, 10), methodName);
        if (link) {
          links.push(link);
        }
      }

      ROUTINE_OFFSET_REGEX.lastIndex = 0;
      for (const match of text.matchAll(ROUTINE_OFFSET_REGEX)) {
        const [fullMatch, filename, offsetString] = match;

        // Skip matches that also match the method+offset pattern, which has already been handled above.
        if (/\+/.test(fullMatch)) {
          continue;
        }

        const range = new vscode.Range(
          new vscode.Position(lineIndex, match.index ?? 0),
          new vscode.Position(lineIndex, (match.index ?? 0) + fullMatch.length)
        );
        const link = this.createLink(range, filename, Number.parseInt(offsetString, 10));
        if (link) {
          links.push(link);
        }
      }
    }

    return links;
  }

  private createLink(
    range: vscode.Range,
    filename: string,
    offset: number,
    methodName?: string
  ): vscode.DocumentLink | undefined {
    if (!Number.isFinite(offset)) {
      return undefined;
    }

    const normalizedFilename = lowercaseExtension(filename);
    const targetUri = DocumentContentProvider.getUri(normalizedFilename);
    if (!targetUri) {
      return undefined;
    }

    const args: SourceAnalysisLinkArgs = {
      targetUri: targetUri.toString(),
      offset,
      ...(methodName ? { methodName } : {}),
    };

    const commandUri = vscode.Uri.parse(
      `command:${followSourceAnalysisLinkCommand}?${encodeURIComponent(JSON.stringify(args))}`
    );

    const link = new vscode.DocumentLink(range, commandUri);
    link.tooltip = vscode.l10n.t("Abrir localização da análise de fonte");
    return link;
  }
}

export async function followSourceAnalysisLink(args: SourceAnalysisLinkArgs): Promise<void> {
  try {
    if (!args?.targetUri) {
      logDebug("Missing targetUri for source analysis link", args);
      return;
    }

    const uri = vscode.Uri.parse(args.targetUri);
    const editor = await vscode.window.showTextDocument(uri, { preview: false });
    const document = editor.document;

    const targetLine = await resolveTargetLine(uri, document, args.offset, args.methodName);
    const line = document.lineAt(targetLine);
    const position = line.range.start;
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(line.range, vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    logDebug("Failed to follow source analysis link", error);
  }
}

async function resolveTargetLine(
  uri: vscode.Uri,
  document: vscode.TextDocument,
  offset: number,
  methodName?: string
): Promise<number> {
  const clampedOffset = Math.max(offset, 0);

  if (!methodName) {
    return clampLine(document, Math.max(clampedOffset - 1, 0));
  }

  const methodStartLine = await findMethodStartLine(uri, methodName);
  if (typeof methodStartLine === "number") {
    return clampLine(document, methodStartLine + clampedOffset);
  }

  return clampLine(document, Math.max(clampedOffset - 1, 0));
}

async function findMethodStartLine(uri: vscode.Uri, methodName: string): Promise<number | undefined> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      uri
    );
    const methodSymbol = findMethodSymbol(symbols, methodName);
    return methodSymbol?.range.start.line;
  } catch (error) {
    logDebug("Failed to resolve document symbols for source analysis link", error);
    return undefined;
  }
}

function findMethodSymbol(
  symbols: readonly vscode.DocumentSymbol[] | undefined,
  methodName: string
): vscode.DocumentSymbol | undefined {
  if (!Array.isArray(symbols)) {
    return undefined;
  }

  for (const symbol of symbols) {
    if (isMethodSymbol(symbol) && symbol.name === methodName) {
      return symbol;
    }

    const child = findMethodSymbol(symbol.children, methodName);
    if (child) {
      return child;
    }
  }

  return undefined;
}

function isMethodSymbol(symbol: vscode.DocumentSymbol): boolean {
  const detail = symbol.detail ?? "";
  return detail === "Method" || detail === "ClassMethod";
}

function clampLine(document: vscode.TextDocument, line: number): number {
  if (document.lineCount === 0) {
    return 0;
  }
  return Math.min(Math.max(line, 0), document.lineCount - 1);
}

function lowercaseExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === name.length - 1) {
    return name;
  }
  return name.slice(0, lastDot + 1) + name.slice(lastDot + 1).toLowerCase();
}
