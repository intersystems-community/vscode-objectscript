import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { currentWorkspaceFolder } from "../utils";
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

  public provideWorkspaceSymbols(query: string): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (query.length === 0) {
      return null;
    }
    let pattern = "";
    for (let i = 0; i < query.length; i++) {
      const char = query.charAt(i);
      pattern += char === "*" || char === "?" ? `*\\${char}` : `*${char}`;
    }
    const workspace = currentWorkspaceFolder();
    const api = new AtelierAPI(workspace);
    return api.actionQuery(this.sql, [pattern.toUpperCase() + "*"]).then((data) => {
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
          uri = DocumentContentProvider.getUri(`${element.Parent}.cls`, workspace);
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
    });
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
