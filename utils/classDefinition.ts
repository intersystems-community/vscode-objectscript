import * as vscode from 'vscode';
import { AtelierAPI } from '../api';
import { onlyUnique } from '.';
import { DocumentContentProvider } from '../providers/DocumentContentProvider';
import { workspaceState } from '../extension';

export class ClassDefinition {
  private _className: string;
  private _classFileName: string;
  public static normalizeClassName(className, withExtension = false): string {
    return className.replace(/^%(\b\w+\b)$/, '%Library.$1') + (withExtension ? '.cls' : '');
  }

  constructor(className: string) {
    if (className.endsWith('.cls')) {
      className = className.replace(/\.cls$/i, '');
    }
    this._className = ClassDefinition.normalizeClassName(className, false);
    this._classFileName = ClassDefinition.normalizeClassName(className, true);
  }

  store(kind: string, data: any): any {
    workspaceState.update(`${this._classFileName}|${kind}`, data);
    return data;
  }

  load(kind: string): any {
    return workspaceState.get(`${this._classFileName}|${kind}`);
  }

  async methods(scope: 'any' | 'class' | 'instance' = 'any'): Promise<any[]> {
    let methods = this.load('methods-' + scope) || [];
    if (methods.length) {
      return Promise.resolve(methods);
    }
    let filterScope = method => scope === 'any' || method.scope === scope;
    const api = new AtelierAPI();
    const getMethods = content => {
      let extend = [];
      content.forEach(el => {
        methods.push(...el.content.methods);
        extend.push(...el.content.super.map(extendName => ClassDefinition.normalizeClassName(extendName, true)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then(data => getMethods(data.result.content));
      }
      return this.store(
        'methods-' + scope,
        methods
          .filter(filterScope)
          .filter(onlyUnique)
          .sort()
      );
    };
    return api.actionIndex([this._classFileName]).then(data => getMethods(data.result.content));
  }

  async properties(): Promise<any[]> {
    let properties = this.load('properties') || [];
    if (properties.length) {
      return Promise.resolve(properties);
    }
    const api = new AtelierAPI();
    const getProperties = content => {
      let extend = [];
      content.forEach(el => {
        properties.push(...el.content.properties);
        extend.push(...el.content.super.map(extendName => ClassDefinition.normalizeClassName(extendName, true)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then(data => getProperties(data.result.content));
      }
      return this.store('properties', properties.filter(onlyUnique).sort());
    };
    return api.actionIndex([this._classFileName]).then(data => getProperties(data.result.content));
  }

  async parameters(): Promise<any[]> {
    let parameters = this.load('parameters') || [];
    if (parameters.length) {
      return Promise.resolve(parameters);
    }
    const api = new AtelierAPI();
    const getParameters = content => {
      let extend = [];
      content.forEach(el => {
        parameters.push(...el.content.parameters);
        extend.push(...el.content.super.map(extendName => ClassDefinition.normalizeClassName(extendName, true)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then(data => getParameters(data.result.content));
      }
      return this.store('parameters', parameters.filter(onlyUnique).sort());
    };
    return api.actionIndex([this._classFileName]).then(data => getParameters(data.result.content));
  }

  async super(): Promise<string[]> {
    let superList = this.load('super');
    if (superList) {
      return Promise.resolve(superList);
    }
    const api = new AtelierAPI();
    let sql = `SELECT PrimarySuper FROM %Dictionary.CompiledClass WHERE Name = ?`;
    return api
      .actionQuery(sql, [this._className])
      .then(
        data =>
          data.result.content.reduce(
            (list: string[], el: { PrimarySuper: string }) =>
              list.concat(el.PrimarySuper.split('~').filter(el => el.length)),
            []
          )
        // .filter(name => !['%Library.Base', '%Library.SystemBase'].includes(name))
      )
      .then(data => this.store('super', data));
  }

  async includeCode(): Promise<string[]> {
    let includeCode = this.load('includeCode');
    if (includeCode) {
      return Promise.resolve(includeCode);
    }
    const api = new AtelierAPI();
    let sql = `SELECT LIST(IncludeCode) List FROM %Dictionary.CompiledClass WHERE Name %INLIST (
      SELECT $LISTFROMSTRING(PrimarySuper, '~') FROM %Dictionary.CompiledClass WHERE Name = ?)`;
    let defaultIncludes = ['%occInclude', '%occErrors'];
    return api
      .actionQuery(sql, [this._className])
      .then(data =>
        data.result.content.reduce(
          (list: string[], el: { List: string }) => list.concat(el.List.split(',')),
          defaultIncludes
        )
      )
      .then(data => this.store('includeCode', data));
  }

  async getPosition(name: string, document?: vscode.TextDocument): Promise<vscode.Location[]> {
    let pattern;
    if (name.startsWith('#')) {
      pattern = `(Parameter) ${name.substr(1)}(?!\w)`;
    } else {
      pattern = `((Class)?Method|Property|RelationShip) ${name}(?!\w)`;
    }
    let foundLine;
    if (document) {
      for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i);
        if (line.text.match(pattern)) {
          foundLine = i;
          break;
        }
      }
    }
    let result: vscode.Location[] = [];
    if (foundLine) {
      result.push({
        uri: DocumentContentProvider.getUri(this._classFileName),
        range: new vscode.Range(foundLine, 0, foundLine, 0)
      });
    }
    let extendList = await this.super();
    let api = new AtelierAPI();
    let docs = [];
    extendList.forEach(async docName => {
      docName = ClassDefinition.normalizeClassName(docName, true);
      docs.push(api.getDoc(docName));
    });
    return Promise.all(docs).then((docs: any[]) => {
      for (let doc of docs) {
        if (doc && doc.result.content) {
          let docName = doc.result.name;
          let content = doc.result.content;
          for (let line of content.keys()) {
            if (content[line].match(pattern)) {
              result.push({
                uri: DocumentContentProvider.getUri(docName),
                range: new vscode.Range(line, 0, line, 0)
              });
            }
          }
        }
      }
      return result;
    });
  }
}
