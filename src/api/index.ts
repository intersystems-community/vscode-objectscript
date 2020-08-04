import * as httpModule from "http";
import * as httpsModule from "https";
import * as request from "request-promise";
import * as url from "url";
import * as vscode from "vscode";
import * as Cache from "vscode-cache";
import {
  getResolvedConnectionSpec,
  config,
  extensionContext,
  workspaceState,
  panel,
  checkConnection,
  schemas,
} from "../extension";
import { currentWorkspaceFolder, outputConsole, outputChannel } from "../utils";

const DEFAULT_API_VERSION = 1;
// require("request-promise").debug = true;
import * as Atelier from "./atelier";

export interface ConnectionSettings {
  active: boolean;
  apiVersion: number;
  https: boolean;
  host: string;
  port: number;
  pathPrefix: string;
  ns: string;
  username: string;
  password: string;
}

export class AtelierAPI {
  private _config: ConnectionSettings;
  private namespace: string;
  private configName: string;

  // when FileSystemProvider used
  public externalServer = false;

  // record of the constructor argument
  public readonly wsOrFile?: string | vscode.Uri;

  public get ns(): string {
    return this.namespace || this._config.ns;
  }

  public get config(): ConnectionSettings {
    const { active = false, https = false, pathPrefix = "", username } = this._config;
    const ns = this.namespace || this._config.ns;
    const host = this.externalServer
      ? this._config.host
      : workspaceState.get(this.configName + ":host", this._config.host);
    const port = this.externalServer
      ? this._config.port
      : workspaceState.get(this.configName + ":port", this._config.port);
    const password = workspaceState.get(this.configName + ":password", this._config.password);
    const apiVersion = workspaceState.get(this.configName + ":apiVersion", DEFAULT_API_VERSION);
    return {
      active,
      apiVersion,
      https,
      host,
      port,
      pathPrefix,
      ns,
      username,
      password,
    };
  }

  private get iris(): boolean {
    return workspaceState.get(this.configName + ":iris", false);
  }

  private transformNameIfCsp(filename: string): string {
    // If a CSP file, change from
    // \csp\user\... to
    // csp/user/...
    if (filename.startsWith("\\")) {
      return filename.substring(1).replace(/\\/g, "/");
    }
    return filename;
  }

  public constructor(wsOrFile?: string | vscode.Uri, retryAfter401 = true) {
    if (retryAfter401) {
      this.wsOrFile = wsOrFile;
    }
    let workspaceFolderName = "";
    let namespace = "";
    if (wsOrFile) {
      if (wsOrFile instanceof vscode.Uri) {
        if (schemas.includes(wsOrFile.scheme)) {
          workspaceFolderName = wsOrFile.authority;
          const { query } = url.parse(decodeURIComponent(wsOrFile.toString()), true);
          if (query) {
            if (query.ns && query.ns !== "") {
              namespace = query.ns.toString();
            }
          }
        }
      } else {
        workspaceFolderName = wsOrFile;
      }
    }
    this.setConnection(workspaceFolderName || currentWorkspaceFolder(), namespace);
  }

  public get enabled(): boolean {
    return this._config.active;
  }

  public setNamespace(namespace: string): void {
    this.namespace = namespace;
  }

  public get active(): boolean {
    const { host = "", port = 0 } = this.config;
    return !!this._config.active && host.length > 0 && port > 0;
  }

  private get cookies(): string[] {
    return this.cache.get("cookies", []);
  }

  public clearCookies(): void {
    this.cache.set("cookies", []);
  }

  public xdebugUrl(): string {
    const { host, username, https, port, password, apiVersion } = this.config;
    const proto = https ? "wss" : "ws";
    const auth = this.iris
      ? `IRISUsername=${username}&IRISPassword=${password}`
      : `CacheUserName=${username}&CachePassword=${password}`;
    return `${proto}://${host}:${port}/api/atelier/v${apiVersion}/%25SYS/debug?${auth}`;
  }

