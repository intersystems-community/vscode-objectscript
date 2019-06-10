import * as vscode from "vscode";

import commands = require("./completion/commands.json");

export class DocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    const edits = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      const commandsMatch = line.text.match(/^\s+(?:}\s)?\b([a-z]+)\b/i);
      if (commandsMatch) {
        let [, found] = commandsMatch;
        found = found;
        const pos = line.text.indexOf(found);
        const command = commands.find((el) => el.alias.includes(found.toUpperCase()));
        if (command.label !== found) {
          const range = new vscode.Range(new vscode.Position(i, pos), new vscode.Position(i, pos + found.length));
          edits.push({
            newText: command.label,
            range,
          });
        }
      }
    }

    return edits;
  }
}
