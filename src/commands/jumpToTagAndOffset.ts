import * as vscode from "vscode";
import { currentFile } from "../utils";

export async function jumpToTagAndOffset(): Promise<void> {
  const file = currentFile();
  if (!file) {
    return;
  }
  const nameMatch = file.name.match(/(.*)\.(int|mac)$/i);
  if (!nameMatch) {
    vscode.window.showWarningMessage("Jump to Tag and Offset only supports .int and .mac routines.");
    return;
  }
  const document = vscode.window.activeTextEditor?.document;
  if (!document) {
    return;
  }

  // Build map of labels in routine
  const map = new Map();
  const options = [];
  for (let i = 0; i < document.lineCount; i++) {
    const labelMatch = document.lineAt(i).text.match(/^(%?\w+).*/);
    if (labelMatch) {
      map.set(labelMatch[1], i);
      options.push(labelMatch[1]);
    }
  }

  const items: vscode.QuickPickItem[] = options.map((option) => {
    return { label: option };
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
      offset += parseInt(map.get(parts[0]), 10);
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
