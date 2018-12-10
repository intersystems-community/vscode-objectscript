import * as vscode from 'vscode';
import { outputChannel } from '../utils';

import systemFunctions = require('./completion/systemFunctions.json');
import systemVariables = require('./completion/systemVariables.json');
import structuredSystemVariables = require('./completion/structuredSystemVariables.json');

export class ObjectScriptCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    let line = document.getText(
      new vscode.Range(new vscode.Position(position.line, 0), new vscode.Position(position.line, position.character))
    );

    let dollarsMatch = line.match(/(\^?\$+)(\b\w+\b)$/);
    if (dollarsMatch) {
      let [, dollars, search] = dollarsMatch;
      if (dollars === '$') {
        return [...this.listSystemFunctions(search), ...this.listSystemVariables(search)];
      } else if (dollars === '^$') {
        return this.listStructuredSystemVariables(search);
      }
    }
    return null;
  }

  listSystemFunctions(search: string): vscode.CompletionItem[] {
    return systemFunctions
      .filter(el => el.label.startsWith(search.toUpperCase()))
      .map(el => {
        return {
          ...el,
          kind: vscode.CompletionItemKind.Function,
          insertText: new vscode.SnippetString(el.label + '($0)')
        };
      });
  }

  listSystemVariables(search: string) {
    return systemVariables
      .filter(el => el.label.startsWith(search.toUpperCase()))
      .map(el => {
        return {
          ...el,
          kind: vscode.CompletionItemKind.Variable
        };
      });
  }

  listStructuredSystemVariables(search: string) {
    return structuredSystemVariables.map(el => {
      return {
        ...el,
        kind: vscode.CompletionItemKind.Variable,
        insertText: new vscode.SnippetString(el.label + '($0)')
      };
    });
  }
}
