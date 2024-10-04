import * as vscode from "vscode";
import { projectContentsFromUri, studioOpenDialogFromURI } from "../../utils/FileProviderUtil";
import { notNull } from "../../utils";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { ProjectItem } from "../../commands/project";

export class FileSearchProvider implements vscode.FileSearchProvider {
  /**
   * Provide the set of files that match a certain file path pattern.
   * @param query The parameters for this query.
   * @param options A set of options to consider while searching files.
   * @param token A cancellation token.
   */
  public async provideFileSearchResults(
    query: vscode.FileSearchQuery,
    options: vscode.FileSearchOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.Uri[]> {
    let counter = 0;
    let pattern = query.pattern.charAt(0) == "/" ? query.pattern.slice(1) : query.pattern;

    // Drop a leading **/ from the glob pattern if it exists. This gets added by Find widget of Explorer tree (non-fuzzy mode), which since 1.94 uses FileSearchProvider
    if (pattern.startsWith("**/")) {
      pattern = pattern.slice(3);
    } else if (pattern.length && !pattern.includes("*") && options.useGlobalIgnoreFiles) {
      // Heuristic to detect a fuzzy search from Explorer's Find widget (see https://github.com/microsoft/vscode/issues/230483#issuecomment-2393928617)
      pattern = "*" + pattern.split("").join("*") + "*";
    }
    const params = new URLSearchParams(options.folder.query);
    const csp = params.has("csp") && ["", "1"].includes(params.get("csp"));
    if (params.has("project") && params.get("project").length) {
      const patternRegex = new RegExp(`.*${pattern}.*`.replace(/\.|\//g, "[./]"), "i");
      return projectContentsFromUri(options.folder, true).then((docs) =>
        docs
          .map((doc: ProjectItem) => {
            if (token.isCancellationRequested) {
              return null;
            }
            if (pattern.length && !patternRegex.test(doc.Name)) {
              // The document didn't pass the filter
              return null;
            }
            if (!options.maxResults || ++counter <= options.maxResults) {
              return DocumentContentProvider.getUri(doc.Name, "", "", true, options.folder);
            } else {
              return null;
            }
          })
          .filter(notNull)
      );
    }
    // When this is called without a query.pattern, every file is supposed to be returned, so do not provide a filter
    let filter = "";
    if (pattern.length) {
      pattern = !csp ? pattern.replace(/\//g, ".") : pattern;
      filter = `Name LIKE '%${pattern
        // Escape % or _ characters
        .replace(/(_|%|\\)/g, "\\$1")
        // Change glob syntax to SQL LIKE syntax
        .replace(/\*/g, "%")
        .replace(/\?/g, "_")}%' ESCAPE '\\'`;
    }
    if (token.isCancellationRequested) {
      return;
    }
    return studioOpenDialogFromURI(options.folder, { flat: true, filter: filter })
      .then((data) => {
        return data.result.content;
      })
      .then((data: { Name: string; Type: number }[]) => {
        return data
          .map((item) => {
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
