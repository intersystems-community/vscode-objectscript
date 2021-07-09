import * as vscode from "vscode";
import { SearchResult, SearchMatch } from "../../api/atelier";
import { AtelierAPI } from "../../api";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { outputChannel } from "../../utils";

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
    const api = new AtelierAPI(options.folder);
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
        // If options.maxResults is null the search is supposed to return an unlimited number of results
        // Since there's no way for us to pass "unlimited" to the server, I choose a very large number
        max: options.maxResults ?? 100000,
      })
      .then((data) => data.result)
      .then((files: SearchResult[]) =>
        files.map(async (file) => {
          const fileName = file.doc;
          const uri = DocumentContentProvider.getUri(fileName, "", "", true, options.folder);
          try {
            const document = await vscode.workspace.openTextDocument(uri);
            return {
              ...file,
              uri,
              document,
            };
          } catch (_ex) {
            return null;
          }
        })
      )
      .then((files) => Promise.all(files))
      .then((files) => {
        files.forEach((file) => {
          const { uri, document, matches } = file;
          matches.forEach((match: SearchMatch) => {
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
      })
      .catch((error) => {
        outputChannel.appendLine(error);
        return null;
      });
  }
}
