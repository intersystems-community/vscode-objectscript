import * as vscode from 'vscode';

export class ObjectScriptClassSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Thenable<vscode.SymbolInformation[]> {
    return new Promise(resolve => {
      var symbols: vscode.SymbolInformation[] = [];

      for (var i = 0; i < document.lineCount; i++) {
        var line = document.lineAt(i);

        let method = line.text.match(/^((?:Class|Client)?Method) ([^(]+)/i);
        if (method) {
          let start = line.range.start;
          while (i++ && i < document.lineCount) {
            line = document.lineAt(i);
            if (line.text.match('^}')) {
              break;
            }
          }
          let end = line.range.end;
          symbols.push({
            containerName: method[1],
            name: method[2].replace(/"/g, ''),
            kind: vscode.SymbolKind.Method,
            location: new vscode.Location(document.uri, new vscode.Range(start, end))
          });
        }

        let property = line.text.match(/^(Property|Relationship) (\b\w+\b)/i);
        if (property) {
          symbols.push({
            containerName: property[1],
            name: property[2],
            kind: vscode.SymbolKind.Property,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        let parameter = line.text.match(/^(Parameter) (\b\w+\b)/i);
        if (parameter) {
          symbols.push({
            containerName: parameter[1],
            name: parameter[2],
            kind: vscode.SymbolKind.Constant,
            location: new vscode.Location(document.uri, line.range)
          });
        }

        let xdata = line.text.match(/^(XData) (\b\w+\b)/i);
        if (xdata) {
          symbols.push({
            containerName: xdata[1],
            name: xdata[2],
            kind: vscode.SymbolKind.Struct,
            location: new vscode.Location(document.uri, line.range)
          });
        }
      }

      resolve(symbols);
    });
  }
}
