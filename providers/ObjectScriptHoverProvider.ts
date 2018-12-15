import * as vscode from 'vscode';

import systemFunctions = require('./completion/systemFunctions.json');
import systemVariables = require('./completion/systemVariables.json');
import structuredSystemVariables = require('./completion/structuredSystemVariables.json');

export class ObjectScriptHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    let word = document.getWordRangeAtPosition(position);
    let text = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, word.end.character))
    );

    let dollarsMatch = text.match(/(\^?\$+)(\b\w+\b)$/);
    if (dollarsMatch) {
      let [search, dollars] = dollarsMatch;
      search = search.toUpperCase();
      if (dollars === '$' || dollars === '^$') {
        let found = systemFunctions.find(el => el.label === search || el.alias.includes(search));
        found = found || systemVariables.find(el => el.label === search || el.alias.includes(search));
        found = found || structuredSystemVariables.find(el => el.label === search || el.alias.includes(search));
        if (found) {
          return {
            range: new vscode.Range(
              new vscode.Position(word.start.line, word.start.character - dollars.length),
              new vscode.Position(word.end.line, word.end.character)
            ),
            contents: [found.documentation.join(''), this.documentationLink(found.link)]
          };
        }
      }
    }

    return null;
  }

  documentationLink(link): string | null {
    if (link) {
      return `[Online documenation](https://docs.intersystems.com/irislatest${link})`;
    }
    return;
  }
}
