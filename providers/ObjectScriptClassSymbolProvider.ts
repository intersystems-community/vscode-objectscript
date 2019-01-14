import * as vscode from 'vscode';

export class ObjectScriptClassSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Thenable<vscode.DocumentSymbol[]> {
    // tslint:disable-next-line:cyclomatic-complexity
    return new Promise(resolve => {
      let classItSelf = null;
      let symbols: vscode.DocumentSymbol[] = [];

      for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i);

        let classPat = line.text.match(/^(Class) (%?\b\w+\b(?:\.\b\w+\b)+)/i);
        if (classPat) {
          let end = new vscode.Position(document.lineCount - 1, 0);
          for (let j = document.lineCount - 1; j > i; j--) {
            if (document.lineAt(j).text.startsWith('}')) {
              end = new vscode.Position(j + 1, 0);
              break;
            }
          }
          classItSelf = new vscode.DocumentSymbol(
            classPat[2],
            'Class',
            vscode.SymbolKind.Class,
            new vscode.Range(new vscode.Position(0, 0), end),
            line.range
          );
          symbols.push(classItSelf);
          symbols = classItSelf.children;
        }

        let start = line.range.start;
        for (let j = i; j > 1; j--) {
          if (!document.lineAt(j - 1).text.startsWith('/// ')) {
            start = document.lineAt(j).range.start;
            break;
          }
        }

        let method = line.text.match(/^((?:Class|Client)?Method|Trigger|Query) (\b\w+\b|"[^"]+")/i);
        if (method) {
          let startCode = line.range.start;
          let end = line.range.end;
          while (i++ && i < document.lineCount) {
            if (document.lineAt(i).text.match('^{')) {
              startCode = new vscode.Position(i + 1, 0);
            }
            if (document.lineAt(i).text.match('^}')) {
              end = document.lineAt(i).range.end;
              break;
            }
          }
          symbols.push({
            detail: method[1],
            name: method[2].replace(/"/g, ''),
            kind: vscode.SymbolKind.Method,
            children: undefined,
            range: new vscode.Range(start, end),
            selectionRange: new vscode.Range(startCode, end)
          });
        }

        let index = line.text.match(/^(Index|ForegnKey) (\b\w+\b)/i);
        if (index) {
          symbols.push({
            detail: index[1],
            name: index[2],
            kind: vscode.SymbolKind.Key,
            children: undefined,
            range: new vscode.Range(start, line.range.end),
            selectionRange: line.range
          });
        }

        let property = line.text.match(/^(Property|Relationship) (\b\w+\b|"[^"]+")/i);
        if (property) {
          let end = line.range.end;
          if (!line.text.endsWith(';')) {
            while (i++ && i < document.lineCount) {
              if (document.lineAt(i).text.endsWith(';')) {
                end = document.lineAt(i).range.end;
                break;
              }
            }
          }
          symbols.push({
            detail: property[1],
            name: property[2],
            kind: vscode.SymbolKind.Property,
            children: undefined,
            range: new vscode.Range(start, end),
            selectionRange: line.range
          });
        }

        let parameter = line.text.match(/^(Parameter) (\b\w+\b)/i);
        if (parameter) {
          symbols.push({
            detail: parameter[1],
            name: parameter[2],
            kind: vscode.SymbolKind.Constant,
            children: undefined,
            range: new vscode.Range(start, line.range.end),
            selectionRange: line.range
          });
        }

        let other = line.text.match(/^(XData|Storage) (\b\w+\b)/i);
        if (other) {
          let startCode = line.range.start;
          let end = line.range.end;
          while (i++ && i < document.lineCount) {
            if (document.lineAt(i).text.match('^{')) {
              startCode = new vscode.Position(i + 1, 0);
            }
            if (document.lineAt(i).text.match('^}')) {
              end = document.lineAt(i).range.end;
              break;
            }
          }
          symbols.push({
            detail: other[1],
            name: other[2],
            kind: vscode.SymbolKind.Struct,
            children: undefined,
            range: new vscode.Range(start, end),
            selectionRange: new vscode.Range(startCode, end)
          });
        }
      }

      resolve([classItSelf]);
    });
  }
}
