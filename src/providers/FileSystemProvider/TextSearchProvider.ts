import * as vscode from "vscode";
import * as url from "url";
import { SearchResult, SearchMatch } from "../../api/atelier";
import { AtelierAPI } from "../../api";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { notNull, outputChannel, throttleRequests } from "../../utils";
import { config } from "../../extension";
import { fileSpecFromURI } from "../../utils/FileProviderUtil";

/**
 * Convert an `attrline` in a description to a line number in `document`.
 */
function descLineToDocLine(content: string[], attrline: number, line: number): number {
  let result = 0;
  for (let i = line - 1; i >= 0; i--) {
    if (!content[i].startsWith("///")) {
      result = i;
      break;
    }
  }
  return result + attrline;
}

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
      return {
        message: {
          text: "An active server connection is required for searching `isfs` folders.",
          type: vscode.TextSearchCompleteMessageType.Warning,
        },
      };
    }
    if (token.isCancellationRequested) {
      return;
    }
    const queryParams = url.parse(options.folder.toString(true), true).query;
    const sysStr = queryParams.system && queryParams.system.length ? queryParams.system.toString() : "0";
    const genStr = queryParams.generated && queryParams.generated.length ? queryParams.generated.toString() : "0";
    return api
      .actionSearch({
        query: query.pattern,
        regex: query.isRegExp,
        word: query.isWordMatch,
        case: query.isCaseSensitive,
        files: fileSpecFromURI(options.folder),
        sys: sysStr === "1" || (sysStr === "0" && api.ns === "%SYS"),
        gen: genStr === "1",
        // If options.maxResults is null the search is supposed to return an unlimited number of results
        // Since there's no way for us to pass "unlimited" to the server, I chose a very large number
        max: options.maxResults ?? 100000,
      })
      .then((data) => data.result)
      .then(async (files: SearchResult[]) => {
        if (token.isCancellationRequested) {
          return;
        }
        const decoder = new TextDecoder();
        const result = await Promise.allSettled(
          files.map(
            throttleRequests(async (file: SearchResult) => {
              if (token.isCancellationRequested) {
                throw new vscode.CancellationError();
              }
              const uri = DocumentContentProvider.getUri(file.doc, "", "", true, options.folder);
              const content = decoder.decode(await vscode.workspace.fs.readFile(uri)).split("\n");
              // Find all lines that we have matches on
              const lines = file.matches
                .map((match: SearchMatch) => {
                  let line = Number(match.line);
                  if (match.member !== undefined) {
                    // This is an attribute of a class member
                    const memberMatchPattern = new RegExp(
                      `^((?:Class|Client)?Method|Property|XData|Query|Trigger|Parameter|Relationship|Index|ForeignKey|Storage|Projection) ${match.member}`
                    );
                    for (let i = 0; i < content.length; i++) {
                      if (content[i].match(memberMatchPattern)) {
                        let memend = i + 1;
                        if (
                          config("multilineMethodArgs", api.configName) &&
                          content[i].match(/^(?:Class|Client)?Method|Query /)
                        ) {
                          // The class member definition is on multiple lines so update the end
                          for (let j = i + 1; j < content.length; j++) {
                            if (content[j].trim() === "{") {
                              memend = j;
                              break;
                            }
                          }
                        }
                        if (match.attr === undefined) {
                          if (match.line === undefined) {
                            // This is in the class member definition
                            line = i;
                          } else {
                            // This is in the implementation
                            line = memend + Number(match.line);
                          }
                        } else {
                          if (match.attrline === undefined) {
                            // This is in the class member definition
                            line = 1;
                          } else {
                            if (match.attr === "Description") {
                              // This is in the description
                              line = descLineToDocLine(content, match.attrline, i);
                            } else {
                              // This is in the implementation
                              line = memend + match.attrline;
                            }
                          }
                        }
                        break;
                      }
                    }
                  } else if (match.attr !== undefined) {
                    if (match.attr === "IncludeCode") {
                      // This is in the Include line
                      for (let i = 0; i < content.length; i++) {
                        if (content[i].match(/^Include /)) {
                          line = i;
                          break;
                        }
                      }
                    } else if (match.attr === "IncludeGenerator") {
                      // This is in the IncludeGenerator line
                      for (let i = 0; i < content.length; i++) {
                        if (content[i].match(/^IncludeGenerator/)) {
                          line = i;
                          break;
                        }
                      }
                    } else if (match.attr === "Import") {
                      // This is in the Import line
                      for (let i = 0; i < content.length; i++) {
                        if (content[i].match(/^Import/)) {
                          line = i;
                          break;
                        }
                      }
                    } else {
                      // This is in the class definition
                      const classMatchPattern = new RegExp(`^Class ${file.doc.slice(0, file.doc.lastIndexOf("."))}`);
                      for (let i = 0; i < content.length; i++) {
                        if (content[i].match(classMatchPattern)) {
                          if (match.attrline) {
                            // This is in the class description
                            line = descLineToDocLine(content, match.attrline, i);
                          } else {
                            line = i;
                          }
                          break;
                        }
                      }
                    }
                  }
                  return typeof line === "number" ? (file.doc.includes("/") ? line - 1 : line) : null;
                })
                .filter(notNull);
              // Filter out duplicates and compute all matches for each one
              [...new Set(lines)].forEach((line) => {
                const text = content[line];
                const regex = new RegExp(
                  query.isRegExp ? query.pattern : query.pattern.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
                  query.isCaseSensitive ? "g" : "gi"
                );
                let regexMatch: RegExpExecArray;
                const matchRanges: vscode.Range[] = [];
                const previewRanges: vscode.Range[] = [];
                while ((regexMatch = regex.exec(text)) !== null && counter < options.maxResults) {
                  const start = regexMatch.index;
                  const end = start + regexMatch[0].length;
                  matchRanges.push(new vscode.Range(line, start, line, end));
                  previewRanges.push(new vscode.Range(0, start, 0, end));
                  counter++;
                }
                if (matchRanges.length && previewRanges.length) {
                  progress.report({
                    uri,
                    ranges: matchRanges,
                    preview: {
                      text,
                      matches: previewRanges,
                    },
                  });
                }
              });
            })
          )
        );
        if (token.isCancellationRequested) {
          return;
        }
        let message: vscode.TextSearchCompleteMessage;
        const rejected = result.filter((r) => r.status == "rejected").length;
        if (rejected > 0) {
          outputChannel.appendLine("Search errors:");
          result
            .filter((r) => r.status == "rejected")
            .forEach((r: PromiseRejectedResult) => {
              outputChannel.appendLine(typeof r.reason == "object" ? r.reason.toString() : String(r.reason));
            });
          message = {
            text: `Failed to display results from ${rejected} file${
              rejected > 1 ? "s" : ""
            }. Check \`ObjectScript\` Output channel for details.`,
            type: vscode.TextSearchCompleteMessageType.Warning,
          };
        }
        return {
          limitHit: counter >= options.maxResults,
          message,
        };
      })
      .catch((error) => {
        outputChannel.appendLine(typeof error == "object" ? error.toString() : String(error));
        return {
          message: {
            text: "An error occurred during the search. Check `ObjectScript` Output channel for details.",
            type: vscode.TextSearchCompleteMessageType.Warning,
          },
        };
      });
  }
}
