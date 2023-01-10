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
    const csp = params.has("csp") && ["", "1"].includes(params.get("csp"));
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

      if (!params.get("filter")) {
        // Unless isfs spec already includes a non-empty filter (which it rarely does), apply includes and excludes at the server side.
        // Convert **/ separators and /** suffix into multiple *-patterns that simulate these elements of glob syntax.

        // Function to convert glob-style filters into ones that the server understands
        const convertFilters = (filters: string[]): string[] => {
          // Use map to prevent duplicates in final result
          const filterMap = new Map<string, void>();

          // The recursive function we use
          const recurse = (value: string): void => {
            const parts = value.split("**/");
            if (parts.length < 2) {
              // No more recursion
              if (value.endsWith("/**")) {
                filterMap.set(value.slice(0, -1));
                filterMap.set(value.slice(0, -3));
              } else {
                filterMap.set(value);
              }
            } else {
              const first = parts[0];
              const rest = parts.slice(1);
              recurse(first + "*/" + rest.join("**/"));
              recurse(first + rest.join("**/"));
            }
          };

          // Invoke our recursive function
          filters
            .filter((value) => csp || !value.match(/\.([a-z]+|\*)\/\*\*$/)) // drop superfluous entries ending .xyz/** or .*/** when not handling CSP files
            .forEach((value) => {
              recurse(value);
            });

          // Convert map to array and return it
          const results: string[] = [];
          filterMap.forEach((_v, key) => {
            results.push(key);
          });
          return results;
        };

        // Function to get one of the two kinds of exclude settings as an array
        const getConfigExcludes = (key: string) => {
          return Object.entries(vscode.workspace.getConfiguration(key, options.folder).get("exclude"))
            .filter((value) => value[1] === true)
            .map((value) => value[0]);
        };

        // Build an array containing the files.exclude settings followed by the search.exclude ones,
        // then try to remove exactly those from the end of the ones passed to us when "Use Exclude Settings and Ignore Files" is on.
        const configurationExcludes = getConfigExcludes("files").concat(getConfigExcludes("search"));
        const ourExcludes = options.excludes;
        while (configurationExcludes.length > 0) {
          if (configurationExcludes.pop() !== ourExcludes.pop()) {
            break;
          }
        }

        // If we successfully removed them all, the ones that remain were explicitly entered in the "files to exclude" field of Search, so use them.
        // If removal was unsuccessful use the whole set.
        const filterExclude = convertFilters(!configurationExcludes.length ? ourExcludes : options.excludes).join(",'");

        const filterInclude =
          options.includes.length > 0
            ? convertFilters(options.includes).join(",")
            : filterExclude
            ? fileSpecFromURI(uri) // Excludes were specified but no includes, so start with the default includes (this step makes type=cls|rtn effective)
            : "";
        const filter = filterInclude + (!filterExclude ? "" : ",'" + filterExclude);
        if (filter) {
          // Unless isfs is serving CSP files, slash separators in filters must be converted to dot ones before sending to server
          params.append("filter", csp ? filter : filter.replace(/\//g, "."));
          uri = options.folder.with({ query: params.toString() });
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

              // Don't report matches in filetypes we don't want or don't handle
              const fileType = file.doc.split(".").pop().toLowerCase();
              if (!csp) {
                switch (params.get("type")) {
                  case "cls":
                    if (fileType !== "cls") {
                      return;
                    }
                    break;

                  case "rtn":
                    if (!["inc", "int", "mac"].includes(fileType)) {
                      return;
                    }
                    break;

                  default:
                    if (!["cls", "inc", "int", "mac"].includes(fileType)) {
                      return;
                    }
                    break;
                }
              }

              const uri = DocumentContentProvider.getUri(file.doc, "", "", true, options.folder);
              const content = decoder.decode(await vscode.workspace.fs.readFile(uri)).split("\n");
              // Find all lines that we have matches on
              const lines = file.matches
                .map((match: SearchMatch) => {
                  let line = match.line ? Number(match.line) : null;
                  if (match.member !== undefined) {
                    // This is an attribute of a class member
                    if (match.member == "Storage" && match.attr.includes(",") && match.attrline == undefined) {
                      // This is inside a Storage definition
                      const xmlTags = match.attr.split(",");
                      const storageRegex = new RegExp(`^Storage ${xmlTags[0]}`);
                      let inStorage = false;
                      for (let i = 0; i < content.length; i++) {
                        if (!inStorage && content[i].match(storageRegex)) {
                          inStorage = true;
                          xmlTags.shift();
                        }
                        if (inStorage) {
                          if (xmlTags.length > 0 && content[i].includes(xmlTags[0])) {
                            xmlTags.shift();
                          }
                          if (xmlTags.length == 0 && content[i].includes(match.text)) {
                            line = i;
                            break;
                          }
                        }
                      }
                    } else {
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
