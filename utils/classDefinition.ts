import { AtelierAPI } from '../api';

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

  async methods(scope: 'any' | 'class' | 'instance'): Promise<any[]> {
    let methods = [];
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
      return methods.filter(filterScope);
    };
    return api.actionIndex([this._classFileName]).then(data => getMethods(data.result.content));
  }

  async super(): Promise<string[]> {
    const api = new AtelierAPI();
    let sql = `SELECT PrimarySuper FROM %Dictionary.CompiledClass WHERE Name = ?`;
    return api
      .actionQuery(sql, [this._className])
      .then(data =>
        data.result.content.reduce(
          (list: string[], el: { PrimarySuper: string }) =>
            list.concat(el.PrimarySuper.split('~').filter(el => el.length)),
          []
        )
      );
  }

  async includeCode(): Promise<string[]> {
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
      );
  }
}
