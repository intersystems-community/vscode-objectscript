import * as vscode from "vscode";
import * as url from "url";
import { StudioOpenDialog } from "../../queries";
import { studioOpenDialogFromURI } from "../../utils/FileProviderUtil";
import { notNull } from "../../utils";
import { DocumentContentProvider } from "../DocumentContentProvider";

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
    if (token.isCancellationRequested) {
      return;
    }
    return studioOpenDialogFromURI(options.folder, { flat: true, filter: filter })
      .then((data) => {
        return data.result.content;
      })
      .then((data: StudioOpenDialog[]) => {
        return data
          .map((item: StudioOpenDialog) => {
            if (token.isCancellationRequested) {
              return null;
            }
            if (!options.maxResults || ++counter <= options.maxResults) {
              return DocumentContentProvider.getUri(item.Name, "", "", true, options.folder);
            } else {
              return null;
            }
          })
          .filter(notNull);
      });
  }
}
