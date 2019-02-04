import * as vscode from 'vscode';

import commands = require('./completion/commands.json');
import systemFunctions = require('./completion/systemFunctions.json');
import systemVariables = require('./completion/systemVariables.json');
import structuredSystemVariables = require('./completion/structuredSystemVariables.json');
import { currentFile } from '../utils/index.js';
import { AtelierAPI } from '../api/index.js';
import { ClassDefinition } from '../utils/classDefinition.js';

export class ObjectScriptHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    return this.dollars(document, position) || this.commands(document, position);
  }

  dollars(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    let word = document.getWordRangeAtPosition(position);
    let text = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, word.end.character))
    );
    let file = currentFile();

    let dollarsMatch = text.match(/(\^?\$+)(\b\w+\b)$/);
    if (dollarsMatch) {
      let range = document.getWordRangeAtPosition(position, /\^?\$+\b\w+\b$/);
      let [search, dollars, value] = dollarsMatch;
      search = search.toUpperCase();
      if (dollars === '$$$') {
        return this.macro(file.name, value).then(contents => ({
          range,
          contents: [contents.join('')]
        }));
      } else if (dollars === '$' || dollars === '^$') {
        let found = systemFunctions.find(el => el.label === search || el.alias.includes(search));
        found = found || systemVariables.find(el => el.label === search || el.alias.includes(search));
        found = found || structuredSystemVariables.find(el => el.label === search || el.alias.includes(search));
        if (found) {
          return {
            range,
            contents: [found.documentation.join(''), this.documentationLink(found.link)]
          };
        }
      }
    }

    return null;
  }

  async macro(fileName: string, macro: string): Promise<string[]> {
    const api = new AtelierAPI();
    let includes = [];
    if (fileName.toLowerCase().endsWith('cls')) {
      let classDefinition = new ClassDefinition(fileName);
      includes = await classDefinition.includeCode();
    }
    return api
      .getmacrodefinition(fileName, macro, includes)
      .then(data =>
        data.result.content.definition.map((line: string) => (line.match(/^\s*#def/) ? line : `#define ${line}`))
      )
      .then(data => ['```objectscript\n', ...data, '\n```']);
  }

  commands(document: vscode.TextDocument, position: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    let word = document.getWordRangeAtPosition(position);
    let text = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, word.end.character))
    );
    let commandMatch = text.match(/^\s+\b[a-z]+\b$/i);
    if (commandMatch) {
      let search = text.trim().toUpperCase();
      let command = commands.find(el => el.label === search || el.alias.includes(search));
      if (search) {
        return {
          range: word,
          contents: [command.documentation.join(''), this.documentationLink(command.link)]
        };
      }
    }
  }

  documentationLink(link): string | null {
    if (link) {
      return `[Online documenation](https://docs.intersystems.com/irislatest${link})`;
    }
    return;
  }
}
