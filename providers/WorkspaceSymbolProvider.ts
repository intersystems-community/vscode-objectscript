import * as vscode from 'vscode';
import { AtelierAPI } from '../api';
import { DocumentContentProvider } from './DocumentContentProvider';
import { ClassDefinition } from '../utils/classDefinition';

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (query.length < 3) {
      return null;
    }
    query = query.toUpperCase();
    query = `*${query}*`;
    let library = query.replace(/%(\b\w+\b(?!\.))/, '%LIBRARY.$1');
    let sql = `
    SELECT TOP 10 ID FROM %Dictionary.ClassDefinition WHERE %SQLUPPER Name %MATCHES ? OR %SQLUPPER Name %MATCHES ?
    UNION
    SELECT TOP 10 ID FROM %Dictionary.MethodDefinition WHERE %SQLUPPER Name %MATCHES ?
    `;
    let api = new AtelierAPI();
    return api.actionQuery(sql, [library, query, query]).then(data => {
      let result = data.result.content;
      return result.map(el => {
        let item;
        let [className, method] = el.ID.split('||');
        let uri = DocumentContentProvider.getUri(ClassDefinition.normalizeClassName(className, true));
        if (method) {
          item = {
            name: method,
            container: className,
            kind: vscode.SymbolKind.Method,
            location: {
              uri
            }
          };
        } else {
          item = {
            name: el.ID,
            kind: vscode.SymbolKind.Class,
            location: {
              uri
            }
          };
        }
        return item;
      });
    });
  }
}
