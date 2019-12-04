import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { ClassDefinition } from "../utils/classDefinition";
import { DocumentContentProvider } from "./DocumentContentProvider";

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  public provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (query.length < 3) {
      return null;
    }
    return Promise.all([this.byClasses(query), this.byRoutines(query), this.byMethods(query)]).then(
      ([classes, routines, methods]) => [...classes, ...routines, ...methods]
    );
  }

  public async byClasses(query: string): Promise<vscode.SymbolInformation[]> {
    query = query.toUpperCase();
    query = `*${query}*`;
    const library = query.replace(/%(\b\w+\b(?!\.))/, "%LIBRARY.$1");
    const sql = `
    SELECT TOP 10 Name ClassName FROM %Dictionary.ClassDefinition
    WHERE %SQLUPPER Name %MATCHES ? OR %SQLUPPER Name %MATCHES ?`;
    const api = new AtelierAPI();
    const data = await api.actionQuery(sql, [library, query]);
    return data.result.content.map(({ ClassName }) => ({
      kind: vscode.SymbolKind.Class,
      location: {
        uri: new ClassDefinition(ClassName).uri,
      },
      name: ClassName,
    }));
  }

  public async byRoutines(query: string): Promise<vscode.SymbolInformation[]> {
    query = `*${query}*.mac,*${query}*.int`;
    const sql = `CALL %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)`;
    const api = new AtelierAPI();
    const direction = "1";
    const orderBy = "1";
    const systemFiles = "0";
    const flat = "1";
    const notStudio = "0";
    const generated = "0";

    const data = await api.actionQuery(sql, [query, direction, orderBy, systemFiles, flat, notStudio, generated]);
    return data.result.content.map(({ Name }) => ({
      kind: vscode.SymbolKind.File,
      location: {
        uri: DocumentContentProvider.getUri(Name),
      },
      name: Name,
    }));
  }

  public async byMethods(query: string): Promise<vscode.SymbolInformation[]> {
    query = query.toUpperCase();
    query = `*${query}*`;
    const getLocation = async (className, name) => {
      const classDef = new ClassDefinition(className);
      return classDef.getMemberLocation(name);
    };
    const sql = `
      SELECT TOP 10 Parent ClassName, Name FROM %Dictionary.MethodDefinition WHERE %SQLUPPER Name %MATCHES ?`;
    const api = new AtelierAPI();
    return api
      .actionQuery(sql, [query])
      .then((data): Promise<vscode.SymbolInformation>[] =>
        data.result.content.map(
          async ({ ClassName, Name }): Promise<vscode.SymbolInformation> =>
            new vscode.SymbolInformation(Name, vscode.SymbolKind.Method, ClassName, await getLocation(ClassName, Name))
        )
      )
      .then(data => Promise.all(data));
  }
}
