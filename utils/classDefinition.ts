import { AtelierAPI } from '../api';

export class ClassDefinition {
  constructor(private _className: string) {
    this._className = this.normalizeClassName(_className);
  }

  normalizeClassName(className): string {
    return className.replace(/^%(\b\w+\b)$/, '%Library.$1') + '.cls';
  }

  async methods(scope: 'any' | 'class' | 'instance'): Promise<any[]> {
    let methods = [];
    let filterScope = method => scope === 'any' || method.scope === scope;
    const api = new AtelierAPI();
    const getMethods = content => {
      let extend = [];
      content.forEach(el => {
        methods.push(...el.content.methods);
        extend.push(...el.content.super.map(extendName => this.normalizeClassName(extendName)));
      });
      if (extend.length) {
        return api.actionIndex(extend).then(data => getMethods(data.result.content));
      }
      return methods.filter(filterScope);
    };
    return api.actionIndex([this._className]).then(data => getMethods(data.result.content));
  }
}
