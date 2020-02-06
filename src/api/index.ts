import * as httpModule from "http";
import * as httpsModule from "https";
import * as request from "request-promise";
import * as url from "url";
import * as vscode from "vscode";
import * as Cache from "vscode-cache";
import { config, extensionContext, FILESYSTEM_SCHEMA, workspaceState, panel, checkConnection } from "../extension";
import { currentWorkspaceFolder, outputConsole, outputChannel } from "../utils";

const DEFAULT_API_VERSION = 1;
// require("request-promise").debug = true;

export class AtelierAPI {
  private config: any;
  private namespace: string;
  private cache;
  private workspaceFolder;

  public get ns(): string {
    return this.namespace || this.config.ns;
  }

  private get apiVersion(): number {
    return workspaceState.get(this.workspaceFolder + ":apiVersion", DEFAULT_API_VERSION);
  }

  private get port(): number {
    return workspaceState.get(this.workspaceFolder + ":port", this.config.port);
  }

  private get password(): string {
    return workspaceState.get(this.workspaceFolder + ":password", this.config.password);
  }

  private get iris(): boolean {
    return workspaceState.get(this.workspaceFolder + ":iris", false);
  }

  public constructor(wsOrFile?: string | vscode.Uri) {
    let workspaceFolderName = "";
    if (wsOrFile) {
      if (wsOrFile instanceof vscode.Uri) {
        if (wsOrFile.scheme === FILESYSTEM_SCHEMA) {
          workspaceFolderName = wsOrFile.authority;
          const { query } = url.parse(decodeURIComponent(wsOrFile.toString()), true);
          if (query) {
            if (query.ns && query.ns !== "") {
              const namespace = query.ns.toString();
              this.setNamespace(namespace);
            }
          }
        }
      } else {
        workspaceFolderName = wsOrFile;
      }
    }
    this.setConnection(workspaceFolderName || currentWorkspaceFolder());
  }

  public get enabled(): boolean {
    return this.config.active;
  }

  public setNamespace(namespace: string) {
    this.namespace = namespace;
  }

  private get cookies(): string[] {
    return this.cache.get("cookies", []);
  }

  public clearCookies(): void {
    this.cache.set("cookies", []);
  }

  public xdebugUrl(): string {
    const { host, username, https } = this.config;
    const port = this.port;
    const password = this.password;
    const proto = https ? "wss" : "ws";
    const auth = this.iris
      ? `IRISUsername=${username}&IRISPassword=${password}`
      : `CacheUserName=${username}&CachePassword=${password}`;
    return `${proto}://${host}:${port}/api/atelier/v${this.apiVersion}/%25SYS/debug?${auth}`;
  }

  public updateCookies(newCookies: string[]): Promise<any> {
    const cookies = this.cache.get("cookies", []);
    newCookies.forEach(cookie => {
      const [cookieName] = cookie.split("=");
      const index = cookies.findIndex(el => el.startsWith(cookieName));
      if (index >= 0) {
        cookies[index] = cookie;
      } else {
        cookies.push(cookie);
      }
    });
    return this.cache.put("cookies", cookies);
  }

  public setConnection(workspaceFolderName: string) {
    this.workspaceFolder = workspaceFolderName;
    const conn = config("conn", workspaceFolderName);
    this.config = conn;
    const { name, host } = this.config;
    const port = this.port;
    this.cache = new Cache(extensionContext, `API:${name}:${host}:${port}`);
  }

