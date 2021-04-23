import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { ClassDefinition } from "../utils/classDefinition";
import { DocumentContentProvider } from "./DocumentContentProvider";
import { config } from "../extension";

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  public provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (query.length < 3) {
      return null;
    }
    return Promise.all([this.byStudioDocuments(query), this.byMethods(query)]).then(([documents, methods]) => [
      ...documents,
      ...methods,
    ]);
  }

  private getApi(): AtelierAPI {
    const currentFileUri = vscode.window.activeTextEditor?.document.uri;
    const firstFolder = vscode.workspace.workspaceFolders?.length ? vscode.workspace.workspaceFolders[0] : undefined;
    return new AtelierAPI(currentFileUri || firstFolder?.uri || "");
  }

  private async byStudioDocuments(query: string): Promise<vscode.SymbolInformation[]> {
    const searchAllDocTypes = config("searchAllDocTypes");
    if (searchAllDocTypes) {
      // Note: This query could be expensive if there are too many files available across the namespaces
      // configured in the current vs code workspace. However, delimiting by specific file types
      // means custom Studio documents cannot be found. So this is a trade off
      query = `*${query}*`;
    } else {
      // Default is to only search classes, routines and include files
      query = `*${query}*.cls,*${query}*.mac,*${query}*.int,*${query}*.inc`;
    }
    const sql = `SELECT TOP 10 Name FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)`;
    const api = this.getApi();
    const direction = "1";
    const orderBy = "1";
    const systemFiles = "1";
    const flat = "1";
    const notStudio = "0";
    const generated = "0";

    const kindFromName = (name: string) => {
      const nameLowerCase = name.toLowerCase();
      return nameLowerCase.endsWith("cls")
        ? vscode.SymbolKind.Class
        : nameLowerCase.endsWith("zpm")
        ? vscode.SymbolKind.Module
        : vscode.SymbolKind.File;
    };
    const data = await api.actionQuery(sql, [query, direction, orderBy, systemFiles, flat, notStudio, generated]);
    return data.result.content.map(({ Name }) => ({
      kind: kindFromName(Name),
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
