// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: fetch } = require("node-fetch-cjs");

import * as httpModule from "http";
import * as httpsModule from "https";
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
  checkingConnection,
} from "../extension";
import { currentWorkspaceFolder, outputChannel, outputConsole } from "../utils";

const DEFAULT_API_VERSION = 1;
import * as Atelier from "./atelier";

// Map of the authRequest promises for each username@host:port target to avoid concurrency issues
const authRequestMap = new Map<string, Promise<any>>();

export interface ConnectionSettings {
  serverName: string;
  active: boolean;
  apiVersion: number;
  https: boolean;
  host: string;
  port: number;
  pathPrefix: string;
  ns: string;
  username: string;
  password: string;
  docker: boolean;
  dockerService?: string;
}

export class AtelierAPI {
  private _config: ConnectionSettings;
  private namespace: string;
  public configName: string;

  // when FileSystemProvider used
  public externalServer = false;

  // record of the constructor argument
  public readonly wsOrFile?: string | vscode.Uri;

  public get ns(): string {
    return (this.namespace || this._config.ns || "").toUpperCase();
  }

  public get config(): ConnectionSettings {
    const { serverName, active = false, https = false, pathPrefix = "", username } = this._config;
    const ns = this.namespace || this._config.ns;
    const host = this.externalServer
      ? this._config.host
      : workspaceState.get(this.configName + ":host", this._config.host);
    const port = this.externalServer
      ? this._config.port
      : workspaceState.get(this.configName + ":port", this._config.port);
    const password = workspaceState.get(this.configName + ":password", this._config.password);
    const apiVersion = workspaceState.get(this.configName + ":apiVersion", DEFAULT_API_VERSION);
    const docker = workspaceState.get(this.configName + ":docker", false);
    const dockerService = workspaceState.get<string>(this.configName + ":dockerService");
    return {
      serverName,
      active,
      apiVersion,
      https,
      host,
      port,
      pathPrefix,
      ns,
      username,
      password,
      docker,
      dockerService,
    };
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
          const parts = workspaceFolderName.split(":");
          if (parts.length === 2 && config("intersystems.servers").has(parts[0].toLowerCase())) {
            workspaceFolderName = parts[0];
            namespace = parts[1];
          } else {
            const { query } = url.parse(wsOrFile.toString(true), true);
            if (query) {
              if (query.ns && query.ns !== "") {
                namespace = query.ns.toString();
              }
            }
          }
        } else {
          const wsFolderOfFile = vscode.workspace.getWorkspaceFolder(wsOrFile);
          if (wsFolderOfFile) {
            workspaceFolderName = wsFolderOfFile.name;
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

  public get cookies(): string[] {
    const cookies = this.cache.get("cookies", []);
    return cookies;
  }

  public async clearCookies(): Promise<void> {
    await this.cache.put("cookies", []);
  }

  public xdebugUrl(): string {
    const { host, https, port, apiVersion, pathPrefix } = this.config;
    const proto = https ? "wss" : "ws";
    return `${proto}://${host}:${port}${pathPrefix}/api/atelier/v${apiVersion}/%25SYS/debug`;
  }

  public async updateCookies(newCookies: string[]): Promise<void> {
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
    await this.cache.put("cookies", cookies);
  }

  private setConnection(workspaceFolderName: string, namespace?: string): void {
    this.configName = workspaceFolderName;
    const conn = config("conn", workspaceFolderName);
    let serverName = workspaceFolderName.toLowerCase();
    if (config("intersystems.servers").has(serverName)) {
      this.externalServer = true;
    } else if (
      !(conn["docker-compose"] && extensionContext.extension.extensionKind !== vscode.ExtensionKind.Workspace) &&
      conn.server &&
      config("intersystems.servers", workspaceFolderName).has(conn.server)
    ) {
      // Connect to the server named in objectscript.conn
      // unless a docker-compose conn object exists and this extension isn't running remotely (i.e. within the dev container)
      serverName = conn.server;
    } else {
      serverName = "";
    }

    if (serverName !== "") {
      const {
        webServer: { scheme, host, port, pathPrefix = "" },
        username,
        password,
      } = getResolvedConnectionSpec(serverName, config("intersystems.servers", workspaceFolderName).get(serverName));
      this._config = {
        serverName,
        active: this.externalServer || conn.active,
        apiVersion: workspaceState.get(this.configName + ":apiVersion", DEFAULT_API_VERSION),
        https: scheme === "https",
        ns: namespace || conn.ns,
        host,
        port,
        username,
        password,
        pathPrefix,
        docker: false,
      };

      // Report server as inactive when no namespace has been determined,
      // otherwise output channel reports the issue.
      // This arises when a server-only workspace is editing the user's settings.json, or the .code-workspace file.
      if (this._config.ns === "" && this.externalServer) {
        this._config.active = false;
      }
    } else {
      this._config = conn;
      this._config.ns = namespace || conn.ns;
      this._config.serverName = "";
    }
  }

  private get cache(): Cache {
    const { host, port } = this.config;
    return new Cache(extensionContext, `API:${host}:${port}`);
  }

  public get connInfo(): string {
    const { host, port, docker, dockerService } = this.config;
    const ns = this.ns.toUpperCase();
    return (docker ? "docker" + (dockerService ? `:${dockerService}:${port}` : "") : `${host}:${port}`) + `[${ns}]`;
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
    headers?: any,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    options?: any
  ): Promise<any> {
    const { active, apiVersion, host, port, username, password, https } = this.config;
    if (!active || !port || !host) {
      return Promise.reject();
    }
    if (minVersion > apiVersion) {
      return Promise.reject(`${path} not supported by API version ${apiVersion}`);
    }
    const originalPath = path;
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
          result.push(`${key}=${encodeURIComponent(value)}`);
        }
      });
      return result.length ? "?" + result.join("&") : "";
    };
    method = method.toUpperCase();
    if (body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    headers["Cache-Control"] = "no-cache";

    const proto = this._config.https ? "https" : "http";
    const http = this._config.https ? httpsModule : httpModule;
    const agent = new http.Agent({
      keepAlive: true,
      maxSockets: 10,
      rejectUnauthorized: https && vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
    });

    let pathPrefix = this._config.pathPrefix || "";
    if (pathPrefix.length && !pathPrefix.startsWith("/")) {
      pathPrefix = "/" + pathPrefix;
    }

    path = encodeURI(`${pathPrefix}/api/atelier/${path || ""}`) + buildParams();

    const cookies = this.cookies;
    const target = `${username}@${host}:${port}`;
    let auth: Promise<any>;
    let authRequest = authRequestMap.get(target);
    if (cookies.length || method === "HEAD") {
      auth = Promise.resolve(cookies);

      // Only send basic authorization if username and password specified (including blank, for unauthenticated access)
      if (typeof username === "string" && typeof password === "string") {
        headers["Authorization"] = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
      }
    } else if (!cookies.length) {
      if (!authRequest) {
        // Recursion point
        authRequest = this.request(0, "HEAD");
        authRequestMap.set(target, authRequest);
      }
      auth = authRequest;
    }

    try {
      const cookie = await auth;
      const response = await fetch(`${proto}://${host}:${port}${path}`, {
        method,
        agent,
        body: body ? (typeof body !== "string" ? JSON.stringify(body) : body) : null,
        headers: {
          ...headers,
          Cookie: cookie,
        },
        // json: true,
        // resolveWithFullResponse: true,
        // simple: true,
      });
      if (response.status === 503) {
        // User likely ran out of licenses
        throw {
          statusCode: response.status,
          message: response.statusText,
          errorText: `The server at ${host}:${port} is unavailable. Check License Usage.`,
        };
      }
      if (response.status === 401) {
        authRequestMap.delete(target);
        if (this.wsOrFile && !checkingConnection) {
          setTimeout(() => {
            checkConnection(true, typeof this.wsOrFile === "object" ? this.wsOrFile : undefined);
          }, 1000);
        }
        throw { statusCode: response.status, message: response.statusText };
      }
      await this.updateCookies(response.headers.raw()["set-cookie"] || []);
      panel.text = `${this.connInfo}`;
      panel.tooltip = `Connected${pathPrefix ? " to " + pathPrefix : ""} as ${username}`;
      if (method === "HEAD") {
        authRequestMap.delete(target);
        return this.cookies;
      }

      // Not Modified
      if (response.status === 304) {
        throw { statusCode: response.status, message: response.statusText };
      }

      const responseString = new TextDecoder().decode(await response.arrayBuffer());
      let data: Atelier.Response;
      try {
        data = JSON.parse(responseString);
      } catch {
        throw {
          statusCode: response.status,
          message: response.statusText,
          errorText: `Non-JSON response to ${path} request. Is the web server suppressing detailed errors?`,
        };
      }

      // Decode encoded content
      if (data.result && data.result.enc && data.result.content) {
        data.result.enc = false;
        data.result.content = Buffer.from(data.result.content.join(""), "base64");
      }

      // Handle console output
      if (data.console) {
        // Let studio actions handle their console output
        const isStudioAction =
          data.result.content != undefined &&
          data.result.content.length !== 0 &&
          data.result.content[0] != undefined &&
          data.result.content[0].action != undefined;
        if (!isStudioAction && !options?.noOutput) {
          outputConsole(data.console);
        }
      }

      // Handle any errors
      if (data.status.summary !== "") {
        // This is a 500 server error, a query request with malformed SQL or a failed compile (which will have a 200 OK status)
        throw { statusCode: response.status, message: response.statusText, errorText: data.status.summary };
      }
      if (data.result.status && data.result.status !== "") {
        // This could be a 4XX error on a doc request
        // or a 200 from a deleteDoc request for which server-side source control blocked deletion
        throw { statusCode: response.status, message: response.statusText, errorText: data.result.status };
      }
      if (response.status >= 400) {
        // The request errored out, but didn't give us an error string back
        throw { statusCode: response.status, message: response.statusText, errorText: "" };
      }

      // Handle headers for the /work endpoints by storing the header values in the result object
      if (originalPath && originalPath.endsWith("/work") && method == "POST") {
        // This is a POST /work request, so we need to get the Location header
        data.result.location = response.headers.get("Location");
      } else if (originalPath && /^[^/]+\/work\/[^/]+$/.test(originalPath)) {
        // This is a GET or DELETE /work request, so we need to check the Retry-After header
        if (response.headers.has("Retry-After")) {
          data.result.retryafter = response.headers.get("Retry-After");
        }
      }

      return data;
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        authRequestMap.delete(target);
        panel.text = `${this.connInfo} $(debug-disconnect)`;
        panel.tooltip = "Disconnected";
        workspaceState.update(this.configName + ":host", undefined);
        workspaceState.update(this.configName + ":port", undefined);
        if (!checkingConnection) {
          setTimeout(checkConnection, 30000);
        }
      } else if (error.code === "EPROTO") {
        // This can happen if https was configured but didn't work
        authRequestMap.delete(target);
      }
      throw error;
    }
  }

  public serverInfo(): Promise<Atelier.Response<Atelier.Content<Atelier.ServerInfo>>> {
    return this.request(0, "GET").then((info) => {
      if (info && info.result && info.result.content && info.result.content.api > 0) {
        const data = info.result.content;
        const apiVersion = data.api;
        if (this.ns && this.ns.length && !data.namespaces.includes(this.ns)) {
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
  public getDoc(name: string, format?: string, mtime?: number): Promise<Atelier.Response<Atelier.Document>> {
    let params = {};
    if (!format && config("multilineMethodArgs") && this._config.apiVersion >= 4) {
      format = "udl-multiline";
    }
    if (format) {
      params = {
        format,
      };
    }
    name = this.transformNameIfCsp(name);
    const headers = {};
    if (mtime && mtime > 0) {
      headers["IF_NONE_MATCH"] = new Date(mtime).toISOString().replace(/T|Z/g, " ").trim();
    }
    return this.request(1, "GET", `${this.ns}/doc/${name}`, null, params, headers);
  }

  // api v1+
  public deleteDoc(name: string): Promise<Atelier.Response<Atelier.Document>> {
    return this.request(1, "DELETE", `${this.ns}/doc/${name}`);
  }

  // v1+
  public deleteDocs(docs: string[]): Promise<Atelier.Response<Atelier.Document[]>> {
    return this.request(1, "DELETE", `${this.ns}/docs`, docs);
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
    return this.request(2, "GET", `${this.ns}/action/search`, null, params, null, { noOutput: true });
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
    return this.request(1, "POST", `${this.ns}/cvt/xml/doc`, source, {}, { "Content-Type": "application/xml" });
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

  // v1+
  public getCSPApps(detail = false): Promise<Atelier.Response> {
    const params = {
      detail: detail ? 1 : 0,
    };
    return this.request(1, "GET", `%SYS/cspapps/${this.ns || ""}`, null, params);
  }

  // v1+
  private queueAsync(request: any): Promise<Atelier.Response> {
    return this.request(1, "POST", `${this.ns}/work`, request);
  }

  // v1+
  private pollAsync(id: string): Promise<Atelier.Response> {
    return this.request(1, "GET", `${this.ns}/work/${id}`);
  }

  // v1+
  private cancelAsync(id: string): Promise<Atelier.Response> {
    return this.request(1, "DELETE", `${this.ns}/work/${id}`);
  }

  /**
   * Calls `cancelAsync()` repeatedly until the cancellation is confirmed.
   * The wait time between requests is 1 second.
   */
  private async verifiedCancel(id: string): Promise<Atelier.Response> {
    outputChannel.appendLine(
      "\nWARNING: Compilation was cancelled. Partially-compiled documents may result in unexpected behavior."
    );
    let cancelResp = await this.cancelAsync(id);
    while (cancelResp.result.retryafter) {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
      cancelResp = await this.cancelAsync(id);
    }
    return cancelResp;
  }

  /**
   * Recursive function that calls `pollAsync()` repeatedly until we get a result or the user cancels the request.
   * The wait time between requests starts at 50ms and increases exponentially, with a max wait of 15 seconds.
   */
  private async getAsyncResult(id: string, wait: number, token: vscode.CancellationToken): Promise<Atelier.Response> {
    const pollResp = await this.pollAsync(id);
    if (token.isCancellationRequested) {
      // The user cancelled the request, so cancel it on the server
      return this.verifiedCancel(id);
    }
    if (pollResp.result.retryafter) {
      await new Promise((resolve) => {
        setTimeout(resolve, wait);
      });
      if (token.isCancellationRequested) {
        // The user cancelled the request, so cancel it on the server
        return this.verifiedCancel(id);
      }
      return this.getAsyncResult(id, wait < 10000 ? wait ** 1.075 : 15000, token);
    }
    return pollResp;
  }

  /**
   * Use the undocumented /work endpoints to compile `docs` asynchronously.
   */
  public async asyncCompile(
    docs: string[],
    token: vscode.CancellationToken,
    flags?: string,
    source = false
  ): Promise<Atelier.Response> {
    // Queue the compile request
    return this.queueAsync({
      request: "compile",
      documents: docs.map((doc) => this.transformNameIfCsp(doc)),
      source,
      flags,
    }).then((queueResp) => {
      // Request was successfully queued, so get the ID
      const id: string = queueResp.result.location;
      if (token.isCancellationRequested) {
        // The user cancelled the request, so cancel it on the server
        return this.verifiedCancel(id);
      }

      // Poll until we get a result or the user cancels the request
      return this.getAsyncResult(id, 50, token);
    });
  }
}
