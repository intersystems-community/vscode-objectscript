import * as vscode from "vscode";
import * as url from "url";
import { AtelierAPI } from "../../api";
import { StudioOpenDialog } from "../../queries";
import { studioOpenDialogFromURI } from "../../utils/FileProviderUtil";

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
    const uri = url.parse(options.folder.toString(true), true);
    const csp = uri.query.csp === "" || uri.query.csp === "1";
    let filter = query.pattern;
    if (!csp) {
      if (options.folder.path !== "/") {
        filter = options.folder.path.slice(1) + "/%" + filter;
      }
      filter = filter.replace(/\//g, ".");
    }
    if (filter.length) {
      filter = "Name Like '%" + filter + "%'";
    } else {
      // When this is called without a query.pattern, every file is supposed to be returned, so do not provide a filter
      filter = "";
    }
    let counter = 0;
    return studioOpenDialogFromURI(options.folder, { flat: true, filter: filter })
      .then((data) => {
        return data.result.content;
      })
      .then((data: StudioOpenDialog[]) => {
        const api = new AtelierAPI(options.folder);
        return data
          .map((item: StudioOpenDialog) => {
            // item.Type only matters here if it is 5 (CSP)
            if (item.Type == "5" && !csp) {
              return null;
            }
            if (item.Type !== "5") {
              if (item.Name.startsWith("%") && api.ns !== "%SYS") {
                return null;
              }
              // Convert dotted name to slashed one, treating the likes of ABC.1.int or DEF.T1.int in the same way
              // as the Studio dialog does.
              const nameParts = item.Name.split(".");
              const dotParts = nameParts
                .slice(-2)
                .join(".")
                .match(/^[A-Z]?\d*[.](mac|int|inc)$/)
                ? 3
                : 2;
              item.Name = nameParts.slice(0, -dotParts).join("/") + "/" + nameParts.slice(-dotParts).join(".");
            }
            if (!options.maxResults || ++counter <= options.maxResults) {
              return vscode.Uri.parse(`${options.folder.scheme}://${options.folder.authority}/${item.Name}`, true);
            } else {
              return null;
            }
          })
          .filter((el) => el !== null);
      });
  }
}
