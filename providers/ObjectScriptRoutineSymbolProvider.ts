import * as vscode from 'vscode';

export class ObjectScriptRoutineSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Thenable<vscode.SymbolInformation[]> {
    return new Promise(resolve => {
      var symbols: vscode.SymbolInformation[] = [];

      for (var i = 0; i < document.lineCount; i++) {
        var line = document.lineAt(i);

        let label = line.text.match(/^(\b\w+\b)/);
        if (label) {
          symbols.push({
            containerName: 'Label',
            name: label[1],
            kind: vscode.SymbolKind.Method,
            location: new vscode.Location(document.uri, line.range)
          });
        }
      }

      resolve(symbols);
    });
  }
}
