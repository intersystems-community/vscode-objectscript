import * as vscode from "vscode";
import commands = require("./completion/commands.json");
import systemFunctions = require("./completion/systemFunctions.json");
import systemVariables = require("./completion/systemVariables.json");
import structuredSystemVariables = require("./completion/structuredSystemVariables.json");

export class ObjectScriptDiagnosticProvider {
  private _collection: vscode.DiagnosticCollection;

  public constructor() {
    this._collection = vscode.languages.createDiagnosticCollection("ObjectScript");
  }

  public updateDiagnostics(document: vscode.TextDocument) {
    if (document.languageId.startsWith("objectscript")) {
      this._collection.set(document.uri, [...this.commands(document), ...this.functions(document)]);
    }
  }

  private stripLineComments(text: string) {
    text = text.replace(/\/\/.*$/, "");
    text = text.replace(/#+;.*$/, "");
    text = text.replace(/;.*$/, "");
    return text;
  }

  private commands(document: vscode.TextDocument): vscode.Diagnostic[] {
    const result = new Array<vscode.Diagnostic>();

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = this.stripLineComments(line.text);

      const commandsMatch = text.match(/^\s+(?:}\s)?\b([a-z]+)\b/i);
      if (commandsMatch) {
        const [, found] = commandsMatch;
        const pos = line.text.indexOf(found);
        const range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + found.length));
        const command = commands.find(el => el.alias.includes(found.toUpperCase()));
        if (!command) {
          result.push({
            code: "",
            message: "Unrecognized command",
            range,
            severity: vscode.DiagnosticSeverity.Error,
            source: "",
            relatedInformation: [
              new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, range),
                `Command '${found}' not recognized`
              ),
            ],
          });
        }
      }
    }
    return result;
  }

  private functions(document: vscode.TextDocument): vscode.Diagnostic[] {
    const result = new Array<vscode.Diagnostic>();

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = this.stripLineComments(line.text);

      const pattern = /(?<!\$)(\$\b[a-z]+)\b/gi;
      let functionsMatch = null;
      while ((functionsMatch = pattern.exec(text)) !== null) {
        const [, found] = functionsMatch;
        const pos = functionsMatch.index;
        const range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + found.length));
        const systemFunction = [...systemFunctions, ...systemVariables, ...structuredSystemVariables].find(el =>
          el.alias.includes(found.toUpperCase())
        );
        if (!systemFunction) {
          result.push({
            code: "",
            message: "Unrecognized system function/variable",
            range,
            severity: vscode.DiagnosticSeverity.Error,
            source: "",
            relatedInformation: [
              new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, range),
                `System function or variable '${found}' not recognized`
              ),
            ],
          });
        }
      }
    }
    return result;
  }
}