  public updateCookies(newCookies: string[]): Promise<any> {
    const cookies = this.cache.get("cookies", []);
    newCookies.forEach((cookie) => {
      const [cookieName] = cookie.split("=");
      const index = cookies.findIndex((el) => el.startsWith(cookieName));
      if (index >= 0) {
        cookies[index] = cookie;
      } else {
        cookies.push(cookie);
      }
    });
    return this.cache.put("cookies", cookies);
  }

  private setConnection(workspaceFolderName: string, namespace?: string): void {
    this.configName = workspaceFolderName;
    const conn = config("conn", workspaceFolderName);
    let serverName = workspaceFolderName.toLowerCase();
    if (config("intersystems.servers").has(serverName)) {
      this.externalServer = true;
    } else if (conn.server) {
      serverName = conn.server;
    } else {
      serverName = "";
    }

    if (serverName && serverName.length) {
      const {
        webServer: { scheme, host, port, pathPrefix = "" },
        username,
        password,
      } = getResolvedConnectionSpec(serverName, config("intersystems.servers", workspaceFolderName).get(serverName));
      this._config = {
        active: this.externalServer || conn.active,
        apiVersion: 1,
        https: scheme === "https",
        ns: namespace || conn.ns,
        host,
        port,
        username,
        password,
        pathPrefix,
      };

      // Report server as inactive when no namespace has been determined,
      // otherwise output channel reports the issue.
      // This arises when a server-only workspace is editing the user's settings.json, or the .code-workspace file.
      if (this._config.ns === "" && this.externalServer) {
        this._config.active = false;
      }
    } else {
      this._config = conn;
    }
  }

  private get cache(): Cache {
    const { host, port } = this.config;
    return new Cache(extensionContext, `API:${host}:${port}`);
  }

