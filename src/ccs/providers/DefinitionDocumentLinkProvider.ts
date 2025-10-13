import * as vscode from "vscode";

import { extractDefinitionQueries } from "../features/definitionLookup/extractQuery";

export const followDefinitionLinkCommand = "vscode-objectscript.ccs.followDefinitionLink";

type TimeoutHandle = ReturnType<typeof setTimeout>;

export class DefinitionDocumentLinkProvider implements vscode.DocumentLinkProvider, vscode.Disposable {
  private readonly decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: "none",
  });

  private readonly _onDidChange = new vscode.EventEmitter<void>();

  public readonly onDidChange: vscode.Event<void> = this._onDidChange.event;

  private readonly supportedLanguages?: Set<string>;

  private readonly subscriptions: vscode.Disposable[] = [];

  private readonly linkRanges = new Map<string, vscode.Range[]>();

  private readonly refreshTimeouts = new Map<string, TimeoutHandle>();

  constructor(supportedLanguages?: readonly string[]) {
    this.supportedLanguages = supportedLanguages?.length ? new Set(supportedLanguages) : undefined;

    this.subscriptions.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.handleVisibleEditorsChange()),
      vscode.window.onDidChangeActiveTextEditor(() => this.handleVisibleEditorsChange()),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (this.shouldHandleDocument(event.document)) {
          this.scheduleRefresh(event.document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => this.clearDocument(document))
    );

    this.handleVisibleEditorsChange();
  }

  public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const queries = extractDefinitionQueries(document);
    this.updateDocumentRanges(
      document,
      queries.map((match) => match.range)
    );

    return queries.map((match) => {
      const targetPosition = this.getDefinitionPosition(match.range);
      const args = [document.uri.toString(), targetPosition.line, targetPosition.character];
      const commandUri = vscode.Uri.parse(
        `command:${followDefinitionLinkCommand}?${encodeURIComponent(JSON.stringify(args))}`
      );
      const link = new vscode.DocumentLink(match.range, commandUri);
      link.tooltip = vscode.l10n.t("Go to Definition");
      return link;
    });
  }

  private getDefinitionPosition(range: vscode.Range): vscode.Position {
    const { start, end } = range;
    if (end.isAfter(start)) {
      const character = Math.max(start.character, end.character - 1);
      return new vscode.Position(start.line, character);
    }
    return start;
  }

  public dispose(): void {
    for (const timeout of this.refreshTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.refreshTimeouts.clear();

    for (const disposable of this.subscriptions) {
      disposable.dispose();
    }

    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.decorationType, []);
    }

    this.linkRanges.clear();
    this.decorationType.dispose();
    this._onDidChange.dispose();
  }

  private handleVisibleEditorsChange(): void {
    const visibleDocuments = new Set<string>();

    for (const editor of vscode.window.visibleTextEditors) {
      if (!this.shouldHandleDocument(editor.document)) {
        editor.setDecorations(this.decorationType, []);
        continue;
      }

      const key = editor.document.uri.toString();
      visibleDocuments.add(key);

      const ranges = this.linkRanges.get(key);
      if (ranges) {
        editor.setDecorations(this.decorationType, ranges);
      } else {
        editor.setDecorations(this.decorationType, []);
        this.scheduleRefresh(editor.document);
      }
    }

    for (const key of [...this.linkRanges.keys()]) {
      if (!visibleDocuments.has(key)) {
        this.linkRanges.delete(key);
      }
    }
  }

  private scheduleRefresh(document: vscode.TextDocument): void {
    if (document.isClosed || !this.shouldHandleDocument(document)) {
      return;
    }

    const key = document.uri.toString();
    const existing = this.refreshTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.refreshTimeouts.delete(key);
      if (document.isClosed) {
        this.clearDocumentByKey(key);
        return;
      }
      const queries = extractDefinitionQueries(document);
      this.updateDocumentRanges(
        document,
        queries.map((match) => match.range)
      );

      this._onDidChange.fire();
    }, 50);

    this.refreshTimeouts.set(key, timeout);
  }

  private updateDocumentRanges(document: vscode.TextDocument, ranges: vscode.Range[]): void {
    const key = document.uri.toString();

    const existing = this.refreshTimeouts.get(key);
    if (existing) {
      clearTimeout(existing);
      this.refreshTimeouts.delete(key);
    }

    if (ranges.length > 0) {
      this.linkRanges.set(key, ranges);
    } else {
      this.linkRanges.delete(key);
    }

    this.applyDecorationsForKey(key, ranges);
  }

  private clearDocument(document: vscode.TextDocument): void {
    this.clearDocumentByKey(document.uri.toString());
  }

  private clearDocumentByKey(key: string): void {
    const timeout = this.refreshTimeouts.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.refreshTimeouts.delete(key);
    }

    this.linkRanges.delete(key);
    this.applyDecorationsForKey(key, []);
  }

  private applyDecorationsForKey(key: string, ranges: vscode.Range[]): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === key) {
        editor.setDecorations(this.decorationType, ranges);
      }
    }
  }

  private shouldHandleDocument(document: vscode.TextDocument): boolean {
    if (document.isClosed) {
      return false;
    }

    if (this.supportedLanguages && !this.supportedLanguages.has(document.languageId)) {
      return false;
    }

    return true;
  }
}
