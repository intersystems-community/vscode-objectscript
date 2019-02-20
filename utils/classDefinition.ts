import * as vscode from 'vscode';
const Cache = require('vscode-cache');
import { AtelierAPI } from '../api';
import { onlyUnique } from '.';
import { DocumentContentProvider } from '../providers/DocumentContentProvider';
import { extensionContext } from '../extension';

export class ClassDefinition {
  private _className: string;
  private _classFileName: string;
  private _cache;

  public static normalizeClassName(className, withExtension = false): string {
    return className.replace(/^%(\b\w+\b)$/, '%Library.$1') + (withExtension ? '.cls' : '');
  }

  constructor(className: string) {
    if (className.endsWith('.cls')) {
      className = className.replace(/\.cls$/i, '');
    }
    this._className = ClassDefinition.normalizeClassName(className, false);
    this._classFileName = ClassDefinition.normalizeClassName(className, true);
    this._cache = new Cache(extensionContext, this._classFileName);
  }

  get uri(): vscode.Uri {
    return DocumentContentProvider.getUri(this._classFileName);
  }

  async getDocument(): Promise<vscode.TextDocument> {
    return vscode.workspace.openTextDocument(this.uri);
  }

  store(kind: string, data: any): any {
    return this._cache.put(kind, data, 36000).then(() => data);
  }

  load(kind: string): any {
    return this._cache.get(kind);
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
    let sql = `SELECT PrimarySuper FROM %Dictionary.CompiledClass
    WHERE Name %inlist (SELECT $LISTFROMSTRING(Super, ',') FROM %Dictionary.CompiledClass WHERE Name = ?)`;
    return api
      .actionQuery(sql, [this._className])
      .then(
        data =>
          data.result.content
            .reduce(
              (list: string[], el: { PrimarySuper: string }) =>
                list.concat(el.PrimarySuper.split('~').filter(el => el.length)),
              []
            )
            .filter((name: string) => name !== this._className)
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

  async getMemberLocation(name: string): Promise<vscode.Location> {
    let pattern;
    if (name.startsWith('#')) {
      pattern = `(Parameter) ${name.substr(1)}(?=[( ;])`;
    } else {
      pattern = `((Class)?Method|Property|RelationShip) ${name}(?=[( ])`;
    }
    return this.getDocument().then(document => {
      for (let i = 0; i < document.lineCount; i++) {
        let line = document.lineAt(i);
        if (line.text.match(pattern)) {
          return new vscode.Location(this.uri, new vscode.Position(i, 0));
        }
      }
      return;
    });
  }

  async getMemberLocations(name: string): Promise<vscode.Location[]> {
    let extendList = await this.super();
    return Promise.all([
      await this.getMemberLocation(name),
      ...extendList.map(async docName => {
        let classDef = new ClassDefinition(docName);
        return classDef.getMemberLocation(name);
      })
    ]).then(data => data.filter(el => el != null));
  }
}
