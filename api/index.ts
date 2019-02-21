import * as httpModule from 'http';
import * as httpsModule from 'https';
import { outputConsole, currentWorkspaceFolder } from '../utils';
import { config } from '../extension';

const DEFAULT_API_VERSION: number = 3;

export class AtelierAPI {
  private cookies: string[] = [];
  private _config: any;
  private _namespace: string;
  private static _apiVersion: number;

  private get ns(): string {
    return this._namespace || this._config.ns;
  }

  private get apiVersion(): number {
    return AtelierAPI._apiVersion || DEFAULT_API_VERSION;
  }

  constructor() {
    this.setConnection(currentWorkspaceFolder());
  }

  setNamespace(namespace: string) {
    this._namespace = namespace;
  }

  setApiVersion(apiVersion: number) {
    AtelierAPI._apiVersion = apiVersion;
  }

  updateCookies(cookies: string[]) {
    cookies.forEach(cookie => {
      let [cookieName] = cookie.split('=');
      let index = this.cookies.findIndex(el => el.startsWith(cookieName));
      if (index) {
        this.cookies[index] = cookie;
      } else {
        this.cookies.push(cookie);
      }
    });
  }

  setConnection(workspaceFolderName: string) {
    let conn = config('conn', workspaceFolderName);
    this._config = conn;
  }

  async request(method: string, path?: string, body?: any, params?: any, headers?: any): Promise<any> {
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
    console.log(`API request: ${method} ${path}`);

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
    return this.request('GET');
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
    return this.request('GET', `v${this.apiVersion}/${this.ns}/docnames/${category}/${type}`, null, {
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
    return this.request('GET', `v${this.apiVersion}/${this.ns}/doc/${name}`, params);
  }
  // v1+
  putDoc(name: string, data: { enc: boolean; content: string[] }, ignoreConflict?: boolean): Promise<any> {
    let params = { ignoreConflict };
    return this.request('PUT', `v${this.apiVersion}/${this.ns}/doc/${name}`, data, params);
  }
  // v1+
  actionIndex(docs: string[]): Promise<any> {
    return this.request('POST', `v${this.apiVersion}/${this.ns}/action/index`, docs);
  }
  // v2+
  actionSearch(params: { query: string; files?: string; sys?: boolean; gen?: boolean; max?: number }): Promise<any> {
    return this.apiVersion >= 2 ? 
      this.request('GET', `v${this.apiVersion}/${this.ns}/action/search`, null, params) : 
      Promise.reject(`Method 'search' not supported by API version ${this.apiVersion}`);
  }
  // v1+
  actionQuery(query: string, parameters: string[]): Promise<any> {
    return this.request('POST', `v${this.apiVersion}/${this.ns}/action/query`, {
      query,
      parameters
    });
  }
  // v1+
  actionCompile(docs: string[], flags?: string, source = false): Promise<any> {
    return this.request('POST', `v${this.apiVersion}/${this.ns}/action/compile`, docs, { flags, source });
  }

  cvtXmlUdl(source: string): Promise<any> {
    return this.request('POST', `v${this.apiVersion}/${this.ns}/cvt/xml/doc`, source, {}, { 'Content-Type': 'application/xml' });
  }
  // v2+
  getmacrodefinition(docname: string, macroname: string, includes: string[]) {
    return this.apiVersion >= 2 ? 
      this.request('POST', `v${this.apiVersion}/${this.ns}/action/getmacrodefinition`, {
        docname,
        macroname,
        includes
      }) :
      Promise.reject(`Method 'getmacrodefinition' not supported by API version ${this.apiVersion}`);
  }
  // v2+
  getmacrolocation(docname: string, macroname: string, includes: string[]) {
    return this.apiVersion >= 2 ? 
      this.request('POST', `v${this.apiVersion}/${this.ns}/action/getmacrolocation`, {
        docname,
        macroname,
        includes
      }) :
      Promise.reject(`Method 'getmacrolocation' not supported by API version ${this.apiVersion}`);
  }
}