  public async request(
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
    if (!this.config.active) {
      return Promise.reject();
    }
    headers = {
      ...headers,
      Accept: "application/json",
    };
    const buildParams = (): string => {
      if (!params) {
        return "";
      }
      const result = [];
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (typeof value === "boolean") {
          result.push(`${key}=${value ? "1" : "0"}`);
        } else if (value && value !== "") {
          result.push(`${key}=${value}`);
        }
      });
      return result.length ? "?" + result.join("&") : "";
    };
    method = method.toUpperCase();
    if (["PUT", "POST"].includes(method) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    headers["Cache-Control"] = "no-cache";

    const { host, username, https } = this.config;
    const port = this.port;
    const password = this.password;
    const proto = this.config.https ? "https" : "http";
    const http: any = this.config.https ? httpsModule : httpModule;
    const agent = new http.Agent({
      keepAlive: true,
      maxSockets: 10,
      rejectUnauthorized: https && config("http.proxyStrictSSL"),
    });
    path = encodeURI(`/api/atelier/${path || ""}${buildParams()}`);

    const cookies = this.cookies;
    let auth;
    if (cookies.length || method === "HEAD") {
      auth = Promise.resolve(cookies);
    } else if (!cookies.length) {
      auth = this.request(0, "HEAD");
    }
    const connInfo = `${host}:${port}[${this.ns}]`;
    return auth.then(cookie => {
      return (
        request({
          agent,
          auth: { username, password, sendImmediately: true },
          body: ["PUT", "POST"].includes(method) ? body : null,
          headers: {
            ...headers,
            Cookie: cookie,
          },
          json: true,
          method,
          resolveWithFullResponse: true,
          simple: true,
          uri: `${proto}://${host}:${port}${path}`,
        })
          // .catch(error => error.error)
          .then(response => this.updateCookies(response.headers["set-cookie"]).then(() => response))
          .then(response => {
            panel.text = `${connInfo} - Connected`;
            // console.log(`APIResponse: ${method} ${proto}://${host}:${port}${path}`)
            if (method === "HEAD") {
              return this.cookies;
            }
            const data = response.body;
            /// deconde encoded content
            if (data.result && data.result.enc && data.result.content) {
              data.result.enc = false;
              data.result.content = Buffer.from(data.result.content.join(""), "base64");
            }
            if (data.console) {
              outputConsole(data.console);
            }
            if (data.result.status && data.result.status !== "") {
              outputChannel.appendLine(data.result.status);
              throw new Error(data.result.status);
            }
            if (data.status.summary) {
              throw new Error(data.status.summary);
            } else if (data.result.status) {
              throw new Error(data.result.status);
            } else {
              return data;
            }
          })
          .catch(error => {
            if (error.error && error.error.code === "ECONNREFUSED") {
              setTimeout(checkConnection, 1000);
            }
            console.error(error);
            throw error;
          })
      );
    });
  }

  public serverInfo(): Promise<any> {
    return this.request(0, "GET").then(info => {
      if (info && info.result && info.result.content && info.result.content.api > 0) {
        const data = info.result.content;
        const apiVersion = data.api;
        if (!data.namespaces.includes(this.ns.toUpperCase())) {
          throw {
            code: "WrongNamespace",
            message: `This server does not have specified namespace '${this.ns}'.\n
            You must select one of the following: ${data.namespaces.join(", ")}.`,
          };
        }
        return Promise.all([
          workspaceState.update(currentWorkspaceFolder() + ":apiVersion", apiVersion),
          workspaceState.update(currentWorkspaceFolder() + ":iris", data.version.startsWith("IRIS")),
        ]).then(() => info);
      }
    });
  }
  // api v1+
  public getDocNames({
    generated = false,
    category = "*",
    type = "*",
    filter = "",
  }: {
    generated?: boolean;
    category?: string;
    type?: string;
    filter?: string;
  }): Promise<any> {
    return this.request(1, "GET", `${this.ns}/docnames/${category}/${type}`, null, {
      filter,
      generated,
    });
  }
  // api v1+
  public getDoc(name: string, format?: string): Promise<any> {
    let params = {};
    if (format) {
      params = {
        format,
      };
    }
    return this.request(1, "GET", `${this.ns}/doc/${name}`, params);
  }
  // api v1+
  public deleteDoc(name: string): Promise<any> {
    return this.request(1, "DELETE", `${this.ns}/doc/${name}`);
  }
  // v1+
  public putDoc(name: string, data: { enc: boolean; content: string[] }, ignoreConflict?: boolean): Promise<any> {
    const params = { ignoreConflict };
    return this.request(1, "PUT", `${this.ns}/doc/${name}`, data, params);
  }
  // v1+
  public actionIndex(docs: string[]): Promise<any> {
    return this.request(1, "POST", `${this.ns}/action/index`, docs);
  }
  // v2+
  public actionSearch(params: {
    query: string;
    files?: string;
    sys?: boolean;
    gen?: boolean;
    max?: number;
    regex?: boolean;
    case?: boolean;
    wild?: boolean;
    word?: boolean;
  }): Promise<any> {
    params = {
      files: "*.cls,*.mac,*.int,*.inc",
      gen: false,
      sys: false,
      regex: false,
      case: false,
      wild: false,
      word: false,
      ...params,
    };
    return this.request(2, "GET", `${this.ns}/action/search`, null, params);
  }
  // v1+
  public actionQuery(query: string, parameters: string[]): Promise<any> {
    // outputChannel.appendLine('SQL: ' + query);
    // outputChannel.appendLine('SQLPARAMS: ' + JSON.stringify(parameters));
    return this.request(1, "POST", `${this.ns}/action/query`, {
      parameters,
      query,
    });
  }
  // v1+
  public actionCompile(docs: string[], flags?: string, source = false): Promise<any> {
    return this.request(1, "POST", `${this.ns}/action/compile`, docs, {
      flags,
      source,
    });
  }

  public cvtXmlUdl(source: string): Promise<any> {
    return this.request(1, "POST", `${this.ns}/`, source, {}, { "Content-Type": "application/xml" });
  }
  // v2+
  public getmacrodefinition(docname: string, macroname: string, includes: string[]) {
    return this.request(2, "POST", `${this.ns}/action/getmacrodefinition`, {
      docname,
      includes,
      macroname,
    });
  }
  // v2+
  public getmacrolocation(docname: string, macroname: string, includes: string[]) {
    return this.request(2, "POST", `${this.ns}/action/getmacrolocation`, {
      docname,
      includes,
      macroname,
    });
  }
  // v2+
  public getmacrollist(docname: string, includes: string[]) {
    return this.request(2, "POST", `${this.ns}/action/getmacrolist`, {
      docname,
      includes,
    });
  }
  // v1+
  public getJobs(system: boolean) {
    const params = {
      system,
    };
    return this.request(1, "GET", `%SYS/jobs`, null, params);
  }
}
