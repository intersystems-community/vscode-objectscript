import axios from "axios";
import * as httpsModule from "https";
import * as vscode from "vscode";
import * as Cache from "vscode-cache";
import * as semver from "semver";
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
const DEFAULT_SERVER_VERSION = "2016.2.0";
import * as Atelier from "./atelier";

// Map of the authRequest promises for each username@host:port target to avoid concurrency issues
const authRequestMap = new Map<string, Promise<any>>();

interface ConnectionSettings {
  serverName: string;
  active: boolean;
  apiVersion: number;
  serverVersion: string;
  https: boolean;
  host: string;
  port: number;
  superserverPort?: number;
  pathPrefix: string;
  ns: string;
  username: string;
  password: string;
  docker: boolean;
  dockerService?: string;
}

// Needed to fix a TS error
declare let AbortSignal: {
  prototype: AbortSignal;
  new (): AbortSignal;
  abort(reason?: any): AbortSignal;
  timeout(milliseconds: number): AbortSignal;
};

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
    const wsKey = this.configName.toLowerCase();
    const host = this.externalServer ? this._config.host : workspaceState.get(wsKey + ":host", this._config.host);
    const port = this.externalServer ? this._config.port : workspaceState.get(wsKey + ":port", this._config.port);
    const superserverPort = this.externalServer
      ? this._config.superserverPort
      : workspaceState.get(wsKey + ":superserverPort", this._config.superserverPort);
    const password = workspaceState.get(wsKey + ":password", this._config.password);
    const apiVersion = workspaceState.get(wsKey + ":apiVersion", DEFAULT_API_VERSION);
    const serverVersion = workspaceState.get(wsKey + ":serverVersion", DEFAULT_SERVER_VERSION);
    const docker = workspaceState.get(wsKey + ":docker", false);
    const dockerService = workspaceState.get<string>(wsKey + ":dockerService");
    return {
      serverName,
      active,
      apiVersion,
      serverVersion,
      https,
      host,
      port,
      superserverPort,
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
          if (
            parts.length === 2 &&
            (config("intersystems.servers").has(parts[0].toLowerCase()) ||
              vscode.workspace.workspaceFolders.find(
                (ws) => ws.uri.scheme === "file" && ws.name.toLowerCase() === parts[0].toLowerCase()
              ))
          ) {
            workspaceFolderName = parts[0];
            namespace = parts[1];
          } else {
            const params = new URLSearchParams(wsOrFile.query);
            if (params.has("ns") && params.get("ns") != "") {
              namespace = params.get("ns");
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

  public terminalUrl(): string {
    const { host, https, port, apiVersion, pathPrefix } = this.config;
    return apiVersion >= 7
      ? `${https ? "wss" : "ws"}://${host}:${port}${pathPrefix}/api/atelier/v${apiVersion}/%25SYS/terminal`
      : "";
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

    const ns = namespace ? namespace.toUpperCase() : conn.ns ? (conn.ns as string).toUpperCase() : undefined;
    if (serverName !== "") {
      const {
        webServer: { scheme, host, port, pathPrefix = "" },
        username,
        password,
        superServer,
      } = getResolvedConnectionSpec(serverName, config("intersystems.servers", workspaceFolderName).get(serverName));
      this._config = {
        serverName,
        active: this.externalServer || conn.active,
        apiVersion: workspaceState.get(this.configName.toLowerCase() + ":apiVersion", DEFAULT_API_VERSION),
        serverVersion: workspaceState.get(this.configName.toLowerCase() + ":serverVersion", DEFAULT_SERVER_VERSION),
        https: scheme === "https",
        ns,
        host,
        port,
        superserverPort: superServer.port,
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
    } else if (conn["docker-compose"]) {
      // Provided a docker-compose type connection spec has previously been resolved we can use its values
      const resolvedSpec = getResolvedConnectionSpec(workspaceFolderName, undefined);
      if (resolvedSpec) {
        const {
          webServer: { scheme, host, port, pathPrefix = "" },
          username,
          password,
          superServer,
        } = resolvedSpec;
        this._config = {
          serverName: "",
          active: true,
          apiVersion: workspaceState.get(this.configName.toLowerCase() + ":apiVersion", DEFAULT_API_VERSION),
          serverVersion: workspaceState.get(this.configName.toLowerCase() + ":serverVersion", DEFAULT_SERVER_VERSION),
          https: scheme === "https",
          ns,
          host,
          port,
          superserverPort: superServer.port,
          username,
          password,
          pathPrefix,
          docker: true,
          dockerService: conn["docker-compose"].service,
        };
      } else {
        this._config = conn;
        this._config.ns = ns;
        this._config.serverName = "";
      }
    } else {
      this._config = conn;
      this._config.ns = ns;
      this._config.serverName = "";
    }
  }

  private get cache(): Cache {
    const { host, port } = this.config;
    return new Cache(extensionContext, `API:${host}:${port}`);
  }

  public get connInfo(): string {
    const { serverName, host, port, docker, dockerService } = this.config;
    const ns = this.ns.toUpperCase();
    return (
      (docker
        ? "docker" + (dockerService ? `:${dockerService}:${port}` : "")
        : serverName
          ? serverName
          : `${host}:${port}`) + `[${ns}]`
    );
  }

  /** Return the server's name in `intersystems.servers` if it exists, else its `host:port/pathPrefix` */
  public get serverId(): string {
    const { serverName, host, port, pathPrefix } = this.config;
    return serverName && serverName !== "" ? serverName : `${host}:${port}${pathPrefix}`;
  }

  public async request(
    minVersion: number,
    method: string,
    path?: string,
    body?: any,
    params?: any,
    headers?: any,
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

    const proto = https ? "https" : "http";
    const httpsAgent = new httpsModule.Agent({
      rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
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
    if (cookies.length || (method === "HEAD" && !originalPath)) {
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

    const outputTraffic = vscode.workspace.getConfiguration("objectscript").get<boolean>("outputRESTTraffic");
    let cookie;
    let reqTs: Date;
    const outputRequest = () => {
      outputChannel.appendLine(`+- REQUEST - ${reqTs.toLocaleTimeString()} ----------------------------`);
      outputChannel.appendLine(`${method} ${proto}://${host}:${port}${path}`);
      if (cookie) outputChannel.appendLine("COOKIE: <value>");
      for (const [h, v] of Object.entries(headers)) {
        // Don't output value of the Authorization header
        const hUpper = h.toUpperCase();
        outputChannel.appendLine(`${hUpper}: ${hUpper == "AUTHORIZATION" ? "<value>" : v}`);
      }
      if (body) {
        outputChannel.appendLine(
          `Body:\n${headers["Content-Type"] == "application/json" ? JSON.stringify(body, null, 2) : body}`
        );
      }
    };
    try {
      cookie = await auth;
      reqTs = new Date();
      const response = await axios.request({
        method,
        url: `${proto}://${host}:${port}${path}`,
        headers: {
          ...headers,
          Cookie: cookie,
        },
        data: body,
        withCredentials: true,
        httpsAgent,
        timeout: options?.timeout ? options.timeout : 0,
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
        validateStatus: (status) => status < 504,
      });
      if (outputTraffic) {
        outputRequest();
        outputChannel.appendLine(`+- RESPONSE - ${new Date().toLocaleTimeString()} ---------------------------`);
        outputChannel.appendLine(`${response.status} ${response.statusText}`);
        for (const [h, v] of Object.entries(response.headers)) {
          // Don't output value of the Set-Cookie header
          const hUpper = h.toUpperCase();
          outputChannel.appendLine(`${hUpper}: ${hUpper == "SET-COOKIE" ? "<value>" : v}`);
        }
        if (response.data) {
          outputChannel.appendLine(
            `Body:\n${typeof response.data == "object" ? JSON.stringify(response.data, null, 2) : response.data}`
          );
        }
        outputChannel.appendLine(`+- END ----------------------------------------------`);
      }
      if (response.status === 503) {
        // User likely ran out of licenses
        throw {
          statusCode: response.status,
          message: response.statusText,
          errorText: `The server at ${host}:${port}${pathPrefix} is unavailable. Check License Usage.`,
        };
      }
      if (response.status === 401) {
        authRequestMap.delete(target);
        if (this.wsOrFile && !checkingConnection) {
          setTimeout(() => {
            checkConnection(
              password ? true : false,
              typeof this.wsOrFile === "object" ? this.wsOrFile : undefined,
              true
            );
          }, 500);
        }
        throw { statusCode: response.status, message: response.statusText };
      }
      await this.updateCookies(response.headers["set-cookie"] || []);
      if (method === "HEAD") {
        if (!originalPath) {
          authRequestMap.delete(target);
          return this.cookies;
        } else if (response.status >= 400) {
          // The HEAD /doc request errored out
          throw { statusCode: response.status, message: response.statusText, errorText: "" };
        } else {
          // The HEAD /doc request succeeded
          return response.headers["etag"];
        }
      }

      // Not Modified
      if (response.status === 304) {
        throw { statusCode: response.status, message: response.statusText };
      }

      if (typeof response.data != "object") {
        throw {
          statusCode: response.status,
          message: response.statusText,
          errorText: `Body of '${response.status} ${response.statusText}' response to ${path} request is not JSON. Is the web server suppressing detailed errors?`,
        };
      }
      const data: Atelier.Response = response.data;

      // Decode encoded content
      if (data.result && data.result.enc && data.result.content) {
        data.result.enc = false;
        data.result.content = Buffer.from(data.result.content.join(""), "base64");
      }

      // Handle console output
      if (data.console) {
        // Let Studio actions handle their console output
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
        data.result.location = response.headers["location"];
      } else if (originalPath && /^[^/]+\/work\/[^/]+$/.test(originalPath)) {
        // This is a GET or DELETE /work request, so we need to check the Retry-After header
        if (response.headers["retry-after"]) {
          data.retryafter = response.headers["retry-after"];
        }
      }

      return data;
    } catch (error) {
      if (outputTraffic && !error.statusCode) {
        // Only output errors here if they were "hard" errors, not HTTP response errors
        outputRequest();
        outputChannel.appendLine(`+- ERROR --------------------------------------------`);
        outputChannel.appendLine(`${JSON.stringify(error, null, 2)}`);
        outputChannel.appendLine(`+- END ----------------------------------------------`);
      }
      // always discard the cached authentication promise
      authRequestMap.delete(target);

      // In some cases schedule an automatic retry.
      // ENOTFOUND occurs if, say, the VPN to the server's network goes down.
      if (["ECONNREFUSED", "ENOTFOUND", "ECONNABORTED", "ERR_CANCELED"].includes(error.code)) {
        panel.text = `${this.connInfo} $(debug-disconnect)`;
        panel.tooltip = "Disconnected";
        workspaceState.update(this.configName.toLowerCase() + ":host", undefined);
        workspaceState.update(this.configName.toLowerCase() + ":port", undefined);
        if (!checkingConnection) {
          setTimeout(() => checkConnection(false, undefined, true), 30000);
        }
      }
      throw error;
    }
  }

  public serverInfo(checkNs = true, timeout?: number): Promise<Atelier.Response<Atelier.Content<Atelier.ServerInfo>>> {
    return this.request(0, "GET", undefined, undefined, undefined, undefined, { timeout }).then((info) => {
      if (info && info.result && info.result.content && info.result.content.api > 0) {
        const data = info.result.content;
        const apiVersion = data.api;
        const serverVersion = semver.coerce(
          data.version
            .slice(data.version.indexOf(") ") + 2)
            .split(" ")
            .shift()
        ).version;
        if (this.ns && this.ns.length && !data.namespaces.includes(this.ns) && checkNs) {
          throw {
            code: "WrongNamespace",
            message: `This server does not have specified namespace '${
              this.ns
            }'.\nYou must select one of the following: ${data.namespaces.join(", ")}.`,
          };
        }
        return Promise.all([
          workspaceState.update(this.configName.toLowerCase() + ":apiVersion", apiVersion),
          workspaceState.update(this.configName.toLowerCase() + ":serverVersion", serverVersion),
          workspaceState.update(this.configName.toLowerCase() + ":iris", data.version.startsWith("IRIS")),
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
  public headDoc(name: string): Promise<string> {
    return this.request(1, "HEAD", `${this.ns}/doc/${name}`);
  }

  // api v1+
  public getDoc(name: string, format?: string, mtime?: number): Promise<Atelier.Response<Atelier.Document>> {
    let params = {};
    if (!format && config("multilineMethodArgs", this.configName) && this.config.apiVersion >= 4) {
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
      headers["IF-NONE-MATCH"] = new Date(mtime).toISOString().replace(/T|Z/g, " ").trim();
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
      headers["IF-NONE-MATCH"] = new Date(data.mtime).toISOString().replace(/T|Z/g, " ").trim();
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
  public getCSPApps(detail = false, nsOverride?: string): Promise<Atelier.Response> {
    const params = {
      detail: detail ? 1 : 0,
    };
    return this.request(1, "GET", `%SYS/cspapps/${nsOverride || this.ns || ""}`, null, params);
  }

  // v1+
  public queueAsync(request: Atelier.AsyncRequest, noOutput = false): Promise<Atelier.Response> {
    return this.request(1, "POST", `${this.ns}/work`, request, undefined, undefined, { noOutput });
  }

  // v1+
  public pollAsync(id: string, noOutput = false): Promise<Atelier.Response> {
    return this.request(1, "GET", `${this.ns}/work/${id}`, undefined, undefined, { noOutput });
  }

  // v1+
  public cancelAsync(id: string): Promise<Atelier.Response> {
    return this.request(1, "DELETE", `${this.ns}/work/${id}`);
  }

  /**
   * Calls `cancelAsync()` repeatedly until the cancellation is confirmed.
   * The wait time between requests is 1 second.
   */
  public async verifiedCancel(id: string, compile = true): Promise<Atelier.Response> {
    if (compile) {
      outputChannel.appendLine(
        "\nWARNING: Compilation was cancelled. Partially-compiled documents may result in unexpected behavior."
      );
      outputChannel.show(true);
    }
    let cancelResp = await this.cancelAsync(id);
    while (cancelResp.retryafter) {
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
    if (pollResp.retryafter) {
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

  // v1+
  public async getNamespace(nsOverride?: string): Promise<Atelier.Response> {
    return this.request(1, "GET", nsOverride || this.ns);
  }

  // v1+
  public async getEnsClassList(type: number): Promise<Atelier.Response> {
    return this.request(1, "GET", `${this.ns}/ens/classes/${type}`);
  }

  // v2+
  public async getCSPDebugId(): Promise<Atelier.Response<Atelier.Content<number>>> {
    return this.request(2, "GET", "%SYS/cspdebugid");
  }

  // v7+
  public async actionXMLExport(body: string[]): Promise<Atelier.Response<Atelier.Content<string[]>>> {
    return this.request(7, "POST", `${this.ns}/action/xml/export`, body);
  }

  // v7+
  public async actionXMLLoad(
    body: { file: string; content: string[]; selected?: string[] }[]
  ): Promise<Atelier.Response<Atelier.Content<{ file: string; imported: string[]; status: string }[]>>> {
    return this.request(7, "POST", `${this.ns}/action/xml/load`, body);
  }

  // v7+
  public async actionXMLList(
    body: { file: string; content: string[] }[]
  ): Promise<
    Atelier.Response<Atelier.Content<{ file: string; documents: { name: string; ts: string }[]; status: string }[]>>
  > {
    return this.request(7, "POST", `${this.ns}/action/xml/list`, body);
  }
}
