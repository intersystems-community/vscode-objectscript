import httpModule = require('http');
import httpsModule = require('https');

//import { ClientResponse } from 'http';

export class AtelierAPI {
  private http;
  private url;
  private agent;
  private cookies: string[] = [];
  constructor(
    private host: string,
    private port: number,
    private username: string,
    private password: string,
    private ns: string,
    private secure: boolean
  ) {
    this.http = secure ? httpsModule : httpModule;
    this.agent = new this.http.Agent({ keepAlive: true, maxSockets: 10 });
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

  request(method: string, path?: string, body?: any): Promise<any> {
    const headers = {
      Accept: 'application/json',
      Cookie: this.cookies
    };
    method = method.toUpperCase();
    if (['PUT', 'POST'].includes(method)) {
      headers['Content-Type'] = 'application/json';
    }
    return new Promise((resolve, reject) => {
      const req: httpModule.ClientRequest = this.http
        .request(
          {
            method,
            host: this.host,
            port: this.port,
            path: encodeURI(`/api/atelier/${path || ''}`),
            agent: this.agent,
            headers,
            body
          },
          ( response: any ) => {
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
                body = JSON.parse(body);
              }
              resolve(body);
            });
          }
        )
        .on('error', reject);
      if (['PUT', 'POST'].includes(method)) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  serverInfo(): Promise<any> {
    return this.request('GET');
  }

  getDocNames({
    generated = false,
    category = '*',
    filter = ''
  }: {
    generated: boolean;
    category: string;
    filter: string;
  }): Promise<any> {
    return this.request(
      'GET',
      `v2/${this.ns}/docnames/${category}?generated=${generated ? '1' : '0'}&filter=${filter}`
    );
  }

  actionIndex(docs: string[]): Promise<any> {
    return this.request('POST', `v2/${this.ns}/action/index`, docs);
  }
}
