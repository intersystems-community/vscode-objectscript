import * as vscode from "vscode";

import { AtelierAPI } from "../api/index";
import { ClassDefinition } from "../utils/classDefinition";
import { currentFile } from "../utils";
import commands = require("./completion/commands.json");
import structuredSystemVariables = require("./completion/structuredSystemVariables.json");
import systemFunctions = require("./completion/systemFunctions.json");
import systemVariables = require("./completion/systemVariables.json");

export class ObjectScriptHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    if (!document.getWordRangeAtPosition(position)) {
      return;
    }
    return this.dollars(document, position) || this.commands(document, position);
  }

  public dollars(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const word = document.getWordRangeAtPosition(position);
    const text = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, word.end.character))
    );
    const file = currentFile();

    const dollarsMatch = text.match(/(\^?\$+)(\b\w+\b)$/);
    if (dollarsMatch) {
      const range = document.getWordRangeAtPosition(position, /\^?\$+\b\w+\b$/);
      let search = dollarsMatch.shift();
      const [dollars, value] = dollarsMatch;
      search = search.toUpperCase();
      if (dollars === "$$$") {
        return this.macro(file.name, value).then(contents => ({
          contents: [contents.join("")],
          range,
        }));
      } else if (dollars === "$" || dollars === "^$") {
        let found = systemFunctions.find(el => el.label === search || el.alias.includes(search));
        found = found || systemVariables.find(el => el.label === search || el.alias.includes(search));
        found = found || structuredSystemVariables.find(el => el.label === search || el.alias.includes(search));
        if (found) {
          return {
            contents: [found.documentation.join(""), this.documentationLink(found.link)],
            range,
          };
        }
      }
    }

    return null;
  }

  public async macro(fileName: string, macro: string): Promise<string[]> {
    const api = new AtelierAPI();
    let includes = [];
    if (fileName.toLowerCase().endsWith(".cls")) {
      const classDefinition = new ClassDefinition(fileName);
      includes = await classDefinition.includeCode();
    } else if (fileName.toLowerCase().endsWith(".inc")) {
      includes.push(fileName.replace(/\.inc$/i, ""));
    }
    return api
      .getmacrodefinition(fileName, macro, includes)
      .then(data =>
        data.result.content.definition.map((line: string) => (line.match(/^\s*#def/) ? line : `#define ${line}`))
      )
      .then(data => ["```objectscript\n", ...data, "\n```"]);
  }

  public commands(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const word = document.getWordRangeAtPosition(position);
    const text = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, word.end.character))
    );
    const commandMatch = text.match(/^\s+\b[a-z]+\b$/i);
    if (commandMatch) {
      const search = text.trim().toUpperCase();
      const command = commands.find(el => el.label === search || el.alias.includes(search));
      if (search) {
        return {
          contents: [command.documentation.join(""), this.documentationLink(command.link)],
          range: word,
        };
      }
    }
  }

  public documentationLink(link: string): string | null {
    if (link) {
      return `[Online documenation](${
        link.startsWith("http") ? "" : "https://docs.intersystems.com/irislatest"
      }${link})`;
    }
    return;
  }
}
