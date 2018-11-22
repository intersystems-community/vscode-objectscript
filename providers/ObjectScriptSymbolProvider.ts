import * as vscode from 'vscode';

export class ObjectScriptSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Thenable<vscode.SymbolInformation[]> {
    return new Promise(resolve => {
      var symbols: any[] = [];

      // This line is here purely to satisfy linter
      token = token;

      const isClass = document.fileName.toLowerCase().endsWith('cls');
      for (var i = 0; i < document.lineCount; i++) {
        var line = document.lineAt(i);

        if (isClass) {
          let method = line.text.match(/^(?:Class|Client)?Method ([^(]+)/i);
          if (method) {
            symbols.push({
              name: method[1],
              kind: vscode.SymbolKind.Method,
              location: new vscode.Location(document.uri, line.range)
            });
          }

          let property = line.text.match(/^(?:Property|Relationship) (\b\w+\b)/i);
          if (property) {
            symbols.push({
              name: property[1],
              kind: vscode.SymbolKind.Property,
              location: new vscode.Location(document.uri, line.range)
            });
          }

          let parameter = line.text.match(/^Parameter (\b\w+\b)/i);
          if (parameter) {
            symbols.push({
              name: parameter[1],
              kind: vscode.SymbolKind.TypeParameter,
              location: new vscode.Location(document.uri, line.range)
            });
          }

          let xdata = line.text.match(/^XData (\b\w+\b)/i);
          if (xdata) {
            symbols.push({
              name: xdata[1],
              kind: vscode.SymbolKind.Struct,
              location: new vscode.Location(document.uri, line.range)
            });
          }
        } else {
          let label = line.text.match(/^(\b\w+\b)/);
          if (label) {
            symbols.push({
              name: label[1],
              kind: vscode.SymbolKind.Method,
              location: new vscode.Location(document.uri, line.range)
            });
          }
        }
      }

      resolve(symbols);
    });
  }
}