  public async request(
    minVersion: number,
    method: string,
    path?: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    body?: any,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params?: any,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    headers?: any
  ): Promise<any> {
    const { active, apiVersion, host, port, username, password, https } = this.config;
    if (!active) {
      return Promise.reject();
    }
    if (minVersion > apiVersion) {
      return Promise.reject(`${path} not supported by API version ${apiVersion}`);
    }
    if (minVersion && minVersion > 0) {
      path = `v${apiVersion}/${path}`;
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
      Object.keys(params).forEach((key) => {
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

    const proto = this._config.https ? "https" : "http";
    const http = this._config.https ? httpsModule : httpModule;
    const agent = new http.Agent({
      keepAlive: true,
      maxSockets: 10,
      rejectUnauthorized: https && config("http.proxyStrictSSL"),
    });

    let pathPrefix = this._config.pathPrefix || "";
    if (pathPrefix.length && !pathPrefix.startsWith("/")) {
      pathPrefix = "/" + pathPrefix;
    }

    path = encodeURI(`${pathPrefix}/api/atelier/${path || ""}${buildParams()}`);

    const cookies = this.cookies;
    let auth;
    if (cookies.length || method === "HEAD") {
      auth = Promise.resolve(cookies);
    } else if (!cookies.length) {
      auth = this.request(0, "HEAD");
    }
    const connInfo = `${host}:${port}[${this.ns}]`;
    return auth.then((cookie) => {
      return (
        request({
          agent,
          auth: { user: username, pass: password, sendImmediately: true },
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
          .then((response) => this.updateCookies(response.headers["set-cookie"]).then(() => response))
          .then((response) => {
            panel.text = `${connInfo} - Connected`;
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
              // Let studio actions handle their console output
              const isStudioAction =
                data.result.content != undefined &&
                data.result.content.length !== 0 &&
                data.result.content[0] != undefined &&
                data.result.content[0].action != undefined;
              if (!isStudioAction) {
                outputConsole(data.console);
              }
            }
            if (data.result.status && data.result.status !== "") {
              const status: string = data.result.status;
              outputChannel.appendLine(status);
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
          .catch((error) => {
            console.log(error.error);
            if (error.error && error.error.code === "ECONNREFUSED") {
              workspaceState.update(this.configName + ":host", undefined);
              workspaceState.update(this.configName + ":port", undefined);
              setTimeout(checkConnection, 30000);
            } else if (error.statusCode === 401 && this.wsOrFile) {
              setTimeout(() => {
                checkConnection(true, typeof this.wsOrFile === "object" ? this.wsOrFile : undefined);
              }, 1000);
            }
            console.error(error);
            throw error;
          })
      );
    });
  }

  public serverInfo(): Promise<Atelier.Response<Atelier.Content<Atelier.ServerInfo>>> {
    return this.request(0, "GET").then((info) => {
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
          workspaceState.update(this.configName + ":apiVersion", apiVersion),
          workspaceState.update(this.configName + ":iris", data.version.startsWith("IRIS")),
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
  }): Promise<Atelier.Response> {
    return this.request(1, "GET", `${this.ns}/docnames/${category}/${type}`, null, {
      filter,
      generated,
    });
  }

  // api v1+
  public getDoc(name: string, format?: string): Promise<Atelier.Response<Atelier.Document>> {
    let params = {};
    if (format) {
      params = {
        format,
      };
    }
    name = this.transformNameIfCsp(name);
    return this.request(1, "GET", `${this.ns}/doc/${name}`, params);
  }

  // api v1+
  public deleteDoc(name: string): Promise<Atelier.Response<Atelier.Document>> {
    return this.request(1, "DELETE", `${this.ns}/doc/${name}`);
  }

  // v1+
  public putDoc(
    name: string,
    data: { enc: boolean; content: string[]; mtime: number },
    ignoreConflict?: boolean
  ): Promise<Atelier.Response> {
    const params = { ignoreConflict };
    name = this.transformNameIfCsp(name);
    const headers = {};
    if (!ignoreConflict && data.mtime && data.mtime > 0) {
      headers["IF_NONE_MATCH"] = new Date(data.mtime).toISOString().replace(/T|Z/g, " ").trim();
    }
    return this.request(1, "PUT", `${this.ns}/doc/${name}`, data, params, headers);
  }

  // v1+
  public actionIndex(docs: string[]): Promise<Atelier.Response> {
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
  }): Promise<Atelier.Response<Atelier.SearchResult[]>> {
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
  public actionQuery(query: string, parameters: string[]): Promise<Atelier.Response> {
    // outputChannel.appendLine('SQL: ' + query);
    // outputChannel.appendLine('SQLPARAMS: ' + JSON.stringify(parameters));
    return this.request(1, "POST", `${this.ns}/action/query`, {
      parameters,
      query,
    });
  }

  // v1+
  public actionCompile(docs: string[], flags?: string, source = false): Promise<Atelier.Response> {
    docs = docs.map((doc) => this.transformNameIfCsp(doc));
    return this.request(1, "POST", `${this.ns}/action/compile`, docs, {
      flags,
      source,
    });
  }

  public cvtXmlUdl(source: string): Promise<Atelier.Response> {
    return this.request(1, "POST", `${this.ns}/`, source, {}, { "Content-Type": "application/xml" });
  }

  // v2+
  public getmacrodefinition(docname: string, macroname: string, includes: string[]): Promise<Atelier.Response> {
    return this.request(2, "POST", `${this.ns}/action/getmacrodefinition`, {
      docname,
      includes,
      macroname,
    });
  }

  // v2+
  public getmacrolocation(docname: string, macroname: string, includes: string[]): Promise<Atelier.Response> {
    return this.request(2, "POST", `${this.ns}/action/getmacrolocation`, {
      docname,
      includes,
      macroname,
    });
  }

  // v2+
  public getmacrolist(docname: string, includes: string[]): Promise<Atelier.Response> {
    return this.request(2, "POST", `${this.ns}/action/getmacrolist`, {
      docname,
      includes,
    });
  }

  // v1+
  public getJobs(system: boolean): Promise<Atelier.Response> {
    const params = {
      system,
    };
    return this.request(1, "GET", `%SYS/jobs`, null, params);
  }
}
