import * as vscode from 'vscode';
import { DocumentContentProvider } from './DocumentContentProvider';

export class ObjectScriptDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.DefinitionLink[]> {
    let lineText = document.lineAt(position.line).text;

    let asClass = /(\b(?:Of|As|Extends)\b %?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b(?! of))/i;
    let parts = lineText.split(asClass);
    let pos = 0;
    for (let part of parts) {
      if (part.match(asClass)) {
        let [keyword, name] = part.split(' ');
        let start = pos + keyword.length + 1;
        let end = pos + part.length;
        if (this.isValid(position, start, end)) {
          return [this.makeClassDefinition(position, start, end, this.normalizeClassName(document, name))];
        }
      }
      pos += part.length;
    }

    let classRef = /(##class\([^)]+\))/i;
    parts = lineText.split(classRef);
    pos = 0;
    for (let part of parts) {
      if (part.match(classRef)) {
        let [, name] = /##class\(([^)]+)\)/i.exec(part);
        let start = pos + 8;
        let end = pos + part.length - 1;
        if (this.isValid(position, start, end)) {
          return [this.makeClassDefinition(position, start, end, this.normalizeClassName(document, name))];
        }
      }
      pos += part.length;
    }

    let asClassList = /(\b(?:Extends)\b \([^)]+\))/i;
    parts = lineText.split(asClassList);
    pos = 0;
    for (let part of parts) {
      if (part.match(asClassList)) {
        let listClasses = /\(([^)]+)\)/.exec(part)[1].split(',');
        for (let name of listClasses) {
          name = name.trim();
          let start = pos + part.indexOf(name);
          let end = start + name.length;
          if (this.isValid(position, start, end)) {
            return [this.makeClassDefinition(position, start, end, this.normalizeClassName(document, name))];
          }
        }
      }
      pos += part.length;
    }

    if (lineText.match(/^#?(?:Include|IncludeGenerator) %?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b/i)) {
      let [, name] = lineText.split(' ');
      let start = lineText.indexOf(' ') + 1;
      let end = start + name.length;
      if (this.isValid(position, start, end)) {
        return [this.makeRoutineDefinition(position, start, end, this.normalizeRoutineName(document, name, 'inc'))];
      }
    }

    let asRoutineList = /(\b(?:Include|IncludeGenerator)\b \([^)]+\))/i;
    parts = lineText.split(asRoutineList);
    pos = 0;
    for (let part of parts) {
      if (part.match(asRoutineList)) {
        let listRoutines = /\(([^)]+)\)/.exec(part)[1].split(',');
        for (let name of listRoutines) {
          name = name.trim();
          let start = pos + part.indexOf(name);
          let end = start + name.length;
          if (this.isValid(position, start, end)) {
            return [this.makeRoutineDefinition(position, start, end, this.normalizeRoutineName(document, name, 'inc'))];
          }
        }
      }
      pos += part.length;
    }

    return [];
  }

  isValid(position: vscode.Position, start: number, end: number): boolean {
    return position.character >= start && position.character <= end;
  }

  normalizeClassName(document: vscode.TextDocument, name: string): string {
    if (!name.includes('.')) {
      if (name.startsWith('%')) {
        name = name.replace('%', '%Library.');
      } else {
        name = this.getPackageName(document) + '.' + name;
      }
    }
    name += '.cls';
    return name;
  }

  normalizeRoutineName(document: vscode.TextDocument, name: string, extension: string): string {
    name += '.' + extension;
    return name;
  }

  /**
   * returns package name for current class
   * @param document
   */
  getPackageName(document: vscode.TextDocument): string {
    for (let i = 0; i < document.lineCount; i++) {
      let line = document.lineAt(i).text;
      if (line.startsWith('Class')) {
        return line
          .split(' ')[1]
          .split('.')
          .slice(0, -1)
          .join('.');
      }
    }
    return '';
  }

  makeClassDefinition(position: vscode.Position, start: number, end: number, name: string): vscode.DefinitionLink {
    let firstLinePos = new vscode.Position(0, 0);
    return {
      originSelectionRange: new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, end)
      ),
      targetRange: new vscode.Range(firstLinePos, firstLinePos),
      targetUri: DocumentContentProvider.getUri(name)
    };
  }

  makeRoutineDefinition(position: vscode.Position, start: number, end: number, name: string): vscode.DefinitionLink {
    let firstLinePos = new vscode.Position(0, 0);
    return {
      originSelectionRange: new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, end)
      ),
      targetRange: new vscode.Range(firstLinePos, firstLinePos),
      targetUri: DocumentContentProvider.getUri(name)
    };
  }
}
