import * as vscode from "vscode";
import { DocSearchResult } from "../../api/atelier";
import { AtelierAPI } from "../../api";

export class FileSearchProvider implements vscode.FileSearchProvider {
  /**
   * Provide the set of files that match a certain file path pattern.
   * @param query The parameters for this query.
   * @param options A set of options to consider while searching files.
   * @param token A cancellation token.
   */
  public provideFileSearchResults(
    query: vscode.FileSearchQuery,
    options: vscode.FileSearchOptions,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Uri[]> {
    const category = `&${options.folder.query}&`.includes("&csp&") ? "CSP" : "*";
    const generated = `&${options.folder.query}&`.includes("&generated=1&");
    const api = new AtelierAPI(options.folder);
    let counter = 0;
    if (!api.enabled) {
      return null;
    }
    return api
      .getDocNames({
        filter: query.pattern,
        category,
        generated,
      })
      .then((data) => data.result.content)
      .then((files: DocSearchResult[]) =>
        files
          .map((file) => {
            if (category === "*" && file.cat === "CSP") {
              return null;
            }
            if (file.cat !== "CSP") {
              if (file.name.startsWith("%") && api.ns !== "%SYS") {
                return null;
              }
              const nameParts = file.name.split(".");
              file.name = nameParts.slice(0, -2).join("/") + "/" + nameParts.slice(-2).join(".");
            }
            if (!options.maxResults || ++counter <= options.maxResults) {
              return options.folder.with({ path: `/${file.name}` });
            } else {
              return null;
            }
          })
          .filter((el) => el !== null)
      );
  }
}
