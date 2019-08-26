import * as vscode from "vscode";
import { AtelierSearchResult, AtelierSearchMatch } from "../../atelier";
import { AtelierAPI } from "../../api";
import { DocumentContentProvider } from "../DocumentContentProvider";

export class TextSearchProvider implements vscode.TextSearchProvider {
  /**
   * Provide results that match the given text pattern.
   * @param query The parameters for this query.
   * @param options A set of options to consider while searching.
   * @param progress A progress callback that must be invoked for all results.
   * @param token A cancellation token.
   */
  public provideTextSearchResults(
    query: vscode.TextSearchQuery,
    options: vscode.TextSearchOptions,
    progress: vscode.Progress<vscode.TextSearchResult>,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextSearchComplete> {
    const api = new AtelierAPI();
    let counter = 0;
    if (!api.enabled) {
      return null;
    }
    return api
      .actionSearch({
        query: query.pattern,
        regex: query.isRegExp,
        word: query.isWordMatch,
        case: query.isCaseSensitive,
      })
      .then(data => data.result)
      .then((files: AtelierSearchResult[]) =>
        files.map(async file => {
          const fileName = file.doc;
          const uri = DocumentContentProvider.getUri(fileName);
          const document = await vscode.workspace.openTextDocument(uri);
          return {
            ...file,
            uri,
            document,
          };
        })
      )
      .then(files => Promise.all(files))
      .then(files => {
        files.forEach(file => {
          const { uri, document, matches } = file;
          matches.forEach((match: AtelierSearchMatch) => {
            const { text, member } = match;
            let { line } = match;
            if (member) {
              const memberMatchPattern = new RegExp(`((?:Class)?Method|Property|XData|Query|Trigger) ${member}`, "i");
              for (let i = 0; i < document.lineCount; i++) {
                const text = document.lineAt(i).text;
                if (text.match(memberMatchPattern)) {
                  line = line ? line + i + 1 : i;
                }
              }
            }
            progress.report({
              uri,
              lineNumber: line || 1,
              text,
            });
            counter++;
            if (counter >= options.maxResults) {
              return;
            }
          });
        });
        return { limitHit: counter >= options.maxResults };
      });
  }
}
