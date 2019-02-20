import * as vscode from 'vscode';
import { DocumentContentProvider } from './DocumentContentProvider';
import { AtelierAPI } from '../api';
import { ClassDefinition } from '../utils/classDefinition';
import { currentFile } from '../utils';

export class ObjectScriptDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.DefinitionLink[]> {
    let lineText = document.lineAt(position.line).text;
    let file = currentFile();

    let fromClassRef = this.classRef(document, position);
    if (fromClassRef) {
      return fromClassRef;
    }

    let selfRef = document.getWordRangeAtPosition(position, /\.\.#?%?[a-zA-Z][a-zA-Z0-9]+/);
    if (selfRef) {
      let selfEntity = document.getText(selfRef).substr(2);
      let range = new vscode.Range(position.line, selfRef.start.character + 2, position.line, selfRef.end.character);
      let classDefinition = new ClassDefinition(file.name);
      return classDefinition.getMemberLocations(selfEntity).then(
        (locations): vscode.DefinitionLink[] =>
          locations.map(
            (location): vscode.DefinitionLink => ({
              originSelectionRange: range,
              targetUri: location.uri,
              targetRange: location.range
            })
          )
      );
    }

    let macroRange = document.getWordRangeAtPosition(position);
    let macroText = macroRange ? document.getText(macroRange) : '';
    let macroMatch = macroText.match(/^\${3}(\b\w+\b)$/);
    if (macroMatch) {
      let fileName = currentFile().name;
      let [, macro] = macroMatch;
      return this.macro(fileName, macro).then(data =>
        data && data.document.length
          ? new vscode.Location(DocumentContentProvider.getUri(data.document), new vscode.Position(data.line, 0))
          : null
      );
    }
    let asClass = /(\b(?:Of|As|Extends)\b %?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b(?! of))/i;
    let parts = lineText.split(asClass);
    let pos = 0;
    for (let part of parts) {
      if (part.match(asClass)) {
        let [keyword, name] = part.split(' ');
        let start = pos + keyword.length + 1;
        if (this.isValid(position, start, name.length)) {
          return [this.makeClassDefinition(position, start, name.length, this.normalizeClassName(document, name))];
        }
      }
      pos += part.length;
    }

    let asClassList = /(\b(?:Extends)\b \([^)]+\))/i;
    parts = lineText.split(asClassList);
    pos = 0;
    for (let part of parts) {
      if (part.match(asClassList)) {
        let listClasses = /\(([^)]+)\)/.exec(part)[1].split(/\s*,\s*/);
        return listClasses
          .map(name => {
            name = name.trim();
            let start = pos + part.indexOf(name);
            if (this.isValid(position, start, name.length)) {
              return this.makeClassDefinition(position, start, name.length, this.normalizeClassName(document, name));
            }
          })
          .filter(el => el != null);
      }
      pos += part.length;
    }

    if (lineText.match(/^#?(?:Include|IncludeGenerator) %?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b/i)) {
      let [, name] = lineText.split(' ');
      let start = lineText.indexOf(' ') + 1;
      if (this.isValid(position, start, name.length)) {
        return [
          this.makeRoutineDefinition(position, start, name.length, this.normalizeRoutineName(document, name, 'inc'))
        ];
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
          if (this.isValid(position, start, name.length)) {
            return [
              this.makeRoutineDefinition(position, start, name.length, this.normalizeRoutineName(document, name, 'inc'))
            ];
          }
        }
      }
      pos += part.length;
    }

    return [];
  }

  classRef(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.DefinitionLink[]> {
    let classRef = /##class\(([^)]+)\)(?:\\$this)?\.(#?%?[a-zA-Z][a-zA-Z0-9]*)/i;
    let classRefRange = document.getWordRangeAtPosition(position, classRef);
    if (classRefRange) {
      let [, className, entity] = document.getText(classRefRange).match(classRef);
      let start = classRefRange.start.character + 8;
      if (this.isValid(position, start, className.length)) {
        return [
          this.makeClassDefinition(position, start, className.length, this.normalizeClassName(document, className))
        ];
      } else {
        let classDefinition = new ClassDefinition(className);
        return classDefinition.getMemberLocations(entity);
      }
    }

    return null;
  }

  isValid(position: vscode.Position, start: number, length: number): boolean {
    return position.character >= start && position.character <= start + length;
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

  makeClassDefinition(position: vscode.Position, start: number, length: number, name: string): vscode.DefinitionLink {
    let firstLinePos = new vscode.Position(0, 0);
    return {
      originSelectionRange: new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, start + length)
      ),
      targetRange: new vscode.Range(firstLinePos, firstLinePos),
      targetUri: DocumentContentProvider.getUri(name)
    };
  }

  makeRoutineDefinition(position: vscode.Position, start: number, length: number, name: string): vscode.DefinitionLink {
    let firstLinePos = new vscode.Position(0, 0);
    return {
      originSelectionRange: new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, start + length)
      ),
      targetRange: new vscode.Range(firstLinePos, firstLinePos),
      targetUri: DocumentContentProvider.getUri(name)
    };
  }

  async macro(fileName: string, macro: string): Promise<{ document: string; line: number }> {
    const api = new AtelierAPI();
    let includes = [];
    if (fileName.toLowerCase().endsWith('cls')) {
      let classDefinition = new ClassDefinition(fileName);
      includes = await classDefinition.includeCode();
    }
    return api.getmacrolocation(fileName, macro, includes).then(data => data.result.content);
  }
}
