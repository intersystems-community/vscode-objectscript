import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { ClassDefinition } from "../utils/classDefinition";
import { DocumentContentProvider } from "./DocumentContentProvider";
import { StudioOpenDialog } from "../queries";

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  public provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (query.length < 3) {
      return null;
    }
    return Promise.all([
      this.byClasses(query),
      this.byRoutines(query),
      this.byMethods(query),
    ]).then(([classes, routines, methods]) => [...classes, ...routines, ...methods]);
  }

  private getApi(): AtelierAPI {
    const currentFileUri = vscode.window.activeTextEditor?.document.uri;
    const firstFolder = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined;
    return new AtelierAPI(currentFileUri || firstFolder?.uri || "");
  }

  private async byClasses(query: string): Promise<vscode.SymbolInformation[]> {
    query = query.toUpperCase();
    query = `*${query}*`;
    const library = query.replace(/%(\b\w+\b(?!\.))/, "%LIBRARY.$1");
    const sql = `
    SELECT TOP 10 Name ClassName FROM %Dictionary.ClassDefinition
    WHERE %SQLUPPER Name %MATCHES ? OR %SQLUPPER Name %MATCHES ?`;
    const api = this.getApi();
    const data = await api.actionQuery(sql, [library, query]);
    return data.result.content.map(({ ClassName }) => ({
      kind: vscode.SymbolKind.Class,
      location: {
        uri: new ClassDefinition(ClassName, undefined, api.ns).uri,
      },
      name: ClassName,
    }));
  }

  private async byRoutines(query: string): Promise<vscode.SymbolInformation[]> {
    query = `*${query}*.mac,*${query}*.int`;
    const sql = `CALL %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)`;
    const api = this.getApi();
    const direction = "1";
    const orderBy = "1";
    const systemFiles = "0";
    const flat = "1";
    const notStudio = "0";
    const generated = "0";

    const data = await api.actionQuery(sql, [query, direction, orderBy, systemFiles, flat, notStudio, generated]);
    return data.result.content.map(({ Name }: StudioOpenDialog) => ({
      kind: vscode.SymbolKind.File,
      location: {
        uri: DocumentContentProvider.getUri(Name, undefined, api.ns),
      },
      name: Name,
    }));
  }

  private async byMethods(query: string): Promise<vscode.SymbolInformation[]> {
    const api = this.getApi();
    query = query.toUpperCase();
    query = `*${query}*`;
    const getLocation = async (className, name) => {
      const classDef = new ClassDefinition(className, undefined, api.ns);
      return classDef.getMemberLocation(name);
    };
    const sql = `
      SELECT TOP 10 Parent ClassName, Name FROM %Dictionary.MethodDefinition WHERE %SQLUPPER Name %MATCHES ?`;
    return api
      .actionQuery(sql, [query])
      .then((data): Promise<vscode.SymbolInformation>[] =>
        data.result.content.map(
          async ({ ClassName, Name }): Promise<vscode.SymbolInformation> =>
            new vscode.SymbolInformation(Name, vscode.SymbolKind.Method, ClassName, await getLocation(ClassName, Name))
        )
      )
      .then((data) => Promise.all(data));
  }
}
