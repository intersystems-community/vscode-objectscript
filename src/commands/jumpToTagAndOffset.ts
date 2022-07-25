import * as vscode from "vscode";
import { currentFile } from "../utils";

export async function jumpToTagAndOffset(): Promise<void> {
  const file = currentFile();
  if (!file) {
    return;
  }
  const nameMatch = file.name.match(/(.*)\.(int|mac)$/i);
  if (!nameMatch) {
    vscode.window.showWarningMessage("Jump to Tag and Offset only supports .int and .mac routines.", "Dismiss");
    return;
  }
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    return;
  }

  // Get the labels from the document symbol provider
  const map = new Map<string, number>();
  const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    document.uri
  );
  const items: vscode.QuickPickItem[] = symbols
    .filter((symbol) => symbol.kind === vscode.SymbolKind.Method)
    .map((symbol) => {
      map.set(symbol.name, symbol.range.start.line);
      return {
        label: symbol.name,
      };
    });
  const quickPick = vscode.window.createQuickPick();
  quickPick.title = "Jump to Tag + Offset";
  quickPick.items = items;
  quickPick.canSelectMany = false;
  quickPick.onDidChangeSelection((_) => {
    quickPick.value = quickPick.selectedItems[0].label;
  });
  quickPick.onDidAccept((_) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      quickPick.hide();
      return;
    }
    const parts = quickPick.value.split("+");
    let offset = 0;
    if (!map.has(parts[0])) {
      if (parts[0] !== "") {
        return;
      }
    } else {
      offset += map.get(parts[0]);
    }
    if (parts.length > 1) {
      offset += parseInt(parts[1], 10);
    }
    const line = editor.document.lineAt(offset);
    const range = new vscode.Range(line.range.start, line.range.start);
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    quickPick.hide();
  });
  quickPick.show();
}
