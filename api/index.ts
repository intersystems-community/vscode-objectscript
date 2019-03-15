import * as httpModule from 'http';
import * as httpsModule from 'https';
import { outputConsole, currentWorkspaceFolder } from '../utils';
const Cache = require('vscode-cache');
import { config, extensionContext } from '../extension';

const DEFAULT_API_VERSION: number = 3;

export class AtelierAPI {
  private _config: any;
  private _namespace: string;
  private _cache;

  public get ns(): string {
    return this._namespace || this._config.ns;
  }

  private get apiVersion(): number {
    return this._config.version || DEFAULT_API_VERSION;
  }

  constructor() {
    this.setConnection(currentWorkspaceFolder());
    const { name, host, port } = this._config;
    this._cache = new Cache(extensionContext, `API:${name}:${host}:${port}`);
  }

  setNamespace(namespace: string) {
    this._namespace = namespace;
  }

  get cookies(): string[] {
    return this._cache.get('cookies', []);
  }

  updateCookies(newCookies: string[]) {
    let cookies = this._cache.get('cookies', []);
    newCookies.forEach(cookie => {
      let [cookieName] = cookie.split('=');
      let index = cookies.findIndex(el => el.startsWith(cookieName));
      if (index >= 0) {
        cookies[index] = cookie;
      } else {
        cookies.push(cookie);
      }
    });
    this._cache.put('cookies', cookies);
  }

  setConnection(workspaceFolderName: string) {
    let conn = config('conn', workspaceFolderName);
    this._config = conn;
  }

  async request(
    minVersion: number,
    method: string,
    path?: string,
    body?: any,
    params?: any,
    headers?: any
  ): Promise<any> {
    if (minVersion > this.apiVersion) {
      return Promise.reject(`${path} not supported by API version ${this.apiVersion}`);
    }
    if (minVersion && minVersion > 0) {
      path = `v${this.apiVersion}/${path}`;
    }
    if (!this._config.active) {
      return Promise.reject();
    }
    headers = {
      ...headers,
      Accept: 'application/json',
      Cookie: this.cookies
    };
    const buildParams = (): string => {
      if (!params) {
        return '';
      }
      let result = [];
      Object.keys(params).forEach(key => {
        let value = params[key];
        if (value && value !== '') {
          if (typeof value === 'boolean') {
            value = value ? '1' : '0';
          }
          result.push(`${key}=${value}`);
        }
      });
      return result.length ? '?' + result.join('&') : '';
    };
    method = method.toUpperCase();
    if (['PUT', 'POST'].includes(method) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    headers['Cache-Control'] = 'no-cache';

    const { host, port, username, password } = this._config;
    const http: any = this._config.https ? httpsModule : httpModule;
    const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });
    path = encodeURI(`/api/atelier/${path || ''}${buildParams()}`);

    if (headers['Content-Type'] && headers['Content-Type'].includes('json')) {
      body = JSON.stringify(body);
    }

    return new Promise((resolve, reject) => {
      const req: httpModule.ClientRequest = http
        .request(
          {
            method,
            host,
            port,
            path,
            agent,
            auth: `${username}:${password}`,
            headers,
            body
          },
          (response: httpModule.IncomingMessage) => {
            if (response.statusCode < 200 || response.statusCode > 299) {
              reject(new Error('Failed to load page "' + path + '", status code: ' + response.statusCode));
            }
            this.updateCookies(response.headers['set-cookie']);
            // temporary data holder
            let body: string = '';
            response.on('data', chunk => {
              body += chunk;
            });
            response.on('end', () => {
              if (response.headers['content-type'].includes('json')) {
                const json = JSON.parse(body);
                if (json.console) {
                  outputConsole(json.console);
                }
                if (json.result.status) {
                  reject(new Error(json.result.status));
                  return;
                }
                resolve(json);
              } else {
                resolve(body);
              }
            });
          }
        )
        .on('error', error => {
          reject(error);
        });
      if (['PUT', 'POST'].includes(method)) {
        req.write(body);
      }
      req.end();
    }).catch(error => {
      console.error(error);
      throw error;
    });
  }

  serverInfo(): Promise<any> {
    return this.request(0, 'GET');
  }
  // api v1+
  getDocNames({
    generated = false,
    category = '*',
    type = '*',
    filter = ''
  }: {
    generated?: boolean;
    category?: string;
    type?: string;
    filter?: string;
  }): Promise<any> {
    return this.request(1, 'GET', `${this.ns}/docnames/${category}/${type}`, null, {
      filter,
      generated
    });
  }
  // api v1+
  getDoc(name: string, format?: string): Promise<any> {
    let params = {};
    if (format) {
      params = {
        format
      };
    }
    return this.request(1, 'GET', `${this.ns}/doc/${name}`, params);
  }
  // v1+
  putDoc(name: string, data: { enc: boolean; content: string[] }, ignoreConflict?: boolean): Promise<any> {
    let params = { ignoreConflict };
    return this.request(1, 'PUT', `${this.ns}/doc/${name}`, data, params);
  }
  // v1+
  actionIndex(docs: string[]): Promise<any> {
    return this.request(1, 'POST', `${this.ns}/action/index`, docs);
  }
  // v2+
  actionSearch(params: { query: string; files?: string; sys?: boolean; gen?: boolean; max?: number }): Promise<any> {
    return this.request(2, 'GET', `${this.ns}/action/search`, null, params);
  }
  // v1+
  actionQuery(query: string, parameters: string[]): Promise<any> {
    return this.request(1, 'POST', `${this.ns}/action/query`, {
      query,
      parameters
    });
  }
  // v1+
  actionCompile(docs: string[], flags?: string, source = false): Promise<any> {
    return this.request(1, 'POST', `${this.ns}/action/compile`, docs, { flags, source });
  }

  cvtXmlUdl(source: string): Promise<any> {
    return this.request(1, 'POST', `${this.ns}/`, source, {}, { 'Content-Type': 'application/xml' });
  }
  // v2+
  getmacrodefinition(docname: string, macroname: string, includes: string[]) {
    return this.request(2, 'POST', `${this.ns}/action/getmacrodefinition`, {
      docname,
      macroname,
      includes
    });
  }
  // v2+
  getmacrolocation(docname: string, macroname: string, includes: string[]) {
    return this.request(2, 'POST', `${this.ns}/action/getmacrolocation`, {
      docname,
      macroname,
      includes
    });
  }
}
