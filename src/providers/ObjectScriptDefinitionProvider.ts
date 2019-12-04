import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { currentFile, CurrentFile, currentWorkspaceFolder } from "../utils";
import { ClassDefinition } from "../utils/classDefinition";
import { DocumentContentProvider } from "./DocumentContentProvider";

export class ObjectScriptDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.DefinitionLink[]> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const workspaceFolderName = workspaceFolder ? workspaceFolder.name : currentWorkspaceFolder();
    const lineText = document.lineAt(position.line).text;
    const file = currentFile();

    const fromClassRef = this.classRef(workspaceFolderName, document, position);
    if (fromClassRef) {
      return fromClassRef;
    }

    const selfRef = document.getWordRangeAtPosition(position, /\.\.#?%?[a-zA-Z][a-zA-Z0-9]+/);
    if (selfRef) {
      const selfEntity = document.getText(selfRef).substr(2);
      const range = new vscode.Range(position.line, selfRef.start.character + 2, position.line, selfRef.end.character);
      const classDefinition = new ClassDefinition(file.name);
      return classDefinition.getMemberLocations(selfEntity).then((locations): vscode.DefinitionLink[] =>
        locations.map(
          (location): vscode.DefinitionLink => ({
            originSelectionRange: range,
            targetRange: location.range,
            targetUri: location.uri,
          })
        )
      );
    }

    const macroRange = document.getWordRangeAtPosition(position);
    const macroText = macroRange ? document.getText(macroRange) : "";
    const macroMatch = macroText.match(/^\${3}(\b\w+\b)$/);
    if (macroMatch) {
      const [, macro] = macroMatch;
      return this.macro(workspaceFolderName, currentFile(), macro).then(data =>
        data && data.document.length
          ? new vscode.Location(DocumentContentProvider.getUri(data.document), new vscode.Position(data.line, 0))
          : null
      );
    }
    const asClass = /(\b(?:Of|As|Extends)\b %?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b(?! of))/i;
    let parts = lineText.split(asClass);
    let pos = 0;
    for (const part of parts) {
      if (part.match(asClass)) {
        const [keyword, name] = part.split(" ");
        const start = pos + keyword.length + 1;
        if (this.isValid(position, start, name.length)) {
          return [
            this.makeClassDefinition(
              workspaceFolderName,
              position,
              start,
              name.length,
              this.normalizeClassName(document, name)
            ),
          ];
        }
      }
      pos += part.length;
    }

    const onProperty = /(\b(?:On)\b %?\b[a-zA-Z][a-zA-Z0-9]+\b)/i;
    parts = lineText.split(onProperty);
    pos = 0;
    for (const part of parts) {
      if (part.match(onProperty)) {
        const [keyword, name] = part.split(" ");
        const start = pos + keyword.length + 1;
        if (this.isValid(position, start, name.length)) {
          return [this.makePropertyDefinition(document, name)];
        }
      }
      pos += part.length;
    }
    const onPropertyList = /(\b(?:On)\b \([^)]+\))/i;
    parts = lineText.split(onPropertyList);
    pos = 0;
    for (const part of parts) {
      if (part.match(onPropertyList)) {
        const listProperties = /\(([^)]+)\)/.exec(part)[1].split(/\s*,\s*/);
        return listProperties
          .map(name => {
            name = name.trim();
            const start = pos + part.indexOf(name);
            if (this.isValid(position, start, name.length)) {
              return this.makePropertyDefinition(document, name);
            }
          })
          .filter(el => el != null);
      }
      pos += part.length;
    }
    const asClassList = /(\b(?:Extends)\b \([^)]+\))/i;
    parts = lineText.split(asClassList);
    pos = 0;
    for (const part of parts) {
      if (part.match(asClassList)) {
        const listClasses = /\(([^)]+)\)/.exec(part)[1].split(/\s*,\s*/);
        return listClasses
          .map(name => {
            name = name.trim();
            const start = pos + part.indexOf(name);
            if (this.isValid(position, start, name.length)) {
              return this.makeClassDefinition(
                workspaceFolderName,
                position,
                start,
                name.length,
                this.normalizeClassName(document, name)
              );
            }
          })
          .filter(el => el != null);
      }
      pos += part.length;
    }

    const includeMatch = lineText.match(
      /^\s*#?(?:Include|IncludeGenerator) (%?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b)/i
    );
    if (includeMatch) {
      const [, name] = includeMatch;
      const start = lineText.indexOf(name);
      if (this.isValid(position, start, name.length)) {
        return [
          this.makeRoutineDefinition(
            workspaceFolderName,
            position,
            start,
            name.length,
            this.normalizeRoutineName(document, name, "inc")
          ),
        ];
      }
    }

    const asRoutineList = /(\b(?:Include|IncludeGenerator)\b \([^)]+\))/i;
    parts = lineText.split(asRoutineList);
    pos = 0;
    for (const part of parts) {
      if (part.match(asRoutineList)) {
        const listRoutines = /\(([^)]+)\)/.exec(part)[1].split(",");
        for (let name of listRoutines) {
          name = name.trim();
          const start = pos + part.indexOf(name);
          if (this.isValid(position, start, name.length)) {
            return [
              this.makeRoutineDefinition(
                workspaceFolderName,
                position,
                start,
                name.length,
                this.normalizeRoutineName(document, name, "inc")
              ),
            ];
          }
        }
      }
      pos += part.length;
    }

    const asLabelRoutineCall = /(\^%?\b[a-zA-Z][a-zA-Z0-9]+(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b)/;
    parts = lineText.split(asLabelRoutineCall);
    pos = 0;
    for (const part of parts) {
      if (part.match(asLabelRoutineCall)) {
        const [, routine] = part.match(/\^(%?\b\w+\b)/);
        const start = pos + part.indexOf(routine) - 1;
        const length = routine.length + 1;
        return this.getFullRoutineName(routine).then(routineName => [
          this.makeRoutineDefinition(workspaceFolderName, position, start, length, routineName),
        ]);
      }
      pos += part.length;
    }

    return [];
  }

  public classRef(
    workspaceFolder: string,
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.Location | vscode.Location[] | vscode.DefinitionLink[]> {
    const classRef = /##class\(([^)]+)\)(?:\\$this)?\.(#?%?[a-zA-Z][a-zA-Z0-9]*)/i;
    const classRefRange = document.getWordRangeAtPosition(position, classRef);
    if (classRefRange) {
      const [, className, entity] = document.getText(classRefRange).match(classRef);
      const start = classRefRange.start.character + 8;
      if (this.isValid(position, start, className.length)) {
        return [
          this.makeClassDefinition(
            workspaceFolder,
            position,
            start,
            className.length,
            this.normalizeClassName(document, className)
          ),
        ];
      } else {
        const classDefinition = new ClassDefinition(className);
        return classDefinition.getMemberLocations(entity);
      }
    }

    return null;
  }

  public isValid(position: vscode.Position, start: number, length: number): boolean {
    return position.character >= start && position.character <= start + length;
  }

  public normalizeClassName(document: vscode.TextDocument, name: string): string {
    if (!name.includes(".")) {
      if (name.startsWith("%")) {
        name = name.replace("%", "%Library.");
      } else {
        name = this.getPackageName(document) + "." + name;
      }
    }
    name += ".cls";
    return name;
  }

  public normalizeRoutineName(document: vscode.TextDocument, name: string, extension: string): string {
    name += "." + extension;
    return name;
  }

  public getFullRoutineName(name: string): Promise<string> {
    const api = new AtelierAPI();
    return api
      .actionIndex([`${name}.int`, `${name}.mac`])
      .then(data => data.result.content)
      .then(files => files.filter(el => !el.gen && el.status === "" && el.db !== ""))
      .then(files => files.pop().name);
  }

  /**
   * returns package name for current class
   * @param document
   */
  public getPackageName(document: vscode.TextDocument): string {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      if (line.startsWith("Class")) {
        return line
          .split(" ")[1]
          .split(".")
          .slice(0, -1)
          .join(".");
      }
    }
    return "";
  }

  public makeClassDefinition(
    workspaceFolder: string,
    position: vscode.Position,
    start: number,
    length: number,
    name: string
  ): vscode.DefinitionLink {
    const firstLinePos = new vscode.Position(0, 0);
    return {
      originSelectionRange: new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, start + length)
      ),
      targetRange: new vscode.Range(firstLinePos, firstLinePos),
      targetUri: DocumentContentProvider.getUri(name, workspaceFolder),
    };
  }

  public makePropertyDefinition(document: vscode.TextDocument, name: string): vscode.DefinitionLink {
    const property = new RegExp(`(?<=^Property\\s)\\b${name}\\b`, "i");
    let descrLine = -1;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text;
      if (descrLine < 0 && line.match(/^\/\/\//)) {
        descrLine = i;
      }
      if (descrLine >= 0 && !line.trim().length) {
        descrLine = -1;
      }
      const propertyMatch = line.match(property);
      if (propertyMatch) {
        const targetSelectionRange = new vscode.Range(
          new vscode.Position(i, propertyMatch.index),
          new vscode.Position(i, propertyMatch.index + name.length)
        );
        const targetRange = new vscode.Range(
          new vscode.Position(descrLine >= 0 ? descrLine : i, 0),
          new vscode.Position(i, propertyMatch.index + line.length)
        );
        return {
          targetUri: document.uri,
          targetRange,
          targetSelectionRange,
        };
      }
    }
    return null;
  }

  public makeRoutineDefinition(
    workspaceFolder: string,
    position: vscode.Position,
    start: number,
    length: number,
    name: string
  ): vscode.DefinitionLink {
    const firstLinePos = new vscode.Position(0, 0);
    return {
      originSelectionRange: new vscode.Range(
        new vscode.Position(position.line, start),
        new vscode.Position(position.line, start + length)
      ),
      targetRange: new vscode.Range(firstLinePos, firstLinePos),
      targetUri: DocumentContentProvider.getUri(name, workspaceFolder),
    };
  }

  public async macro(
    workspaceFolder: string,
    file: CurrentFile,
    macro: string
  ): Promise<{ document: string; line: number }> {
    const fileName = file.name;
    const api = new AtelierAPI();
    let includes = [];
    if (fileName.toLowerCase().endsWith("cls")) {
      const classDefinition = new ClassDefinition(fileName);
      includes = await classDefinition.includeCode();
    }
    const tmpContent = file.content.replace(/\r/, "");
    const match = tmpContent.match(new RegExp(`^[\\t ]*#def(?:ine|1arg) \\b${macro}\\b`, "m"));
    if (match) {
      const line = tmpContent.substr(0, match.index).split("\n").length - 1;
      return Promise.resolve({ document: fileName, line });
    }

    return api.getmacrolocation(fileName, macro, includes).then(data => data.result.content);
  }
}
