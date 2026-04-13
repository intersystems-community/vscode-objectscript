import * as vscode from "vscode";
import { onlyUnique } from ".";
import { AtelierAPI } from "../api";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

export class ClassDefinition {
  public get uri(): vscode.Uri {
    return DocumentContentProvider.getUri(this._classFileName, this._workspaceFolder, this._namespace);
  }

  public static normalizeClassName(className: string, withExtension = false): string {
    return className.replace(/^%(\b\w+\b)$/, "%Library.$1") + (withExtension ? ".cls" : "");
  }
  private _className: string;
  private _classFileName: string;
  private _workspaceFolder: string;
  private _namespace: string;

  public constructor(className: string, workspaceFolder?: string, namespace?: string) {
    this._workspaceFolder = workspaceFolder;
    this._namespace = namespace;
    if (className.endsWith(".cls")) {
      className = className.replace(/\.cls$/i, "");
    }
    this._className = ClassDefinition.normalizeClassName(className, false);
    this._classFileName = ClassDefinition.normalizeClassName(className, true);
  }

  public async getDocument(): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(this.uri);
  }

  public async methods(scope: "any" | "class" | "instance" = "any"): Promise<any[]> {
    const methods = [];
    const filterScope = (method) => scope === "any" || method.scope === scope;
    const api = new AtelierAPI(this.uri);
    const getMethods = (content) => {
      const extend = [];
      content.forEach((el) => {
        methods.push(...el.content.methods);
        extend.push(...el.content.super.map((extendName) => ClassDefinition.normalizeClassName(extendName, true)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then((data) => getMethods(data.result.content));
      }
      return methods.filter(filterScope).filter(onlyUnique).sort();
    };
    return api.actionIndex([this._classFileName]).then((data) => getMethods(data.result.content));
  }

  public async properties(): Promise<any[]> {
    const properties = [];
    const api = new AtelierAPI(this.uri);
    const getProperties = (content) => {
      const extend = [];
      content.forEach((el) => {
        properties.push(...el.content.properties);
        extend.push(...el.content.super.map((extendName) => ClassDefinition.normalizeClassName(extendName, true)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then((data) => getProperties(data.result.content));
      }
      return properties.filter(onlyUnique).sort();
    };
    return api.actionIndex([this._classFileName]).then((data) => getProperties(data.result.content));
  }

  public async parameters(): Promise<any[]> {
    const parameters = [];
    const api = new AtelierAPI(this.uri);
    const getParameters = (content) => {
      const extend = [];
      content.forEach((el) => {
        parameters.push(...el.content.parameters);
        extend.push(...el.content.super.map((extendName) => ClassDefinition.normalizeClassName(extendName, true)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then((data) => getParameters(data.result.content));
      }
      return parameters.filter(onlyUnique).sort();
    };
    return api.actionIndex([this._classFileName]).then((data) => getParameters(data.result.content));
  }

  public async super(): Promise<string[]> {
    const api = new AtelierAPI(this.uri);
    const sql = `SELECT PrimarySuper FROM %Dictionary.CompiledClass
    WHERE Name %inlist (SELECT $LISTFROMSTRING(Super, ',') FROM %Dictionary.CompiledClass WHERE Name = ?)`;
    return api
      .actionQuery(sql, [this._className])
      .then(
        (data) =>
          data.result.content
            .reduce(
              (list: string[], el: { PrimarySuper: string }) =>
                list.concat(el.PrimarySuper.split("~").filter((item) => item.length)),
              []
            )
            .filter((name: string) => name !== this._className)
      )
      .then((data) => data);
  }

  public async includeCode(): Promise<string[]> {
    const api = new AtelierAPI(this.uri);
    const sql = `SELECT LIST(IncludeCode) List FROM %Dictionary.CompiledClass WHERE Name %INLIST (
      SELECT $LISTFROMSTRING(PrimarySuper, '~') FROM %Dictionary.CompiledClass WHERE Name = ?)`;
    const defaultIncludes = ["%occInclude", "%occErrors"];
    return api
      .actionQuery(sql, [this._className])
      .then((data) =>
        data.result.content.reduce(
          (list: string[], el: { List: string }) => list.concat(el.List.split(",")),
          defaultIncludes
        )
      )
      .then((data) => data);
  }

  public async getMemberLocation(name: string): Promise<vscode.Location> {
    let pattern;
    if (name.startsWith("#")) {
      pattern = `(Parameter) ${name.substr(1)}(?=[( ;])`;
    } else {
      pattern = `((Class)?Method|Property|RelationShip) (${name}|"${name}")(?=[( ])`;
    }
    return this.getDocument().then((document) => {
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        if (line.text.match(pattern)) {
          return new vscode.Location(this.uri, new vscode.Position(i, 0));
        }
      }
      return;
    });
  }

  public async getMemberLocations(name: string): Promise<vscode.Location[]> {
    const extendList = await this.super();
    return Promise.all([
      await this.getMemberLocation(name),
      ...extendList.map(async (docName) => {
        const classDef = new ClassDefinition(docName);
        return classDef.getMemberLocation(name);
      }),
    ]).then((data) => data.filter((el) => el != null));
  }
}
