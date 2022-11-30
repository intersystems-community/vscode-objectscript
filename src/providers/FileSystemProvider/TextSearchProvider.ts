import * as vscode from "vscode";
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
  public async provideTextSearchResults(
    query: vscode.TextSearchQuery,
    options: vscode.TextSearchOptions,
    progress: vscode.Progress<vscode.TextSearchResult>,
    token: vscode.CancellationToken
  ): Promise<vscode.TextSearchComplete> {
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

    let project: string;
    let projectList: string[];
    let searchPromise: Promise<SearchResult[]>;
    const params = new URLSearchParams(options.folder.query);
    if (params.has("project") && params.get("project").length) {
      project = params.get("project");
      projectList = await api
        .actionQuery(
          "SELECT CASE WHEN Type = 'PKG' THEN Name||'.*.cls' WHEN Type = 'CLS' THEN Name||'.cls' ELSE Name END Name " +
            "FROM %Studio.Project_ProjectItemsList(?,1) WHERE Type != 'GBL' AND Type != 'DIR' " +
            "UNION SELECT SUBSTR(sod.Name,2) AS Name FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,0) AS sod " +
            "JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON pil.Type = 'DIR' AND sod.Name %STARTSWITH '/'||pil.Name||'/'",
          [project, project]
        )
        .then((data) => data.result.content.map((e) => e.Name));
      // Need to take the CSP directory off of web app files, then remove duplicates
      const prjContents = [...new Set(projectList.map((e) => e.split("/").pop()))];
      // Break up the document list into chunks so the URL doesn't get too long
      const requestGroups: string[][] = [];
      let groupLen = 0;
      let group: string[] = [];
      for (const doc of prjContents) {
        group.push(doc);
        groupLen += doc.length;
        if (groupLen >= 1300) {
          // Be conservative because we really don't want ugly 414 errors
          requestGroups.push(group);
          group = [];
          groupLen = 0;
        }
      }
      if (group.length) {
        requestGroups.push(group);
      }
      searchPromise = Promise.allSettled(
        requestGroups.map(
          throttleRequests((group: string[]) =>
            api
              .actionSearch({
                query: query.pattern,
                regex: query.isRegExp,
                word: query.isWordMatch,
                case: query.isCaseSensitive,
                files: group.join(","),
                sys: true,
                // If options.maxResults is null the search is supposed to return an unlimited number of results
                // Since there's no way for us to pass "unlimited" to the server, I chose a very large number
                max: options.maxResults ?? 100000,
              })
              .then((data) => data.result)
          )
        )
      ).then((results) => results.map((result) => (result.status == "fulfilled" ? result.value : [])).flat());
    } else {
      const sysStr = params.has("system") && params.get("system").length ? params.get("system") : "0";
      const genStr = params.has("generated") && params.get("generated").length ? params.get("generated") : "0";

      let uri = options.folder;

      if (!new URLSearchParams(uri.query).has("filter")) {
        // Unless isfs spec already includes a filter (which it rarely does), apply includes and excludes at the server side.
        // If include or exclude field is set to, say, A1B2M*.int there will be two consecutive options.[in|ex]cludes elements:
        //   **/A1B2M*.int/**
        //   **/A1B2M*.int
        //
        // Ignore first, and strip **/ prefix from second.
        // When 'Use Exclude Settings and Ignore Files' is enabled (which is typical) options.excludes will also contain entries from files.exclude and search.exclude settings.
        // This will result in additional server-side filtering which is probably superfluous but harmless (other than perhaps incurring a performance cost, probably small).
        const tidyFilters = (filters: string[]): string[] => {
          return filters
            .map((value, index, array) =>
              value.endsWith("/**") && index < array.length - 1 && array[index + 1] + "/**" === value
                ? ""
                : value.startsWith("**/")
                ? value.slice(3)
                : value
            )
            .filter((value) => value !== "");
        };
        const tidiedIncludes = tidyFilters(options.includes);
        const tidiedExcludes = tidyFilters(options.excludes);
        const filter = tidiedIncludes.join(",") + (tidiedExcludes.length === 0 ? "" : ",'" + tidiedExcludes.join(",'"));
        if (filter) {
          uri = options.folder.with({ query: `filter=${filter}` });
        }
      }
      searchPromise = api
        .actionSearch({
          query: query.pattern,
          regex: query.isRegExp,
          word: query.isWordMatch,
          case: query.isCaseSensitive,
          files: fileSpecFromURI(uri),
          sys: sysStr === "1" || (sysStr === "0" && api.ns === "%SYS"),
          gen: genStr === "1",
          // If options.maxResults is null the search is supposed to return an unlimited number of results
          // Since there's no way for us to pass "unlimited" to the server, I chose a very large number
          max: options.maxResults ?? 100000,
        })
        .then((data) => data.result);
    }

    return searchPromise
      .then(async (files: SearchResult[]) => {
        if (token.isCancellationRequested) {
          return;
        }
        const decoder = new TextDecoder();
        const result = await Promise.allSettled(
          files.map(
            throttleRequests(async (file: SearchResult) => {
              if (token.isCancellationRequested) {
                return;
              }
              if (project != undefined && file.doc.includes("/")) {
                // Check if this web app file is in the project
                if (!projectList.includes(file.doc.slice(1))) {
                  // This web app file isn't in the project, so ignore its matches
                  return;
                }
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
        let message = "An error occurred during the search.";
        if (error.errorText && error.errorText !== "") {
          outputChannel.appendLine("\n" + error.errorText);
          message += " Check `ObjectScript` Output channel for details.";
        } else {
          try {
            outputChannel.appendLine(typeof error == "object" ? JSON.stringify(error) : String(error));
            message += " Check `ObjectScript` Output channel for details.";
          } catch {
            // Ignore a JSON stringify failure
          }
        }
        return {
          message: {
            text: message,
            type: vscode.TextSearchCompleteMessageType.Warning,
          },
        };
      });
  }
}
