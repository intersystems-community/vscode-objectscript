import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { DocumentContentProvider } from "./DocumentContentProvider";

export class WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private sql: string =
    "SELECT * FROM (" +
    "SELECT Name, Parent->ID AS Parent, 'method' AS Type FROM %Dictionary.MethodDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'property' AS Type FROM %Dictionary.PropertyDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'parameter' AS Type FROM %Dictionary.ParameterDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'index' AS Type FROM %Dictionary.IndexDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'foreignkey' AS Type FROM %Dictionary.ForeignKeyDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'xdata' AS Type FROM %Dictionary.XDataDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'query' AS Type FROM %Dictionary.QueryDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'trigger' AS Type FROM %Dictionary.TriggerDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'storage' AS Type FROM %Dictionary.StorageDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'projection' AS Type FROM %Dictionary.ProjectionDefinition" +
    ") WHERE %SQLUPPER Name %MATCHES ?";

  private sqlNoSystem: string =
    "SELECT dict.Name, dict.Parent, dict.Type FROM (" +
    "SELECT Name, Parent->ID AS Parent, 'method' AS Type FROM %Dictionary.MethodDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'property' AS Type FROM %Dictionary.PropertyDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'parameter' AS Type FROM %Dictionary.ParameterDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'index' AS Type FROM %Dictionary.IndexDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'foreignkey' AS Type FROM %Dictionary.ForeignKeyDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'xdata' AS Type FROM %Dictionary.XDataDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'query' AS Type FROM %Dictionary.QueryDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'trigger' AS Type FROM %Dictionary.TriggerDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'storage' AS Type FROM %Dictionary.StorageDefinition" +
    " UNION ALL %PARALLEL " +
    "SELECT Name, Parent->ID AS Parent, 'projection' AS Type FROM %Dictionary.ProjectionDefinition" +
    ") AS dict, (" +
    "SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)" +
    ") AS sod WHERE %SQLUPPER dict.Name %MATCHES ? AND {fn CONCAT(dict.Parent,'.cls')} = sod.Name";

  private queryResultToSymbols(data: any, folderUri: vscode.Uri) {
    const result = [];
    const uris: Map<string, vscode.Uri> = new Map();
    for (const element of data.result.content) {
      const kind: vscode.SymbolKind = (() => {
        switch (element.Type) {
          case "query":
          case "method":
            return vscode.SymbolKind.Method;
          case "parameter":
            return vscode.SymbolKind.Constant;
          case "index":
            return vscode.SymbolKind.Key;
          case "xdata":
          case "storage":
            return vscode.SymbolKind.Struct;
          case "property":
          default:
            return vscode.SymbolKind.Property;
        }
      })();

      let uri: vscode.Uri;
      if (uris.has(element.Parent)) {
        uri = uris.get(element.Parent);
      } else {
        uri = DocumentContentProvider.getUri(`${element.Parent}.cls`, undefined, undefined, undefined, folderUri);
        uris.set(element.Parent, uri);
      }

      result.push({
        name: element.Name,
        containerName:
          element.Type === "foreignkey" ? "ForeignKey" : element.Type.charAt(0).toUpperCase() + element.Type.slice(1),
        kind,
        location: {
          uri,
        },
      });
    }
    return result;
  }

  public async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    if (query.length === 0) {
      return null;
    }
    // Convert query to a %MATCHES compatible pattern
    let pattern = "";
    for (let i = 0; i < query.length; i++) {
      const char = query.charAt(i);
      pattern += char === "*" || char === "?" ? `*\\${char}` : `*${char}`;
    }
    pattern = pattern.toUpperCase() + "*";
    // Filter the folders to search so we don't query the same ns on the same server twice
    const serversToQuery: {
      api: AtelierAPI;
      uri: vscode.Uri;
      system: boolean;
    }[] = [];
    for (const folder of vscode.workspace.workspaceFolders) {
      const folderApi = new AtelierAPI(folder.uri);
      const found = serversToQuery.findIndex(
        (server) =>
          server.api.config.host.toLowerCase() === folderApi.config.host.toLowerCase() &&
          server.api.config.port === folderApi.config.port &&
          server.api.config.pathPrefix.toLowerCase() === folderApi.config.pathPrefix.toLowerCase() &&
          server.api.config.ns.toLowerCase() === folderApi.config.ns.toLowerCase()
      );
      if (found === -1) {
        serversToQuery.push({
          api: folderApi,
          uri: folder.uri,
          system: true,
        });
      } else if (serversToQuery[found].uri.scheme.startsWith("isfs") && !folder.uri.scheme.startsWith("isfs")) {
        // If we have multiple folders connected to the same server and ns
        // and one is not isfs, keep the non-isfs one
        serversToQuery[found].uri = folder.uri;
      }
    }
    serversToQuery.map((server) => {
      if (server.api.config.ns.toLowerCase() !== "%sys") {
        const found = serversToQuery.findIndex(
          (server2) =>
            server2.api.config.host.toLowerCase() === server.api.config.host.toLowerCase() &&
            server2.api.config.port === server.api.config.port &&
            server2.api.config.pathPrefix.toLowerCase() === server.api.config.pathPrefix.toLowerCase() &&
            server2.api.config.ns.toLowerCase() === "%sys"
        );
        if (found !== -1) {
          server.system = false;
        }
      }
      return server;
    });
    return Promise.allSettled(
      serversToQuery
        .map((server) => {
          // Set the system property so we don't show system items multiple times if this
          // workspace is connected to both the %SYS and a non-%SYS namespace on the same server
          if (server.api.config.ns.toLowerCase() !== "%sys") {
            const found = serversToQuery.findIndex(
              (server2) =>
                server2.api.config.host.toLowerCase() === server.api.config.host.toLowerCase() &&
                server2.api.config.port === server.api.config.port &&
                server2.api.config.pathPrefix.toLowerCase() === server.api.config.pathPrefix.toLowerCase() &&
                server2.api.config.ns.toLowerCase() === "%sys"
            );
            if (found !== -1) {
              server.system = false;
            }
          }
          return server;
        })
        .map((server) =>
          server.system
            ? server.api.actionQuery(this.sql, [pattern]).then((data) => this.queryResultToSymbols(data, server.uri))
            : server.api
                .actionQuery(this.sqlNoSystem, ["*.cls", "1", "1", "0", "1", "0", "0", pattern])
                .then((data) => this.queryResultToSymbols(data, server.uri))
        )
    ).then((results) => results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])));
  }

  resolveWorkspaceSymbol(symbol: vscode.SymbolInformation): vscode.ProviderResult<vscode.SymbolInformation> {
    return vscode.commands
      .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", symbol.location.uri)
      .then((docSymbols) => {
        for (const docSymbol of docSymbols[0].children) {
          if (docSymbol.name === symbol.name && docSymbol.kind === symbol.kind) {
            symbol.location.range = docSymbol.selectionRange;
            break;
          }
        }
        return symbol;
      });
  }
}
