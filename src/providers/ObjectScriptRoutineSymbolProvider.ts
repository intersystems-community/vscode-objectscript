import * as vscode from "vscode";

export class ObjectScriptRoutineSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Thenable<vscode.SymbolInformation[]> {
    return new Promise(resolve => {
      const symbols: vscode.SymbolInformation[] = [];

      for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i);

        const label = line.text.match(/^(%?\b\w+\b)/);
        if (label) {
          const start = line.range.start;
          while (++i && i < document.lineCount) {
            line = document.lineAt(i);
            if (line.text.match(/^(%?\b\w+\b)/)) {
              break;
            }
          }
          line = document.lineAt(--i);
          const end = line.range.start;
          symbols.push({
            containerName: "Label",
            kind: vscode.SymbolKind.Method,
            location: new vscode.Location(document.uri, new vscode.Range(start, end)),
            name: label[1],
          });
        }
      }

      resolve(symbols);
    });
  }
}
