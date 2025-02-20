import * as vscode from "vscode";
import { isfsConfig, projectContentsFromUri, studioOpenDialogFromURI } from "../../utils/FileProviderUtil";
import { notNull, queryToFuzzyLike } from "../../utils";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { ProjectItem } from "../../commands/project";

export class FileSearchProvider implements vscode.FileSearchProvider {
  public async provideFileSearchResults(
    query: vscode.FileSearchQuery,
    options: vscode.FileSearchOptions,
    token: vscode.CancellationToken
  ): Promise<vscode.Uri[]> {
    let counter = 0;
    // Replace all back slashes with forward slashes
    let pattern = query.pattern.replace(/\\/g, "/");
    if (pattern.startsWith("/")) {
      // Remove all leading slashes
      pattern = pattern.replace(/^\/+/, "");
    } else if (pattern.startsWith("**/")) {
      // Remove a leading globstar from the pattern.
      // The leading globstar gets added by Find widget of Explorer tree (non-fuzzy mode), which since 1.94 uses FileSearchProvider
      pattern = pattern.slice(3);
    }
    const { csp, project } = isfsConfig(options.folder);
    if (project) {
      // Create a fuzzy match regex to do the filtering here
      let regexStr = ".*";
      for (const c of pattern) regexStr += `${[".", "/"].includes(c) ? "[./]" : c}.*`;
      const patternRegex = new RegExp(regexStr, "i");
      if (token.isCancellationRequested) return;
      return projectContentsFromUri(options.folder, true).then((docs) =>
        docs
          .map((doc: ProjectItem) =>
            !token.isCancellationRequested &&
            // The document matches the query
            (!pattern.length || patternRegex.test(doc.Name)) &&
            // We haven't hit the max number of results
            (!options.maxResults || ++counter <= options.maxResults)
              ? DocumentContentProvider.getUri(doc.Name, "", "", true, options.folder)
              : null
          )
          .filter(notNull)
      );
    }
    // When this is called without a query.pattern every file is supposed to be returned, so do not provide a filter
    const likePattern = queryToFuzzyLike(pattern);
    const filter = pattern.length
      ? `Name LIKE '${!csp ? likePattern.replace(/\//g, ".") : likePattern}' ESCAPE '\\'`
      : "";
    if (token.isCancellationRequested) return;
    return studioOpenDialogFromURI(options.folder, { flat: true, filter }).then((data) =>
      data.result.content
        .map((doc: { Name: string; Type: number }) =>
          !token.isCancellationRequested &&
          // We haven't hit the max number of results
          (!options.maxResults || ++counter <= options.maxResults)
            ? DocumentContentProvider.getUri(doc.Name, "", "", true, options.folder)
            : null
        )
        .filter(notNull)
    );
  }
}
