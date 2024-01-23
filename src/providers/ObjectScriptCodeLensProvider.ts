import * as vscode from "vscode";
import { config } from "../extension";
import { currentFile } from "../utils";
import { AtelierAPI } from "../api";

export class ObjectScriptCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    if (document.languageId == "objectscript-class") {
      return this.classMembers(document);
    }
    if (["objectscript", "objectscript-int"].includes(document.languageId)) {
      return this.routineLabels(document);
    }
    return [];
  }

  private classMembers(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = currentFile(document);
    const result = new Array<vscode.CodeLens>();
    const className = file.name.slice(0, -4);
    const { debugThisMethod, copyToClipboard } = config("debug");
    const methodPattern = /(?:^(ClassMethod|Query)\s)([^(]+)\((.*)/i;
    const xdataPattern = /^XData\s([^[{\s]+)/i;
    const superPattern = new RegExp(
      `^\\s*Class\\s+${className.replace(/\./g, "\\.")}\\s+Extends\\s+(?:(?:\\(([^)]+)\\))|(?:([^\\s]+)))`,
      "i"
    );
    const api = new AtelierAPI(document.uri);

    let superclasses: string[] = [];
    let inComment = false;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = this.stripLineComments(line.text);

      if (text.match(/\/\*/)) {
        inComment = true;
      }

      if (inComment) {
        if (text.match(/\*\//)) {
          inComment = false;
        }
        continue;
      }

      const methodMatch = text.match(methodPattern);
      const xdataMatch = text.match(xdataPattern);
      const superMatch = text.match(superPattern);
      if (superMatch) {
        const [, superclassesList, superclass] = superMatch;
        if (superclass) {
          superclasses = [superclass];
        } else {
          superclasses = superclassesList.replace(/\s+/g, "").split(",");
        }
      } else if (xdataMatch && api.active) {
        let [, xdataName] = xdataMatch;
        xdataName = xdataName.trim();
        let cmd: vscode.Command = undefined;
        if (
          (xdataName == "BPL" && superclasses.includes("Ens.BusinessProcessBPL")) ||
          (xdataName == "DTL" && superclasses.includes("Ens.DataTransformDTL"))
        ) {
          cmd = {
            title: "Open Graphical Editor",
            command: "vscode-objectscript.openPathInBrowser",
            tooltip: "Open graphical editor in an external browser",
            arguments: [
              `/csp/${api.config.ns.toLowerCase()}/EnsPortal.${
                xdataName == "BPL" ? `BPLEditor.zen?BP=${className}.BPL` : `DTLEditor.zen?DT=${className}.DTL`
              }`,
              document.uri,
            ],
          };
        } else if (xdataName == "RuleDefinition" && superclasses.includes("Ens.Rule.Definition")) {
          cmd = {
            title: "Reopen in Graphical Editor",
            command: "workbench.action.toggleEditorType",
            tooltip: "Replace text editor with graphical editor",
          };
        } else if (xdataName == "KPI" && superclasses.includes("%DeepSee.KPI")) {
          cmd = {
            title: "Test KPI",
            command: "vscode-objectscript.openPathInBrowser",
            tooltip: "Open testing page in an external browser",
            arguments: [`/csp/${api.config.ns.toLowerCase()}/${className}.cls`, document.uri],
          };
        }
        if (cmd) result.push(new vscode.CodeLens(new vscode.Range(i, 0, i, 80), cmd));
      } else if (methodMatch && (debugThisMethod || copyToClipboard)) {
        const [, kind, name, paramsRaw] = methodMatch;
        let params = paramsRaw;
        params = params.replace(/"[^"]*"/g, '""');
        params = params.replace(/{[^{}]*}|{[^{}]*{[^{}]*}[^{}]*}/g, '""');
        params = params.replace(/\([^()]*\)/g, "");
        const args = params.split(")")[0];
        const paramsCount = args.length ? args.split(",").length : params.includes(")") ? 0 : 1; // Need a positive paramsCount when objectscript.multilineMethodArgs is true

        const methodName = name + (kind == "Query" ? "Func" : "");

        debugThisMethod &&
          kind == "ClassMethod" &&
          result.push(this.addDebugThisMethod(i, [`##class(${className}).${methodName}`, paramsCount > 0]));
        copyToClipboard &&
          result.push(
            this.addCopyToClipboard(i, [`##class(${className}).${methodName}(${Array(paramsCount).join(",")})`])
          );
      }
    }
    return result;
  }

  private async routineLabels(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const file = currentFile(document);
    const result = new Array<vscode.CodeLens>();

    const routineName = file.name.split(".").slice(0, -1).join(".");

    const { debugThisMethod, copyToClipboard } = config("debug");
    if (!debugThisMethod && !copyToClipboard) {
      // Return early if both types are turned off
      return result;
    }

    const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );

    let labelledLine1 = false;
    if (symbols) {
      symbols
        .filter((symbol) => symbol.kind === vscode.SymbolKind.Method)
        .forEach((symbol) => {
          const line = symbol.selectionRange.start.line;
          const labelMatch = document.lineAt(line).text.match(/^(\w[^(\n\s]+)(?:\(([^)]*)\))?/i);
          if (labelMatch) {
            if (line === 1) {
              labelledLine1 = true;
            }
            const [, name, parens] = labelMatch;
            debugThisMethod &&
              result.push(this.addDebugThisMethod(line, [`${name}^${routineName}`, parens && parens !== "()"]));
            copyToClipboard && result.push(this.addCopyToClipboard(line, [`${name}^${routineName}`]));
          }
        });
    }

    // Add lenses at the top only if the first code line had no label
    if (!labelledLine1) {
      debugThisMethod && result.push(this.addDebugThisMethod(0, [`^${routineName}`, false]));
      copyToClipboard && result.push(this.addCopyToClipboard(0, [`^${routineName}`]));
    }
    return result;
  }

  private addDebugThisMethod(line: number, args: any[]) {
    return new vscode.CodeLens(new vscode.Range(line, 0, line, 80), {
      title: `Debug`,
      command: "vscode-objectscript.debug",
      arguments: args,
    });
  }

  private addCopyToClipboard(line: number, args: any[]) {
    return new vscode.CodeLens(new vscode.Range(line, 0, line, 80), {
      title: `Copy Invocation`,
      command: "vscode-objectscript.copyToClipboard",
      arguments: args,
    });
  }

  private stripLineComments(text: string) {
    text = text.replace(/\/\/.*$/, "");
    text = text.replace(/#+;.*$/, "");
    text = text.replace(/;.*$/, "");
    return text;
  }
}
