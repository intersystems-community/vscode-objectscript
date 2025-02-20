import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { DocumentContentProvider } from "./DocumentContentProvider";
import { filesystemSchemas } from "../extension";
import { fileSpecFromURI, isfsConfig } from "../utils/FileProviderUtil";
import { allDocumentsInWorkspace } from "../utils/documentIndex";
import { handleError, queryToFuzzyLike } from "../utils";

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private readonly _sqlPrefix: string =
    "SELECT mem.Name, mem.Parent, mem.Type FROM (" +
    " SELECT Name, Name AS Parent, 'Class' AS Type FROM %Dictionary.ClassDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Method' AS Type FROM %Dictionary.MethodDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Property' AS Type FROM %Dictionary.PropertyDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Parameter' AS Type FROM %Dictionary.ParameterDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Index' AS Type FROM %Dictionary.IndexDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'ForeignKey' AS Type FROM %Dictionary.ForeignKeyDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'XData' AS Type FROM %Dictionary.XDataDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Query' AS Type FROM %Dictionary.QueryDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Trigger' AS Type FROM %Dictionary.TriggerDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Storage' AS Type FROM %Dictionary.StorageDefinition" +
    " UNION SELECT Name, Parent->ID AS Parent, 'Projection' AS Type FROM %Dictionary.ProjectionDefinition" +
    ") AS mem ";

  private readonly _sqlPrj: string =
    "JOIN %Studio.Project_ProjectItemsList(?) AS pil ON mem.Parent = pil.Name AND pil.Type = 'CLS'";

  private readonly _sqlDocs: string =
    "JOIN %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,1,0,?,'Type = 4',0,?) AS sod ON mem.Parent = $EXTRACT(sod.Name,1,$LENGTH(sod.Name)-4)";

  private readonly _sqlSuffix: string = " WHERE LOWER(mem.Name) LIKE ? ESCAPE '\\'";

  /**
   * Convert the query results to VS Code symbols. Needs to be typed as `any[]`
   * because we aren't including ranges. They will be resolved later.
   */
  private _queryResultToSymbols(data: any, wsFolder: vscode.WorkspaceFolder): any[] {
    const result = [];
    const uris: Map<string, vscode.Uri> = new Map();
    for (const element of data.result.content) {
      const kind: vscode.SymbolKind = (() => {
        switch (element.Type) {
          case "Method":
            return vscode.SymbolKind.Method;
          case "Query":
            return vscode.SymbolKind.Function;
          case "Trigger":
            return vscode.SymbolKind.Event;
          case "Parameter":
            return vscode.SymbolKind.Constant;
          case "Index":
            return vscode.SymbolKind.Array;
          case "ForeignKey":
            return vscode.SymbolKind.Key;
          case "XData":
            return vscode.SymbolKind.Struct;
          case "Storage":
            return vscode.SymbolKind.Object;
          case "Projection":
            return vscode.SymbolKind.Interface;
          case "Class":
            return vscode.SymbolKind.Class;
          default:
            // Property and Relationship
            return vscode.SymbolKind.Property;
        }
      })();

      let uri: vscode.Uri;
      if (uris.has(element.Parent)) {
        uri = uris.get(element.Parent);
      } else {
        uri = DocumentContentProvider.getUri(
          `${element.Parent}.cls`,
          wsFolder.name,
          undefined,
          undefined,
          wsFolder.uri,
          // Only "file" scheme is fully supported for client-side editing
          wsFolder.uri.scheme != "file"
        );
        uris.set(element.Parent, uri);
      }

      result.push({
        name: element.Name,
        containerName: element.Type,
        kind,
        location: {
          uri,
        },
      });
    }
    return result;
  }

  public async provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken
  ): Promise<vscode.SymbolInformation[]> {
    if (!vscode.workspace.workspaceFolders?.length) return;
    // Convert query to a LIKE compatible pattern
    const pattern = queryToFuzzyLike(query);
    if (token.isCancellationRequested) return;
    // Get results for all workspace folders
    return Promise.allSettled(
      vscode.workspace.workspaceFolders.map((wsFolder) => {
        if (filesystemSchemas.includes(wsFolder.uri.scheme)) {
          const { csp, system, generated, mapped, project } = isfsConfig(wsFolder.uri);
          if (csp) {
            // No classes or class members in web application folders
            return Promise.resolve([]);
          } else {
            const api = new AtelierAPI(wsFolder.uri);
            if (!api.active || token.isCancellationRequested) return Promise.resolve([]);
            return api
              .actionQuery(`${this._sqlPrefix}${project.length ? this._sqlPrj : this._sqlDocs}${this._sqlSuffix}`, [
                project.length ? project : fileSpecFromURI(wsFolder.uri),
                system || api.ns == "%SYS" ? "1" : "0",
                generated ? "1" : "0",
                mapped ? "1" : "0",
                pattern,
              ])
              .then((data) => (token.isCancellationRequested ? [] : this._queryResultToSymbols(data, wsFolder)));
          }
        } else {
          // Use the document index to determine the classes to search
          const api = new AtelierAPI(wsFolder.uri);
          if (!api.active) return Promise.resolve([]);
          const docs = allDocumentsInWorkspace(wsFolder).filter((d) => d.endsWith(".cls"));
          if (!docs.length || token.isCancellationRequested) return Promise.resolve([]);
          return api
            .actionQuery(`${this._sqlPrefix}${this._sqlSuffix} AND mem.Parent %INLIST $LISTFROMSTRING(?)`, [
              pattern,
              docs.map((d) => d.slice(0, -4)).join(","),
            ])
            .then((data) => (token.isCancellationRequested ? [] : this._queryResultToSymbols(data, wsFolder)));
        }
      })
    ).then((results) =>
      results.flatMap((result) => {
        if (result.status == "fulfilled") {
          return result.value;
        } else {
          handleError(result.reason);
          return [];
        }
      })
    );
  }

  resolveWorkspaceSymbol(symbol: vscode.SymbolInformation): vscode.ProviderResult<vscode.SymbolInformation> {
    return vscode.commands
      .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", symbol.location.uri)
      .then((docSymbols) => {
        if (!Array.isArray(docSymbols) || !docSymbols.length) return;
        if (symbol.kind == vscode.SymbolKind.Class) {
          symbol.location.range = docSymbols[0].selectionRange;
        } else {
          const memberType = symbol.containerName.toUpperCase();
          const unquote = (n: string): string => {
            return n[0] == '"' ? n.slice(1, -1).replace(/""/g, '"') : n;
          };
          for (const docSymbol of docSymbols[0].children) {
            if (unquote(docSymbol.name) == symbol.name && docSymbol.detail.toUpperCase().includes(memberType)) {
              symbol.location.range = docSymbol.selectionRange;
              break;
            }
          }
        }
        return symbol;
      });
  }
}
