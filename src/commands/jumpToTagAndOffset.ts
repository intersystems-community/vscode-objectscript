import * as vscode from "vscode";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { handleError } from "../utils";

export async function jumpToTagAndOffset(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const document = editor.document;
  if (!["objectscript", "objectscript-int"].includes(document.languageId)) {
    vscode.window.showWarningMessage("Jump to Tag and Offset only supports .int and .mac routines.", "Dismiss");
    return;
  }

  // Get the labels from the document symbol provider
  const map = new Map<string, number>();
  const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
    "vscode.executeDocumentSymbolProvider",
    document.uri
  );
  if (!Array.isArray(symbols) || !symbols.length) return;
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
  quickPick.onDidAccept(() => {
    if (
      quickPick.selectedItems.length &&
      !new RegExp(`^${quickPick.selectedItems[0].label}(\\+\\d+)?$`).test(quickPick.value)
    ) {
      // Update the value to correct case and allow users to add/update the offset
      quickPick.value = quickPick.value.includes("+")
        ? `${quickPick.selectedItems[0].label}+${quickPick.value.split("+")[1]}`
        : quickPick.selectedItems[0].label;
      return;
    }
    const parts = quickPick.value.trim().split("+");
    let offset = 0;
    if (parts[0].length) {
      const labelLine = map.get(parts[0]);
      if (labelLine == undefined) return; // Not a valid label
      offset = labelLine;
    }
    if (parts.length > 1) {
      offset += parseInt(parts[1], 10);
    }
    const line = document.lineAt(offset);
    const range = new vscode.Range(line.range.start, line.range.start);
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    quickPick.hide();
  });
  quickPick.show();
}

/** Prompt the user for an error location of the form `label+offset^routine`, then open it. */
export async function openErrorLocation(): Promise<void> {
  // Prompt the user for a location
  const regex = /^(%?[\p{L}\d]+)?(?:\+(\d+))?\^(%?[\p{L}\d.]+)$/u;
  const location = await vscode.window.showInputBox({
    title: "Enter the location to open",
    placeHolder: "label+offset^routine",
    validateInput: (v) => (regex.test(v.trim()) ? undefined : "Input is not in the format 'label+offset^routine'"),
  });
  if (!location) {
    return;
  }
  const [, label, offset, routine] = location.trim().match(regex);
  // Get the uri for the routine
  const uri = DocumentContentProvider.getUri(`${routine}.int`);
  if (!uri) {
    return;
  }
  let selection = new vscode.Range(0, 0, 0, 0);
  try {
    if (label) {
      // Find the location of the tag within the document
      const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
        "vscode.executeDocumentSymbolProvider",
        uri
      );
      for (const symbol of symbols) {
        if (symbol.name == label) {
          selection = new vscode.Range(symbol.selectionRange.start.line, 0, symbol.selectionRange.start.line, 0);
          break;
        }
      }
    }
    if (offset) {
      // Add the offset
      selection = new vscode.Range(selection.start.line + Number(offset), 0, selection.start.line + Number(offset), 0);
    }
    // Show the document
    await vscode.window.showTextDocument(uri, { preview: false, selection });
  } catch (error) {
    handleError(error, `Failed to open routine '${routine}.int'.`);
  }
}
