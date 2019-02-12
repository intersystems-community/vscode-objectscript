import * as vscode from 'vscode';
import { AtelierAPI } from '../api';
import { ClassDefinition } from '../utils/classDefinition';

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (query.length < 3) {
      return null;
    }
    return Promise.all([this.byClasses(query), this.byMethods(query)]).then(([classes, methods]) => [
      ...classes,
      ...methods
    ]);
  }

  async byClasses(query: string): Promise<vscode.SymbolInformation[]> {
    query = query.toUpperCase();
    query = `*${query}*`;
    let library = query.replace(/%(\b\w+\b(?!\.))/, '%LIBRARY.$1');
    let sql = `
    SELECT TOP 10 Name ClassName FROM %Dictionary.ClassDefinition WHERE %SQLUPPER Name %MATCHES ? OR %SQLUPPER Name %MATCHES ?`;
    let api = new AtelierAPI();
    const data = await api.actionQuery(sql, [library, query]);
    return data.result.content.map(({ ClassName }) => ({
      name: ClassName,
      kind: vscode.SymbolKind.Class,
      location: {
        uri: new ClassDefinition(ClassName).uri
      }
    }));
  }

  async byMethods(query: string): Promise<vscode.SymbolInformation[]> {
    query = query.toUpperCase();
    query = `*${query}*`;
    const getLocation = async (className, name) => {
      let classDef = new ClassDefinition(className);
      return classDef.getMemberLocation(name);
    };
    let sql = `
      SELECT TOP 10 Parent ClassName, Name FROM %Dictionary.MethodDefinition WHERE %SQLUPPER Name %MATCHES ?`;
    let api = new AtelierAPI();
    return api
      .actionQuery(sql, [query])
      .then(
        (data): Promise<vscode.SymbolInformation>[] =>
          data.result.content.map(
            async ({ ClassName, Name }): Promise<vscode.SymbolInformation> =>
              new vscode.SymbolInformation(
                Name,
                vscode.SymbolKind.Method,
                ClassName,
                await getLocation(ClassName, Name)
              )
          )
      )
      .then(data => Promise.all(data));
  }
}
