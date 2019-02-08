import * as vscode from 'vscode';

import commands = require('./completion/commands.json');
import systemFunctions = require('./completion/systemFunctions.json');
import systemVariables = require('./completion/systemVariables.json');
import structuredSystemVariables = require('./completion/structuredSystemVariables.json');
import { ClassDefinition } from '../utils/classDefinition.js';
import { currentFile } from '../utils/index.js';

export class ObjectScriptCompletionItemProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
      if (context.triggerCharacter === '#') return this.macro(document, position, token, context);
      if (context.triggerCharacter === '.') return this.entities(document, position, token, context);
    }
    return (
      this.dollarsComplete(document, position) ||
      this.commands(document, position) ||
      this.macro(document, position, token, context) ||
      this.constants(document, position, token, context)
    );
  }

  macro(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter !== '#') {
      return null;
    }
    let range = document.getWordRangeAtPosition(position, /#+\b\w+[\w\d]*\b/);
    let line = range ? document.getText(range) : '';
    if (range && line && line !== '') {
      return [
        {
          label: '##class()',
          insertText: new vscode.SnippetString('##class($0)'),
          range
        },
        {
          label: '##super()',
          insertText: new vscode.SnippetString('##super($0)'),
          range
        }
      ];
    }
    return null;
  }

  commands(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    let word = document.getWordRangeAtPosition(position, /\s+\b\w+[\w\d]*\b/);
    let line = word ? document.getText(word) : '';

    if (line.match(/^\s+\b[a-z]+\b$/i)) {
      let search = line.trim().toUpperCase();
      let items = commands
        .filter(el => el.label.startsWith(search) || el.alias.findIndex(el2 => el2.startsWith(search)) >= 0)
        .map(el => ({
          ...el,
          kind: vscode.CompletionItemKind.Keyword,
          preselect: el.alias.includes(search),
          documentation: new vscode.MarkdownString(el.documentation.join('')),
          insertText: new vscode.SnippetString(el.insertText || `${el.label} $0`)
        }));
      if (!items.length) {
        return null;
      }
      return {
        // isIncomplete: items.length > 0,
        items
      };
    }
    return null;
  }

  dollarsComplete(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    let range = document.getWordRangeAtPosition(position, /\^?\$*\b\w+[\w\d]*\b/);
    let text = range ? document.getText(range) : '';
    let textAfter = '';

    let dollarsMatch = text.match(/(\^?\$+)(\b\w+\b)?$/);
    if (dollarsMatch) {
      let [search, dollars] = dollarsMatch;
      search = (search || '').toUpperCase();
      if (dollars === '$') {
        let items = [...this.listSystemFunctions(search, textAfter.length > 0), ...this.listSystemVariables(search)];
        return {
          isIncomplete: items.length > 1,
          items: items.map(el => {
            return {
              ...el,
              range
            };
          })
        };
      } else if (dollars === '^$') {
        return this.listStructuredSystemVariables(search, textAfter.length > 0).map(el => {
          return {
            ...el,
            range
          };
        });
      }
    }
    return null;
  }

  listSystemFunctions(search: string, open = false): vscode.CompletionItem[] {
    return systemFunctions
      .filter(el => el.label.startsWith(search) || el.alias.findIndex(el2 => el2.startsWith(search)) >= 0)
      .map(el => {
        return {
          ...el,
          kind: vscode.CompletionItemKind.Function,
          insertText: new vscode.SnippetString(el.label.replace('$', '\\$') + '($0' + (open ? '' : ')')),
          preselect: el.alias.includes(search),
          documentation: new vscode.MarkdownString(el.documentation.join(''))
        };
      });
  }

  listSystemVariables(search: string) {
    return systemVariables
      .filter(el => el.label.startsWith(search) || el.alias.findIndex(el2 => el2.startsWith(search)) >= 0)
      .map(el => {
        return {
          ...el,
          kind: vscode.CompletionItemKind.Variable,
          preselect: el.alias.includes(search),
          documentation: new vscode.MarkdownString(el.documentation.join('\n'))
        };
      });
  }

  listStructuredSystemVariables(search: string, open = false) {
    return structuredSystemVariables.map(el => {
      return {
        ...el,
        kind: vscode.CompletionItemKind.Variable,
        insertText: new vscode.SnippetString(el.label.replace('$', '\\$') + '($0' + (open ? '' : ')')),
        documentation: new vscode.MarkdownString(el.documentation.join('\n'))
      };
    });
  }

  constants(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    let range = document.getWordRangeAtPosition(position, /%?\b\w+[\w\d]*\b/);
    let kind = vscode.CompletionItemKind.Variable;
    if (context.triggerKind === vscode.CompletionTriggerKind.Invoke) {
      return [
        {
          label: '%session'
        },
        {
          label: '%request'
        },
        {
          label: '%response'
        },
        {
          label: 'SQLCODE'
        },
        {
          label: '%ROWCOUNT'
        }
      ].map(el => ({ ...el, kind, range }));
    }
    return null;
  }

  entities(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    let range = document.getWordRangeAtPosition(position, /%?\b\w+[\w\d]*\b/) || new vscode.Range(position, position);
    let textBefore = document.getText(new vscode.Range(new vscode.Position(position.line, 0), range.start));
    let curFile = currentFile();

    const method = el => ({
      label: el.name,
      documentation: el.desc.length ? new vscode.MarkdownString(el.desc.join('')) : null,
      kind: vscode.CompletionItemKind.Method,
      insertText: new vscode.SnippetString(`${el.name}($0)`)
    });

    const property = el => ({
      label: el.name,
      documentation: el.desc.length ? new vscode.MarkdownString(el.desc.join('')) : null,
      kind: vscode.CompletionItemKind.Property,
      insertText: new vscode.SnippetString(`${el.name}`)
    });

    let classRef = textBefore.match(/##class\(([^)]+)\)\.$/i);
    if (classRef) {
      let [, className] = classRef;
      let classDef = new ClassDefinition(className);
      return classDef.methods('class').then(data => data.map(method));
    }

    if (curFile.fileName.endsWith('cls')) {
      let selfRef = textBefore.match(/(?<!\.)\.\.$/i);
      if (selfRef) {
        let classDef = new ClassDefinition(curFile.name);
        return Promise.all([classDef.methods(), classDef.properties()]).then(data => {
          let [methods, properties] = data;
          return [...methods.map(method), ...properties.map(property)];
        });
      }
    }

    return null;
  }
}
