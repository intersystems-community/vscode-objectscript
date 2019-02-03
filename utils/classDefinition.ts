import { AtelierAPI } from '../api';

export class ClassDefinition {
  public static normalizeClassName(className): string {
    return className.replace(/^%(\b\w+\b)$/, '%Library.$1') + '.cls';
  }

  constructor(private _className: string) {
    this._className = ClassDefinition.normalizeClassName(_className);
  }

  async methods(scope: 'any' | 'class' | 'instance'): Promise<any[]> {
    let methods = [];
    let filterScope = method => scope === 'any' || method.scope === scope;
    const api = new AtelierAPI();
    const getMethods = content => {
      let extend = [];
      content.forEach(el => {
        methods.push(...el.content.methods);
        extend.push(...el.content.super.map(extendName => ClassDefinition.normalizeClassName(extendName)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then(data => getMethods(data.result.content));
      }
      return methods.filter(filterScope);
    };
    return api.actionIndex([this._className]).then(data => getMethods(data.result.content));
  }
}
