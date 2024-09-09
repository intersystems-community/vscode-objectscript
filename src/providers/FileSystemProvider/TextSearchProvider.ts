import * as vscode from "vscode";
import { makeRe } from "minimatch";
import { AsyncSearchRequest, SearchResult, SearchMatch } from "../../api/atelier";
import { AtelierAPI } from "../../api";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { handleError, notNull, outputChannel, throttleRequests } from "../../utils";
import { config } from "../../extension";
import { fileSpecFromURI } from "../../utils/FileProviderUtil";

/**
 * Convert an `attrline` in a description to a line number in document `content`.
 */
function descLineToDocLine(content: string[], attrline: number, line: number): number {
  let result = 0;
  for (let i = line - 1; i >= 0; i--) {
    if (!content[i].startsWith("///")) {
      result = i;
      break;
    } else if (i == 0) {
      result = -1;
    }
  }
  return result + attrline;
}

/**
 * Resolve a `match` in document `content` to a specific line.
 */
function searchMatchToLine(
  content: string[],
  match: SearchMatch,
  fileName: string,
  apiConfigName: string
): number | null {
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
          if (config("multilineMethodArgs", apiConfigName) && content[i].match(/^(?:Class|Client)?Method|Query /)) {
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
            if (match.attr === "Description") {
              // This is in the description
              line = descLineToDocLine(content, match.attrline, i);
            } else if (match.attrline || ["Code", "Data", "SqlQuery"].includes(match.attr)) {
              if (["Code", "Data", "SqlQuery"].includes(match.attr)) {
                // This is in the implementation
                line = memend + (match.attrline ?? 1);
              } else {
                // This is a keyword with a multiline value
                line = i + (match.attrline - 1 || 0);
              }
            } else {
              // This is in the class member definition
              // Need to loop due to the possibility of keywords with multiline values
              for (let j = i; j < content.length; j++) {
                if (content[j].includes(match.attr)) {
                  line = j;
                  break;
                } else if (
                  j > i &&
                  /^((?:Class|Client)?Method|Property|XData|Query|Trigger|Parameter|Relationship|Index|ForeignKey|Storage|Projection|\/\/\/)/.test(
                    content[j]
                  )
                ) {
                  // Hit the beginning of the next member
                  break;
                }
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
      const classMatchPattern = new RegExp(`^Class ${fileName.slice(0, fileName.lastIndexOf("."))}`);
      let keywordSearch = false;
      for (let i = 0; i < content.length; i++) {
        if (content[i].match(classMatchPattern)) {
          if (match.attr == "Description") {
            // This is in the class description
            line = descLineToDocLine(content, match.attrline, i);
            break;
          } else if (match.attr == "Super" || match.attr == "Name") {
            // This is in the class definition line
            if (content[i].includes(match.text)) {
              line = i;
            }
            break;
          } else {
            // This is a class keyword or keyword value
            // Need to keep looping due to the possibility of keywords with multiline values
            keywordSearch = true;
          }
          if (keywordSearch) {
            if (content[i].includes(match.attr)) {
              line = match.attrline ? i + match.attrline - 1 : i;
              break;
            } else if (
              /^((?:Class|Client)?Method|Property|XData|Query|Trigger|Parameter|Relationship|Index|ForeignKey|Storage|Projection|\/\/\/)/.test(
                content[i]
              )
            ) {
              // Hit the beginning of the next member
              break;
            }
          }
        }
      }
    }
  }
  return typeof line === "number" ? (fileName.includes("/") ? line - 1 : line) : null;
}

/**
 * Handle errors produced during the retrieving of search results.
 */
function handleSearchError(error: any): vscode.TextSearchComplete {
  handleError(error);
  return {
    message: {
      text: "An error occurred during the search. Check the `ObjectScript` Output channel for details.",
      type: vscode.TextSearchCompleteMessageType.Warning,
    },
  };
}

/**
 * Wait for all documents to be processed and return the `vscode.TextSearchComplete` notification.
 */
async function processSearchResults(
  fileResultPromise: Promise<PromiseSettledResult<void>[]>,
  results: number,
  maxResults: number,
  token: vscode.CancellationToken
): Promise<vscode.TextSearchComplete> {
  if (token.isCancellationRequested) {
    return;
  }
  const fileResults = await fileResultPromise;
  if (token.isCancellationRequested) {
    return;
  }
  let message: vscode.TextSearchCompleteMessage;
  const rejected = fileResults.filter((r) => r.status == "rejected").length;
  if (rejected > 0) {
    outputChannel.appendLine("Search errors:");
    fileResults
      .filter((r) => r.status == "rejected")
      .forEach((r: PromiseRejectedResult) => {
        outputChannel.appendLine(typeof r.reason == "object" ? r.reason.toString() : String(r.reason));
      });
    message = {
      text: `Failed to display results from ${rejected} file${
        rejected > 1 ? "s" : ""
      }. Check the \`ObjectScript\` Output channel for details.`,
      type: vscode.TextSearchCompleteMessageType.Warning,
    };
  }
  return {
    limitHit: results >= maxResults,
    message,
  };
}

/**
 * Attempt to remove exclude filters that didn't come from the "files to exclude" text box.
 * Returns the exclude filters that should be used.
 */
function removeConfigExcludes(folder: vscode.Uri, excludes: string[]): string[] {
  // Function to get one of the two kinds of exclude settings as an array
  const getConfigExcludes = (key: string) => {
    return Object.entries(vscode.workspace.getConfiguration(key, folder).get("exclude"))
      .filter((value) => value[1] === true)
      .map((value) => value[0]);
  };

  // Build an array containing the files.exclude settings followed by the search.exclude ones,
  // then try to remove exactly those from the ones passed to us when "Use Exclude Settings and Ignore Files" is on.
  const configurationExcludes = getConfigExcludes("files").concat(getConfigExcludes("search"));
  const ourExcludes = excludes;
  // Need to find the start index because the ones
  // from the input box can appear at the start or the end.
  const configStart = ourExcludes.indexOf(configurationExcludes[0]);
  if (configStart != -1) {
    while (configurationExcludes.length > 0) {
      if (configurationExcludes.shift() !== ourExcludes.splice(configStart, 1)[0]) {
        break;
      }
    }
  }

  // If we successfully removed them all, the ones that remain were explicitly entered in the "files to exclude" field of Search, so use them.
  // If removal was unsuccessful use the whole set.
  return !configurationExcludes.length ? ourExcludes : excludes;
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
    const params = new URLSearchParams(options.folder.query);
    const decoder = new TextDecoder();
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

    /** Report matches in `file` to the user */
    const reportMatchesForFile = async (file: SearchResult): Promise<void> => {
      // The last three checks are needed to protect against
      // bad output from the server due to a bug.
      if (
        // The user cancelled the search
        token.isCancellationRequested ||
        // The server reported no matches in this file
        !file.matches.length ||
        // The file name is malformed
        (file.doc.includes("/") && !/^\/(?:[^/]+\/)+[^/.]*(?:\.[^/.]+)+$/.test(file.doc)) ||
        (!file.doc.includes("/") &&
          !/^(%?[\p{L}\d\u{100}-\u{ffff}]+(?:\.[\p{L}\d\u{100}-\u{ffff}]+)+)$/u.test(file.doc))
      ) {
        return;
      }

      const uri = DocumentContentProvider.getUri(file.doc, "", "", true, options.folder);
      const content = decoder.decode(await vscode.workspace.fs.readFile(uri)).split("\n");
      const contentLength = content.length;
      // Find all lines that we have matches on
      const lines = file.matches
        .map((match: SearchMatch) =>
          token.isCancellationRequested ? null : searchMatchToLine(content, match, file.doc, api.configName)
        )
        .filter(notNull);
      // Remove duplicates and make them quickly searchable
      const matchedLines = new Set(lines);
      // Compute all matches for each one
      matchedLines.forEach((line) => {
        if (token.isCancellationRequested) {
          return;
        }
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
          if (options.beforeContext) {
            // Add preceding context lines that aren't themselves result lines
            const previewFrom = Math.max(line - options.beforeContext, 0);
            for (let i = previewFrom; i < line; i++) {
              if (!matchedLines.has(i)) {
                progress.report({
                  uri,
                  text: content[i],
                  lineNumber: i + 1,
                });
              }
            }
          }
          progress.report({
            uri,
            ranges: matchRanges,
            preview: {
              text,
              matches: previewRanges,
            },
          });
          if (options.afterContext) {
            // Add following context lines that aren't themselves result lines
            const previewTo = Math.min(line + options.afterContext, contentLength - 1);
            for (let i = line + 1; i <= previewTo; i++) {
              if (!matchedLines.has(i)) {
                progress.report({
                  uri,
                  text: content[i],
                  lineNumber: i + 1,
                });
              }
            }
          }
        }
      });
    };

    // Generate the query pattern that gets sent to the server
    // Needed because the server matches the full line against the regex and ignores the case parameter when in regex mode
    const pattern = query.isRegExp ? `${!query.isCaseSensitive ? "(?i)" : ""}.*${query.pattern}.*` : query.pattern;

    if (api.config.apiVersion >= 6) {
      // Build the request object
      const project = params.has("project") && params.get("project").length ? params.get("project") : undefined;
      const system =
        (params.has("system") && params.get("system").length ? params.get("system") == "1" : false) ||
        api.ns === "%SYS";
      const generated =
        params.has("generated") && params.get("generated").length ? params.get("generated") == "1" : false;
      const mapped = params.has("mapped") && params.get("mapped").length ? params.get("mapped") == "0" : true;
      const request: AsyncSearchRequest = {
        request: "search",
        console: false, // Passed so the server doesn't send us back console output
        query: pattern,
        regex: query.isRegExp,
        project,
        word: query.isWordMatch, // Ignored if regex is true
        case: query.isCaseSensitive, // Ignored if regex is true
        wild: false, // Ignored if regex is true
        documents: project ? undefined : fileSpecFromURI(options.folder),
        system, // Ignored if project is defined
        generated, // Ignored if project is defined
        mapped, // Ignored if project is defined
        // If options.maxResults is null the search is supposed to return an unlimited number of results
        // Since there's no way for us to pass "unlimited" to the server, I chose a very large number
        max: options.maxResults ?? 100000,
      };

      // Generate the include and exclude filters.
      // The matching is case sensitive and file names are normalized so that the first character
      // and path separator are '/' (for example, '/%Api/Atelier/v6.cls' and '/csp/user/menu.csp').
      let includesArr = options.includes;
      let excludesArr = removeConfigExcludes(options.folder, options.excludes);
      if (!["", "/"].includes(options.folder.path)) {
        // Prepend path with a trailing slash
        const prefix = !options.folder.path.endsWith("/") ? `${options.folder.path}/` : options.folder.path;
        includesArr = includesArr.map((e) => `${prefix}${e}`);
        excludesArr = excludesArr.map((e) => `${prefix}${e}`);
      }

      // Add leading slash if we don't start with **/
      includesArr = includesArr.map((e) => (!e.startsWith("**/") ? `/${e}` : e));
      excludesArr = excludesArr.map((e) => (!e.startsWith("**/") ? `/${e}` : e));

      // Convert the array of glob patterns into a single regular expression
      if (includesArr.length) {
        request.include = includesArr
          .map((e) => {
            const re = makeRe(e);
            if (re == false) return null;
            return re.source;
          })
          .filter(notNull)
          .join("|");
      }
      if (excludesArr.length) {
        request.exclude = excludesArr
          .map((e) => {
            const re = makeRe(e);
            if (re == false) return null;
            return re.source;
          })
          .filter(notNull)
          .join("|");
      }

      // Send the queue request
      return api
        .queueAsync(request)
        .then(async (queueResp) => {
          // Request was successfully queued, so get the ID
          const id: string = queueResp.result.location;
          if (token.isCancellationRequested) {
            // The user cancelled the request, so cancel it on the server
            await api.verifiedCancel(id, false);
            return;
          }

          // Poll until the search completes or is cancelled by the user
          const filePromises: Promise<void>[] = [];
          const getAsyncSearchResult = async (): Promise<any> => {
            const pollResp = await api.pollAsync(id);
            if (token.isCancellationRequested) {
              // The user cancelled the request, so cancel it on the server
              return api.verifiedCancel(id, false);
            }
            // Process matches
            filePromises.push(...pollResp.result.map(throttleRequests(reportMatchesForFile)));
            if (pollResp.retryafter) {
              await new Promise((resolve) => {
                setTimeout(resolve, 50);
              });
              if (token.isCancellationRequested) {
                // The user cancelled the request, so cancel it on the server
                return api.verifiedCancel(id, false);
              }
              return getAsyncSearchResult();
            }
            return pollResp;
          };

          await getAsyncSearchResult();
          return processSearchResults(Promise.allSettled(filePromises), counter, options.maxResults, token);
        })
        .catch(handleSearchError);
    } else {
      let project: string;
      let projectList: string[];
      let searchPromise: Promise<SearchResult[]>;
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
                  query: pattern,
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

          const filterExclude = convertFilters(removeConfigExcludes(options.folder, options.excludes)).join(",'");
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
            query: pattern,
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
          const resultsPromise = Promise.allSettled(
            files.map(
              throttleRequests(async (file: SearchResult): Promise<void> => {
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

                return reportMatchesForFile(file);
              })
            )
          );
          return processSearchResults(resultsPromise, counter, options.maxResults, token);
        })
        .catch(handleSearchError);
    }
  }
}
