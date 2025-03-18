import * as vscode from "vscode";
import { gte } from "semver";
import { clsLangId, intLangId, lsExtensionId, macLangId } from "../extension";
import { currentFile, parseClassMemberDefinition, quoteClassMemberName } from "../utils";
import { AtelierAPI } from "../api";

const includeRegex = /^Include\s+\(?([^(]+)\)?\s*$/i;
const importRegex = /^Import\s+\(?([^(]+)\)?\s*$/i;
const sqlQueryRegex = /\)\s+(?:As|as|AS|aS)\s+%(?:Library\.)?SQLQuery(?:\([^)]*SELECTMODE\s*=\s*"([^"]+)"[^)]*\))?/;
const eSqlStartRegex = /(?:^|(?:[^"]*"[^"]*")*)(?:##sql|&sql([^(+-/\\|*\s)]*))\(/i;
const poundImportRegex = /^\s*#import\s+(.+)$/i;
const poundIncludeRegex = /^\s*#include\s+(\S+)\s*$/i;
const sqlSelectRegex = /^\s*#sqlcompile\s+select\s*=\s*(\S+)\s*$/i;
const commentRegex = /(?:^|(?:[^"]*"[^"]*")*)(\/\/|;|\/\*)/;
const rtnIsDebuggableRegex = /^\(([^)]*)\)(?:(?:(?:\[[^\]]*\])?public{)|(?!private|methodimpl|{|\[]))/i;
const whitespaceAndCCommentsRegex = /\/\*[\s\S]*?\*\/|\s+/g;

/**
 * Extract the text of the Embedded SQL query starting at `[startLine,StartChar]`.
 * `end` is the string that terminates the embedding. Returns the empty string if the
 * query couldn't be extratced, or if it's not a query that supports execution plans.
 */
function getSqlQuery(document: vscode.TextDocument, startLine: number, startChar: number, end: string): string {
  const isMarker = end.length > 1,
    isBrace = end == "}",
    isParen = end == ")";
  let result = "",
    brk = false,
    inSingleQ = false,
    inDoubleQ = false,
    inComment = false,
    braceCount = 1;
  for (let l = startLine; l < document.lineCount; l++) {
    inSingleQ = inDoubleQ = false; // Neither of these can span multiple lines
    const lineText = document.lineAt(l).text;
    if (isMarker) {
      if (lineText.includes(end)) {
        result = document.getText(new vscode.Range(startLine, startChar, l, lineText.indexOf(end)));
        break;
      } else {
        // Only the reverse marker can terminate the query
        continue;
      }
    }
    for (let c = l == startLine ? startChar : 0; c < lineText.length; c++) {
      if (inComment && lineText[c] == "*" && c < lineText.length - 1 && lineText[c + 1] == "/") {
        // This is the end of a C-style comment
        inComment = false;
        continue;
      }
      if (!inSingleQ && lineText[c] == '"') {
        inDoubleQ = !inDoubleQ;
      } else if (!inDoubleQ && lineText[c] == "'") {
        inSingleQ = !inSingleQ;
      } else if (!inSingleQ && !inComment && !inDoubleQ) {
        if (lineText[c] == "-" && c < lineText.length - 1 && lineText[c + 1] == "-") {
          // This is a single-line -- comment, so move on to the next line
          break;
        }
        if (lineText[c] == "/" && c < lineText.length - 1 && lineText[c + 1] == "*") {
          // This is the start of a C-style comment
          inComment = true;
          continue;
        }
        if ((isParen && lineText[c] == "(") || (isBrace && lineText[c] == "{")) {
          braceCount++;
        } else if ((isParen && lineText[c] == ")") || (isBrace && lineText[c] == "}")) {
          braceCount--;
        }
      }

      if (braceCount == 0) {
        // We've passed the end of the query
        result = document.getText(new vscode.Range(startLine, startChar, l, c));
        brk = true;
        break;
      }
    }
    if (brk) break;
  }
  if (
    result.length &&
    !["SELECT", "DECLARE", "UPDATE", "DELETE", "TRUNCATE", "INSERT"].includes(
      result.trimStart().split(/\s+/).shift().toUpperCase()
    )
  ) {
    // Can only generate plans for certain SQL statements
    result = "";
  }
  return result;
}

/**
 * Scan the block of ObjectScript code in `document` starting at line `start` (inclusive) and ending
 * at line `end` (exclusive) looking for Embedded SQL queries that we can show the execution plan for.
 */
function scanCodeBlock(
  document: vscode.TextDocument,
  start: number,
  end: number,
  className?: string,
  classIncludes?: string[],
  classImports?: string[]
): vscode.CodeLens[] {
  const result: vscode.CodeLens[] = [];
  const includes: string[] = classIncludes ? [...classIncludes] : [];
  const imports: string[] = classImports ? [...classImports] : [];
  let selectMode: string = "LOGICAL";
  let inCStyleComment = false;
  for (let i = start; i < end; i++) {
    const line = document.lineAt(i).text;
    let commentStart: number;
    let commentEnd: number;
    if (!inCStyleComment) {
      const commentMatch = line.match(commentRegex);
      if (commentMatch) {
        commentStart = commentMatch[0].length - commentMatch[1].length;
        if (commentMatch[1] == "/*") inCStyleComment = true;
      }
    }
    if (inCStyleComment) {
      // The multi-line comment ends on this line
      const endMatch = line.indexOf("*/");
      if (endMatch != -1) {
        commentStart = 0;
        commentEnd = endMatch + 2;
        inCStyleComment = false;
      } else {
        commentStart = 0;
      }
    }
    if (commentStart == 0 && commentEnd == undefined) {
      // The whole line is a comment
      continue;
    }
    const eSqlMatch = line.match(eSqlStartRegex);
    if (eSqlMatch) {
      // Check if the match is commented out
      if (
        (commentStart == undefined && commentEnd == undefined) ||
        (commentStart != undefined && eSqlMatch.index < commentStart) ||
        (commentEnd != undefined && eSqlMatch.index > commentEnd)
      ) {
        const sqlQuery = getSqlQuery(
          document,
          i,
          eSqlMatch.index + eSqlMatch[0].length,
          `)${(eSqlMatch[1] ?? "").split("").reverse().join("")}`
        );
        if (sqlQuery) {
          result.push(
            new vscode.CodeLens(new vscode.Range(i, eSqlMatch.index, i, eSqlMatch.index + eSqlMatch[0].length), {
              title: "Show Plan",
              tooltip: "Show the plan for this query",
              command: "vscode-objectscript.showPlanWebview",
              arguments: [{ uri: document.uri, sqlQuery, selectMode, includes, imports, className }],
            })
          );
          // Skip ahead to the end of the SQL text
          i += sqlQuery.split(/\r?\n/).length - 1;
        }
      }
      continue;
    }
    const includeMatch = line.match(poundIncludeRegex);
    if (includeMatch) {
      includes.push(includeMatch[1]);
      continue;
    }
    const importMatch = line.match(poundImportRegex);
    if (importMatch) {
      imports.push(...importMatch[1].replace(/\s+/g, "").split(","));
      continue;
    }
    const sqlSelectMatch = line.match(sqlSelectRegex);
    if (sqlSelectMatch) {
      selectMode = sqlSelectMatch[1].toUpperCase();
      continue;
    }
  }
  return result;
}

export class ObjectScriptCodeLensProvider implements vscode.CodeLensProvider {
  public async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (![clsLangId, macLangId, intLangId].includes(document.languageId)) return;
    const file = currentFile(document);
    if (!file) return; // Document is malformed
    const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
    if (!symbols?.length || token.isCancellationRequested) return;
    const api = new AtelierAPI(document.uri);
    const conf = vscode.workspace.getConfiguration("objectscript.debug");
    const debugThisMethod: boolean = conf.get("debugThisMethod") && api.active;
    const copyToClipboard: boolean = conf.get("copyToClipboard");
    const showPlan = api.active && gte(api.config.serverVersion, "2024.1.0");
    const result: vscode.CodeLens[] = [];
    if (document.languageId == clsLangId) {
      if (!symbols[0].children.length) return;
      const className = file.name.slice(0, -4);
      const superRegex = new RegExp(
        `^\\s*Class\\s+${className.replace(/\./g, "\\.")}\\s+Extends\\s+(?:(?:\\(([^)]+)\\))|(?:([^\\s]+)))`,
        "i"
      );
      const languageServer: boolean = vscode.extensions.getExtension(lsExtensionId)?.isActive ?? false;
      let superclasses: string[] = [];
      const includes: string[] = ["%systemInclude"];
      const imports: string[] = [className.slice(0, className.lastIndexOf("."))];

      // Capture any superclasses
      const superMatch = document.lineAt(symbols[0].selectionRange.start.line).text.match(superRegex);
      if (superMatch) {
        const [, superclassesList, superclass] = superMatch;
        if (superclass) {
          superclasses = [superclass];
        } else {
          superclasses = superclassesList.replace(/\s+/g, "").split(",");
        }
      }

      // Capture any Imports and Includes, if necessary
      if (showPlan) {
        for (let i = 0; i < symbols[0].selectionRange.start.line; i++) {
          const line = document.lineAt(i).text;
          const includeMatch = line.match(includeRegex);
          if (includeMatch) {
            includes.push(...includeMatch[1].replace(/\s+/g, "").split(","));
            continue;
          }
          const importMatch = line.match(importRegex);
          if (importMatch) {
            imports.push(...importMatch[1].replace(/\s+/g, "").split(","));
          }
        }
      }

      // Loop through the class member symbols
      symbols[0].children.forEach((symbol, idx) => {
        const type = symbol.detail.toLowerCase();
        if (!["xdata", "method", "classmethod", "query", "trigger"].includes(type)) return;
        let symbolLine: number;
        if (languageServer) {
          symbolLine = symbol.selectionRange.start.line;
        } else {
          // This extension's symbol provider doesn't have a range
          // that always maps to the first line of the member definition
          for (let l = symbol.range.start.line; l < document.lineCount; l++) {
            symbolLine = l;
            if (!document.lineAt(l).text.startsWith("///")) break;
          }
        }
        switch (type) {
          case "xdata": {
            if (api.active) {
              let cmd: vscode.Command;
              if (symbol.name == "BPL" && superclasses.includes("Ens.BusinessProcessBPL")) {
                cmd = {
                  title: "Open Low-Code Editor in Browser",
                  command: "vscode-objectscript.openPathInBrowser",
                  tooltip: "Open low-code editor in an external browser",
                  arguments: [`/EnsPortal.BPLEditor.zen?BP=${className}.BPL`, document.uri],
                };
              } else if (
                (symbol.name == "RuleDefinition" &&
                  superclasses.includes("Ens.Rule.Definition") &&
                  gte(api.config.serverVersion, "2023.1.0")) ||
                (symbol.name == "DTL" &&
                  superclasses.includes("Ens.DataTransformDTL") &&
                  gte(api.config.serverVersion, "2025.1.0"))
              ) {
                cmd = {
                  title: "Reopen in Low-Code Editor",
                  command: "vscode-objectscript.reopenInLowCodeEditor",
                  arguments: [document.uri],
                  tooltip: "Replace text editor with low-code editor",
                };
              } else if (symbol.name == "KPI" && superclasses.includes("%DeepSee.KPI")) {
                cmd = {
                  title: "Test KPI in Browser",
                  command: "vscode-objectscript.openPathInBrowser",
                  tooltip: "Open testing page in an external browser",
                  arguments: [`/${className}.cls`, document.uri],
                };
              }
              if (cmd) result.push(new vscode.CodeLens(this.range(symbolLine), cmd));
            }
            break;
          }
          case "method":
          case "classmethod":
          case "trigger":
          case "query": {
            // Capture the entire text of the class member definition up to the implementation
            const memberInfo = parseClassMemberDefinition(document, symbol, symbolLine);
            if (!memberInfo) break;
            const { definition, defEndLine, language, isPrivate } = memberInfo;
            if (showPlan) {
              if (type == "query") {
                // Check if this is a %SQLQuery
                const sqlQueryMatch = definition.match(sqlQueryRegex);
                if (sqlQueryMatch) {
                  // This is a %SQLQuery
                  const selectMode = sqlQueryMatch[1]?.toUpperCase() ?? "RUNTIME";
                  const sqlQuery = getSqlQuery(document, defEndLine + 1, 0, "}");
                  if (sqlQuery) {
                    result.push(
                      new vscode.CodeLens(this.range(symbolLine), {
                        title: "Show Plan",
                        tooltip: "Show the plan for this query",
                        command: "vscode-objectscript.showPlanWebview",
                        arguments: [{ uri: document.uri, sqlQuery, selectMode, includes, imports, className }],
                      })
                    );
                  }
                }
              } else if (["cache", "objectscript"].includes(language)) {
                // Check for Embedded SQL queries
                result.push(
                  ...scanCodeBlock(
                    document,
                    defEndLine,
                    idx == symbols[0].children.length - 1
                      ? document.lineCount
                      : symbols[0].children[idx + 1].range.start.line,
                    className,
                    includes,
                    imports
                  )
                );
              }
            }

            const displayName = quoteClassMemberName(symbol.name);
            if (
              !isPrivate &&
              debugThisMethod &&
              ["cache", "objectscript"].includes(language) &&
              type == "classmethod"
            ) {
              const argsMatch = definition.match(new RegExp(`${displayName}\\(([^)]*)\\)`));
              result.push(
                this.addDebugThisMethod(symbolLine, [
                  `##class(${className}).${displayName}`,
                  argsMatch && typeof argsMatch[1] == "string" && argsMatch[1].trim().length > 0,
                ])
              );
            }
            if (
              !isPrivate &&
              copyToClipboard &&
              (type == "classmethod" || (type == "query" && displayName[0] != '"'))
            ) {
              result.push(this.addCopyToClipboard(symbolLine, [`##class(${className}).${displayName}()`]));
            }
          }
        }
      });
    } else {
      // Look for labels and public procedures
      const routineName = file.name.split(".").slice(0, -1).join(".");
      let labeledLine1 = false;
      if (symbols && (debugThisMethod || copyToClipboard)) {
        symbols.forEach((symbol) => {
          const line = symbol.selectionRange.start.line;
          const restOfSymbol = document.getText(symbol.range).slice(symbol.name.length);
          let hasArgs = false,
            hasArgList = false;
          if (restOfSymbol[0] == "(") {
            const rtnDebuggableMatch = restOfSymbol
            // Replace all whitespace and C-Style comments
              .replace(whitespaceAndCCommentsRegex, "")
              .match(rtnIsDebuggableRegex);
            // Extract the argument list
            if (rtnDebuggableMatch) {
              hasArgList = true;
              hasArgs = rtnDebuggableMatch[1].length > 0;
            } else {
              // This is not a syntactically valid public procedure or subroutine
              return;
            }
          }
          if (line == 1) labeledLine1 = true;
          if (debugThisMethod) result.push(this.addDebugThisMethod(line, [`${symbol.name}^${routineName}`, hasArgs]));
          if (copyToClipboard) {
            result.push(this.addCopyToClipboard(line, [`${symbol.name}^${routineName}${hasArgList ? "()" : ""}`]));
          }
        });
      }

      // Add CodeLenses at the top only if the first code line had no label
      if (!labeledLine1) {
        if (debugThisMethod) result.push(this.addDebugThisMethod(0, [`^${routineName}`, false]));
        if (copyToClipboard) result.push(this.addCopyToClipboard(0, [`^${routineName}`]));
      }
      if (document.languageId == macLangId && showPlan) {
        // Check for Embedded SQL queries
        result.push(...scanCodeBlock(document, 0, document.lineCount));
      }
    }
    return result;
  }

  private addDebugThisMethod(line: number, args: any[]) {
    return new vscode.CodeLens(this.range(line), {
      title: "Debug",
      command: "vscode-objectscript.debug",
      arguments: args,
    });
  }

  private addCopyToClipboard(line: number, args: any[]) {
    return new vscode.CodeLens(this.range(line), {
      title: "Copy Invocation",
      command: "vscode-objectscript.copyToClipboard",
      arguments: args,
    });
  }

  private range(line: number): vscode.Range {
    return new vscode.Range(line, 0, line, 80);
  }
}
