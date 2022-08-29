import * as vscode from "vscode";
import { config } from "../extension";
import { currentFile } from "../utils";

export class ObjectScriptCodeLensProvider implements vscode.CodeLensProvider {
  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeLens[]> {
    const result = new Array<vscode.CodeLens>();

    if (document.fileName.toLowerCase().endsWith(".cls")) {
      result.push(...this.classMethods(document));
    }
    if (document.fileName.toLowerCase().endsWith(".mac")) {
      result.push(...this.routineLabels(document));
    }
    return result;
  }

  private classMethods(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = currentFile(document);
    const result = new Array<vscode.CodeLens>();

    if (!file.name.match(/\.cls$/i)) {
      return result;
    }
    const className = file.name.split(".").slice(0, -1).join(".");

    const { debugThisMethod, runThisMethod } = config("debug");
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

      const methodMatch = text.match(/(?<=^ClassMethod\s)([^(]+)(\(.)/i);
      if (methodMatch) {
        const [, name, parens] = methodMatch;

        debugThisMethod && result.push(this.addDebugThisMethod(i, [`##class(${className}).${name}`, parens !== "()"]));
        runThisMethod && result.push(this.addRunThisMethod(i, [`Do ##class(${className}).${name}()`]));
      }
    }
    return result;
  }

  private routineLabels(document: vscode.TextDocument): vscode.CodeLens[] {
    const file = currentFile(document);
    const result = new Array<vscode.CodeLens>();

    if (!file.name.match(/\.mac$/i)) {
      return result;
    }
    const routineName = file.name.split(".").slice(0, -1).join(".");

    const { debugThisMethod, runThisMethod } = config("debug");

    debugThisMethod && result.push(this.addDebugThisMethod(0, [`^${routineName}`, false]));
    runThisMethod && result.push(this.addRunThisMethod(0, [`Do ^${routineName}`]));

    let inComment = false;
    for (let i = 1; i < document.lineCount; i++) {
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

      const labelMatch = text.match(/^(\w[^(\n\s]+)(?:\(([^)]*)\))?/i);
      if (labelMatch) {
        const [, name, parens] = labelMatch;

        debugThisMethod && result.push(this.addDebugThisMethod(i, [`${name}^${routineName}`, parens !== "()"]));
        runThisMethod && result.push(this.addRunThisMethod(i, [`Do ${name}^${routineName}`]));
      }
    }

    return result;
  }

  private addDebugThisMethod(line: number, args: any[]) {
    return new vscode.CodeLens(new vscode.Range(line, 0, line, 80), {
      title: `Debug this method`,
      command: "vscode-objectscript.debug",
      arguments: args,
    });
  }

  private addRunThisMethod(line: number, args: any[]) {
    return new vscode.CodeLens(new vscode.Range(line, 0, line, 80), {
      title: `Run this method in terminal`,
      command: "vscode-objectscript.runInTerminal",
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