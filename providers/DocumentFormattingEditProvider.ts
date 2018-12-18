import * as vscode from 'vscode';

import commands = require('./completion/commands.json');

export class DocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    let edits = [];

    for (var i = 0; i < document.lineCount; i++) {
      var line = document.lineAt(i);

      let commandsMatch = line.text.match(/^\s+(?:}\s)?\b([a-z]+)\b/i);
      if (commandsMatch) {
        let [, found] = commandsMatch;
        found = found;
        let pos = line.text.indexOf(found);
        let command = commands.find(el => el.alias.includes(found.toUpperCase()));
        if (command.label !== found) {
          let range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + found.length));
          edits.push({
            range,
            newText: command.label
          });
        }
      }
    }

    return edits;
  }
}
