import * as vscode from "vscode";
import * as url from "url";
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
    const folderQuery = url.parse(options.folder.toString(true), true).query;
    const type = folderQuery.type || "all";
    const category =
      folderQuery.csp === "" || folderQuery.csp === "1" ? "CSP" : type === "cls" ? "CLS" : type === "rtn" ? "RTN" : "*";
    const generated = folderQuery.generated && folderQuery.generated === "1";
    const api = new AtelierAPI(options.folder);
    let filter = query.pattern;
    if (category !== "CSP") {
      if (options.folder.path !== "/") {
        filter = options.folder.path.slice(1) + "/%" + filter;
      }
      filter = filter.replace(/\//g, ".");
    }
    let counter = 0;
    if (!api.enabled) {
      return null;
    }
    return api
      .getDocNames({
        filter,
        category,
        generated,
      })
      .then((data) => data.result.content)
      .then((files: DocSearchResult[]) =>
        files
          .map((file) => {
            if (category !== "CSP" && file.cat === "CSP") {
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
