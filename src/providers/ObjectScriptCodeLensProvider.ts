import * as vscode from "vscode";
import { config } from "../extension";
import { currentFile } from "../utils";

export class ObjectScriptCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    if (document.languageId == "objectscript-class") {
      return this.classMethods(document);
    }
    if (["objectscript", "objectscript-int"].includes(document.languageId)) {
      return this.routineLabels(document);
    }
    return [];
  }

  private classMethods(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = currentFile(document);
    const result = new Array<vscode.CodeLens>();

    const className = file.name.split(".").slice(0, -1).join(".");

    const { debugThisMethod, copyToClipboard } = config("debug");
    if (!debugThisMethod && !copyToClipboard) {
      // Return early if both types are turned off
      return result;
    }

    const pattern = /(?:^ClassMethod\s)([^(]+)\((.*)/i;
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

      const methodMatch = text.match(pattern);
      if (methodMatch) {
        const [, name, paramsRaw] = methodMatch;
        let params = paramsRaw;
        params = params.replace(/"[^"]*"/g, '""');
        params = params.replace(/{[^{}]*}|{[^{}]*{[^{}]*}[^{}]*}/g, '""');
        params = params.replace(/\([^()]*\)/g, "");
        params = params.split(")")[0];
        const paramsCount = params.length ? params.split(",").length : 0;

        debugThisMethod && result.push(this.addDebugThisMethod(i, [`##class(${className}).${name}`, paramsCount > 0]));
        copyToClipboard &&
          result.push(this.addCopyToClipboard(i, [`##class(${className}).${name}(${Array(paramsCount).join(",")})`]));
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

    debugThisMethod && result.push(this.addDebugThisMethod(0, [`^${routineName}`, false]));
    copyToClipboard && result.push(this.addCopyToClipboard(0, [`^${routineName}`]));

    const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
    symbols
      .filter((symbol) => symbol.kind === vscode.SymbolKind.Method)
      .forEach((symbol) => {
        const line = symbol.selectionRange.start.line;
        const labelMatch = document.lineAt(line).text.match(/^(\w[^(\n\s]+)(?:\(([^)]*)\))?/i);
        if (labelMatch) {
          const [, name, parens] = labelMatch;

          debugThisMethod && result.push(this.addDebugThisMethod(line, [`${name}^${routineName}`, parens !== "()"]));
          copyToClipboard && result.push(this.addCopyToClipboard(line, [`${name}^${routineName}`]));
        }
      });

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
