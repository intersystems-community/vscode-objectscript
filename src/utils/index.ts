import path = require("path");
import { exec } from "child_process";
import * as vscode from "vscode";
import { lt } from "semver";
import {
  config,
  schemas,
  workspaceState,
  terminals,
  extensionContext,
  lsExtensionId,
  OBJECTSCRIPT_FILE_SCHEMA,
  documentContentProvider,
  filesystemSchemas,
  outputLangId,
  OBJECTSCRIPTXML_FILE_SCHEMA,
} from "../extension";
import { getCategory } from "../commands/export";
import { isCSP, isfsDocumentName } from "../providers/FileSystemProvider/FileSystemProvider";
import { AtelierAPI } from "../api";

export const outputChannel = vscode.window.createOutputChannel("ObjectScript", outputLangId);

/**
 * A map of all CSP web apps in a server-namespace.
 * The key is `host:port/pathPrefix[ns]`, lowercase.
 * The value is an array of CSP apps as returned by GET %25SYS/cspapps.
 */
export const cspApps: Map<string, string[]> = new Map();

/**
 * A map of all Studio Abstract Document extensions in a server-namespace.
 * The key is `host:port/pathPrefix[ns]`, lowercase.
 * The value is lowercase array of file extensions, without the dot.
 */
export const otherDocExts: Map<string, string[]> = new Map();

/**
 * The URI strings for all documents that are open in a low-code editor.
 */
export const openLowCodeEditors: Set<string> = new Set();

/**
 * Set of stringified `Uri`s that have been exported.
 * Used by the documentIndex to determine if a created/changed
 * file needs to be synced with the server. If the documentIndex
 * finds a match in this set, the element is then removed.
 */
export const exportedUris: Set<string> = new Set();

/** Validates routine labels and unquoted class member names */
export const identifierRegex = /^(?:%|\p{L})[\p{L}\d]*$/u;

/**
 * Return a string representation of `error`.
 * If `error` is `undefined`, returns the empty string.
 */
export function stringifyError(error): string {
  try {
    if (Array.isArray(error?.errors)) {
      // Need to stringify the inner errors of an AggregateError
      const errs = error.errors.map(stringifyError).filter((s) => s != "");
      return errs.length ? `AggregateError:\n- ${errs.join("\n- ")}` : "";
    }
    return (
      error == undefined
        ? ""
        : error.errorText
          ? <string>error.errorText
          : typeof error == "string"
            ? error
            : error instanceof Error
              ? error.toString()
              : JSON.stringify(error)
    ).trim();
  } catch {
    // Need to catch errors from JSON.stringify()
    return "";
  }
}

/** The last error string written to the Output channel */
let lastErrorStr = "";

/**
 * Stringify `error` and append it to the Output channel, followed by line feed character.
 * Doesn't append `error` if it's a duplicate of the last error appended, or if it's
 * stringified value is the empty string. If `message` is defined, calls
 * `vscode.window.showErrorMessage()` with that message plus a reminder to check
 * the Output channel, if an error was appended to it.
 */
export function handleError(error, message?: string): void {
  if (!error) return;
  const errorStr = stringifyError(error);
  if (errorStr.length) {
    if (errorStr != lastErrorStr) {
      lastErrorStr = errorStr;
      outputChannel.appendLine(errorStr);
    }
    outputChannel.show(true);
    if (message) message += " Check the 'ObjectScript' Output channel for details.";
  }
  if (message) vscode.window.showErrorMessage(message, "Dismiss");
}

export function outputConsole(data: string[]): void {
  data.forEach((line): void => {
    outputChannel.appendLine(line);
  });
}

export interface CurrentFile {
  /** The name of the document, like `User.Test.cls` */
  name: string;
  /** `uri.fsPath` */
  fileName: string;
  uri: vscode.Uri;
  unredirectedUri?: vscode.Uri;
  workspaceFolder: string;
  uniqueId: string;
}

export interface CurrentTextFile extends CurrentFile {
  content: string;
  eol: vscode.EndOfLine;
}

export interface CurrentBinaryFile extends CurrentFile {
  content: Buffer;
}

/**
 * For workspace roots in the local filesystem, configName is the root's name
 * which defaults to the folder name, and apiTarget is the same.
 * For isfs roots, configName is the uri.authority (i.e. isfs://this-bit/...)
 * which is normally the server name as looked up in intersystems.servers, and
 * apiTarget is the uri.
 */
export interface ConnectionTarget {
  apiTarget: string | vscode.Uri;
  configName: string;
}

/** Get a list of all CSP web apps in the server-namespace that `uri` is connected to. */
export function cspAppsForUri(uri: vscode.Uri): string[] {
  return cspAppsForApi(new AtelierAPI(uri));
}

/** Get a list of all CSP web apps in the server-namespace that `api` is connected to. */
export function cspAppsForApi(api: AtelierAPI): string[] {
  const { host, port, pathPrefix, ns } = api.config;
  return cspApps.get(`${host}:${port}${pathPrefix}[${ns}]`.toLowerCase()) ?? [];
}

/**
 * Get a list of Studio Abstract Document extensions in the server-namespace that `uri` is connected to.
 */
function otherDocExtsForUri(uri: vscode.Uri): string[] {
  const api = new AtelierAPI(uri);
  const { host, port, pathPrefix, ns } = api.config;
  return otherDocExts.get(`${host}:${port}${pathPrefix}[${ns}]`.toLowerCase()) ?? [];
}

/** Determine the server name of a non-`isfs` non-ObjectScript file (any file that's not CLS,MAC,INT,INC). */
export function getServerDocName(uri: vscode.Uri): string {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!wsFolder) return;
  const cspIdx = uri.path.lastIndexOf(cspAppsForUri(uri).find((cspApp) => uri.path.includes(cspApp + "/")));
  if (cspIdx != -1) {
    return uri.path.slice(cspIdx);
  } else if (uri.path.toLowerCase().endsWith(".dfi")) {
    // Determine the file path relative to the workspace folder path
    const wsPath = wsFolder.uri.path + wsFolder.uri.path.endsWith("/") ? "" : "/";
    const relativeFilePath = uri.path.startsWith(wsPath) ? uri.path.slice(wsPath.length) : "";
    if (relativeFilePath == "") return;
    // Check for matching export settings first. If no match, use base name.
    const config = vscode.workspace.getConfiguration("objectscript.export", uri);
    const folder: string = config.get("folder");
    const addCategory: boolean = config.get("addCategory");
    let root = [
      typeof folder == "string" && folder.length ? folder : null,
      addCategory ? getCategory(uri.fsPath, addCategory) : null,
    ]
      .filter(notNull)
      .join("/")
      .replace(/\\/g, "/");
    if (!root.endsWith("/")) root += "/";
    if (relativeFilePath.startsWith(root)) {
      // Convert any folders into "-"
      return relativeFilePath.slice(root.length).replace(/\//g, "-");
    } else {
      // Use the last part of the path since it didn't match the export settings
      return uri.path.split("/").pop();
    }
  } else {
    // Use the last part of the path without checking the export settings
    return uri.path.split("/").pop();
  }
}

/**
 * Determine if this non-ObjectScript local file is importable.
 * @param uri The file to check.
 */
export function isImportableLocalFile(uri: vscode.Uri): boolean {
  // A non-class or routine file is only importable
  // if it's in a web application folder or it's a
  // known Studio abstract document type within a workspace folder
  if (!vscode.workspace.getWorkspaceFolder(uri)) return false;
  return (
    cspAppsForUri(uri).some((cspApp) => uri.path.includes(cspApp + "/")) ||
    otherDocExtsForUri(uri).includes(uri.path.split(".").pop().toLowerCase())
  );
}

/** A regex for extracting the name of a class from its content */
export const classNameRegex = /^[ \t]*Class[ \t]+(%?[\p{L}\d\u{100}-\u{ffff}]+(?:\.[\p{L}\d\u{100}-\u{ffff}]+)+)/imu;

/** A regex for extracting the name and type of a routine from its content */
export const routineNameTypeRegex = /^ROUTINE ([^\s]+)(?:\s*\[\s*Type\s*=\s*\b([a-z]{3})\b)?/i;

export function currentFileFromContent(uri: vscode.Uri, content: string | Buffer): CurrentTextFile | CurrentBinaryFile {
  const fileName = uri.fsPath;
  const workspaceFolder = workspaceFolderOfUri(uri);
  if (!workspaceFolder) {
    // No workspace folders are open
    return null;
  }
  const fileExt = fileName.split(".").pop().toLowerCase();
  if (
    notIsfs(uri) &&
    !isClassOrRtn(uri.path) &&
    // This is a non-class or routine local file, so check if we can import it
    !isImportableLocalFile(uri)
  ) {
    return null;
  }
  let name = "";
  let ext = "";
  if (fileExt === "cls" && typeof content === "string") {
    // Allow Unicode letters
    const match = content.match(classNameRegex);
    if (match) {
      [, name, ext = "cls"] = match;
    }
  } else if (fileExt.match(/(mac|int|inc)/i) && typeof content === "string") {
    const match = content.match(routineNameTypeRegex);
    if (match) {
      [, name, ext = "mac"] = match;
    }
  } else {
    name = notIsfs(uri) ? getServerDocName(uri) : isfsDocumentName(uri);
  }
  if (!name) {
    return null;
  }
  name += ext ? "." + ext.toLowerCase() : "";

  if (typeof content === "string") {
    const firstLF = content.indexOf("\n");
    return {
      content,
      fileName,
      uri,
      workspaceFolder,
      name,
      uniqueId: `${workspaceFolder}:${name}`,
      eol: firstLF > 0 && content[firstLF - 1] === "\r" ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF,
    };
  } else {
    return {
      content,
      fileName,
      uri,
      workspaceFolder,
      name,
      uniqueId: `${workspaceFolder}:${name}`,
    };
  }
}

export function currentFile(document?: vscode.TextDocument): CurrentTextFile {
  document =
    document ||
    (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document
      ? vscode.window.activeTextEditor.document
      : null);
  if (!document) {
    return null;
  }
  const fileName = document.fileName;
  const fileExt = fileName.split(".").pop().toLowerCase();
  if (
    notIsfs(document.uri) &&
    !isClassOrRtn(document.uri.path) &&
    // This is a non-class or routine local file, so check if we can import it
    !isImportableLocalFile(document.uri)
  ) {
    return null;
  }
  const eol = document.eol || vscode.EndOfLine.LF;
  const uri = redirectDotvscodeRoot(document.uri);
  const content = document.getText();
  let name = "";
  let ext = "";
  if (fileExt === "cls") {
    // Allow Unicode letters
    const match = content.match(classNameRegex);
    if (match) {
      [, name, ext = "cls"] = match;
    }
  } else if (fileExt.match(/(mac|int|inc)/i)) {
    const match = content.match(routineNameTypeRegex);
    if (match) {
      [, name, ext = "mac"] = match;
    }
  } else {
    name = notIsfs(uri) ? getServerDocName(uri) : isfsDocumentName(uri);
  }
  if (!name) {
    return null;
  }
  name += ext ? "." + ext.toLowerCase() : "";
  const workspaceFolder = currentWorkspaceFolder(document);
  const uniqueId = `${workspaceFolder}:${name}`;

  return {
    content,
    fileName,
    name,
    uri,
    unredirectedUri: document.uri,
    eol,
    workspaceFolder,
    uniqueId,
  };
}

export function connectionTarget(uri?: vscode.Uri): ConnectionTarget {
  const result: ConnectionTarget = { apiTarget: "", configName: "" };
  uri = uri
    ? uri
    : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document
      ? vscode.window.activeTextEditor.document.uri
      : undefined;
  if (uri) {
    if (uri.scheme == OBJECTSCRIPT_FILE_SCHEMA) {
      // For objectscript:// files the authority is the workspace folder name
      result.apiTarget = uri;
      result.configName = uri.authority;
    } else if (notIsfs(uri)) {
      const folder = vscode.workspace.getWorkspaceFolder(
        // For XML preview files the fragment contains the URI for connection purposes
        uri.scheme == OBJECTSCRIPTXML_FILE_SCHEMA ? vscode.Uri.parse(uri.fragment) : uri
      );
      // Active document might not be from any folder in the workspace (e.g. user's settings.json)
      if (folder) {
        result.configName = folder.name;
        result.apiTarget = result.configName;
      }
    } else {
      result.apiTarget = uri;
      const parts = uri.authority.split(":");
      result.configName = parts.length === 2 ? parts[0] : uri.authority;
    }
  }

  // Fall back to the connection for the first folder in the workspace
  if (result.apiTarget === "") {
    const firstFolder =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
        ? vscode.workspace.workspaceFolders[0]
        : undefined;
    if (firstFolder && schemas.includes(firstFolder.uri.scheme)) {
      const parts = firstFolder.uri.authority.split(":");
      result.configName = parts.length === 2 ? parts[0] : firstFolder.uri.authority;
      result.apiTarget = firstFolder.uri;
    } else {
      result.configName = workspaceState.get<string>("workspaceFolder") || firstFolder ? firstFolder.name : "";
      result.apiTarget = result.configName;
    }
  }

  return result;
}

export function currentWorkspaceFolder(document?: vscode.TextDocument): string {
  document = document ? document : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (document) {
    const folder = workspaceFolderOfUri(document.uri);
    // document might not be part of the workspace (e.g. the XXX.code-workspace JSON file)
    if (folder) {
      return folder;
    } else {
      return "";
    }
  }
  const firstFolder =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
      ? vscode.workspace.workspaceFolders[0]
      : undefined;
  if (firstFolder && schemas.includes(firstFolder.uri.scheme)) {
    return firstFolder.uri.authority;
  } else {
    return workspaceState.get<string>("workspaceFolder") || firstFolder ? firstFolder.name : "";
  }
}

export function workspaceFolderOfUri(uri: vscode.Uri): string {
  if (uri.scheme == OBJECTSCRIPT_FILE_SCHEMA) {
    // For objectscript:// files the authority is the workspace folder name
    return uri.authority;
  } else if (uri.scheme == OBJECTSCRIPTXML_FILE_SCHEMA) {
    // For XML preview files the fragment contains the URI of the original XML file
    return vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(uri.fragment))?.name ?? "";
  } else if (notIsfs(uri)) {
    return vscode.workspace.getWorkspaceFolder(uri)?.name ?? "";
  } else {
    const rootUri = uri.with({ path: "/" }).toString();
    const foundFolder = vscode.workspace.workspaceFolders.find(
      (workspaceFolder) => workspaceFolder.uri.toString() == rootUri
    );
    return foundFolder ? foundFolder.name : uri.authority;
  }
  return "";
}

export function uriOfWorkspaceFolder(workspaceFolder: string = currentWorkspaceFolder()): vscode.Uri | undefined {
  if (!workspaceFolder || !vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length == 0) {
    // There are no workspace folders open
    return undefined;
  }
  return (
    vscode.workspace.workspaceFolders.find((el): boolean => el.name.toLowerCase() === workspaceFolder.toLowerCase()) ||
    vscode.workspace.workspaceFolders.find((el): boolean => el.uri.authority == workspaceFolder)
  )?.uri;
}

export function onlyUnique(value: { name: string }, index: number, self: { name: string }[]): boolean {
  if (value && value.name) {
    return self.findIndex((el): boolean => el.name === value.name) === index;
  }
  return self.indexOf(value) === index;
}

export function notNull(el: any): boolean {
  return el !== null;
}

/** Determine the compose command to use (`docker-compose` or `docker compose`).  */
async function composeCommand(cwd?: string): Promise<string> {
  return new Promise<string>((resolve) => {
    let cmd = "docker compose";
    exec(`${cmd} version`, { cwd }, (error) => {
      if (error) {
        // 'docker compose' is not present, so default to 'docker-compose'
        cmd = "docker-compose";
      }
      resolve(cmd);
    });
  });
}

export async function portFromDockerCompose(
  workspaceFolderName?: string
): Promise<{ port: number | null; superserverPort: number | null; docker: boolean; service?: string }> {
  // When running remotely, behave as if there is no docker-compose object within objectscript.conn
  if (extensionContext.extension.extensionKind === vscode.ExtensionKind.Workspace) {
    return { docker: false, port: null, superserverPort: null };
  }

  // Seek a valid docker-compose object within objectscript.conn
  const { "docker-compose": dockerCompose = {} } = config("conn", workspaceFolderName);
  const {
    service,
    file = "docker-compose.yml",
    internalPort = 52773,
    internalSuperserverPort = 1972,
    envFile,
  } = dockerCompose;
  if (!internalPort || !internalSuperserverPort || !file || !service || service === "") {
    return { docker: false, port: null, superserverPort: null };
  }

  const result = { port: null, superserverPort: null, docker: true, service };
  const workspaceFolder = uriOfWorkspaceFolder(workspaceFolderName);
  if (!workspaceFolder) {
    // No workspace folders are open
    return { docker: false, port: null, superserverPort: null };
  }
  const workspaceFolderPath = workspaceFolder.fsPath;
  const workspaceRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

  const cwd: string = await fileExists(vscode.Uri.file(path.join(workspaceFolderPath, file))).then(async (exists) => {
    if (exists) {
      return workspaceFolderPath;
    }
    if (workspaceFolderPath !== workspaceRootPath) {
      exists = await fileExists(vscode.Uri.file(path.join(workspaceRootPath, file)));
      if (exists) {
        return workspaceRootPath;
      }
      throw new Error(`File '${file}' not found in ${workspaceFolderPath} or ${workspaceRootPath}.`);
    }
    throw new Error(`File '${file}' not found in ${workspaceFolderPath}.`);
  });

  if (!cwd) {
    return result;
  }

  const envFileParam = envFile ? `--env-file ${envFile}` : "";
  const cmd = `${await composeCommand(cwd)} -f ${file} ${envFileParam} `;

  return new Promise((resolve, reject) => {
    exec(`${cmd} ps --services --filter status=running`, { cwd }, (error, stdout) => {
      if (error) {
        reject(error.message);
      }
      if (!stdout.replaceAll("\r", "").split("\n").includes(service)) {
        reject(`Service '${service}' not found in '${path.join(cwd, file)}', or not running.`);
      }

      exec(`${cmd} port --protocol=tcp ${service} ${internalPort}`, { cwd }, (error, stdout) => {
        if (error) {
          reject(error.message);
        }
        const [, port] = stdout.match(/:(\d+)/) || [];
        if (!port) {
          reject(`Webserver port ${internalPort} not published for service '${service}' in '${path.join(cwd, file)}'.`);
        }
        result.port = parseInt(port, 10);

        exec(`${cmd} port --protocol=tcp ${service} ${internalSuperserverPort}`, { cwd }, (error, stdout) => {
          if (error) {
            // Not an error if we were merely looking for the default port and the container doesn't publish it
            if (!dockerCompose.internalSuperserverPort) {
              resolve(result);
            }
            reject(error.message);
          }
          const [, superserverPort] = stdout.match(/:(\d+)/) || [];
          if (!superserverPort) {
            reject(
              `Superserver port ${internalSuperserverPort} not published for service '${service}' in '${path.join(cwd, file)}'.`
            );
          }
          result.superserverPort = parseInt(superserverPort, 10);
          resolve(result);
        });
      });
    });
  });
}

export async function terminalWithDocker(): Promise<vscode.Terminal> {
  const { ns, "docker-compose": dockerCompose } = config("conn");
  const { service, file = "docker-compose.yml" } = dockerCompose;
  const workspace = currentWorkspaceFolder();

  const terminalName = `ObjectScript:${workspace}`;
  let terminal = terminals.find((t) => t.name == terminalName && t.exitStatus == undefined);
  if (!terminal) {
    let exe = await composeCommand();
    const argsArr: string[] = [];
    if (exe == "docker compose") {
      const exeSplit = exe.split(" ");
      exe = exeSplit[0];
      argsArr.push(exeSplit[1]);
    }
    terminal = vscode.window.createTerminal(
      terminalName,
      `${exe}${process.platform == "win32" ? ".exe" : ""}`,
      argsArr.concat([
        "-f",
        file,
        "exec",
        service,
        "/bin/bash",
        "-c",
        `[ -f /tmp/vscodesession.pid ] && kill $(cat /tmp/vscodesession.pid) >/dev/null 2>&1 ; echo $$ > /tmp/vscodesession.pid;
        $(command -v ccontrol || command -v iris) session $ISC_PACKAGE_INSTANCENAME -U ${ns}`,
      ])
    );
    terminals.push(terminal);
  }
  terminal.show(true);
  return terminal;
}

export async function shellWithDocker(): Promise<vscode.Terminal> {
  const { "docker-compose": dockerCompose } = config("conn");
  const { service, file = "docker-compose.yml" } = dockerCompose;
  const workspace = currentWorkspaceFolder();

  const terminalName = `Shell:${workspace}`;
  let terminal = terminals.find((t) => t.name == terminalName && t.exitStatus == undefined);
  if (!terminal) {
    let exe = await composeCommand();
    const argsArr: string[] = [];
    if (exe == "docker compose") {
      const exeSplit = exe.split(" ");
      exe = exeSplit[0];
      argsArr.push(exeSplit[1]);
    }
    terminal = vscode.window.createTerminal(
      terminalName,
      `${exe}${process.platform == "win32" ? ".exe" : ""}`,
      argsArr.concat(["-f", file, "exec", service, "/bin/bash"])
    );
    terminals.push(terminal);
  }
  terminal.show(true);
  return terminal;
}

interface WSServerRootFolderData {
  redirectDotvscode: boolean;
  canRedirectDotvscode: boolean;
}

const wsServerRootFolders = new Map<string, WSServerRootFolderData>();

/** Cache information about redirection of `.vscode` folder contents for server-side folders */
export async function addWsServerRootFolderData(wsFolders: readonly vscode.WorkspaceFolder[]): Promise<any> {
  if (!wsFolders?.length) return;
  return Promise.allSettled(
    wsFolders.map(async (wsFolder) => {
      if (notIsfs(wsFolder.uri)) return;
      const api = new AtelierAPI(wsFolder.uri);
      if (!api.active) return;
      const value: WSServerRootFolderData = {
        redirectDotvscode: true,
        canRedirectDotvscode: true,
      };
      if (isCSP(wsFolder.uri) && !["", "/"].includes(wsFolder.uri.path)) {
        // A CSP-type root folder for a specific webapp that already has a
        // .vscode/settings.json file must not redirect .vscode/* references
        await api
          .headDoc(`${wsFolder.uri.path}${!wsFolder.uri.path.endsWith("/") ? "/" : ""}.vscode/settings.json`)
          .then(() => {
            value.redirectDotvscode = false;
          })
          .catch(() => {});
      }
      if (value.redirectDotvscode) {
        // We must redirect .vscode Uris for this folder, so see
        // if the web app to do so is configured on the server
        const { host, port, pathPrefix } = api.config;
        const key = `${host}:${port}${pathPrefix}[%SYS]`.toLowerCase();
        let webApps = cspApps.get(key);
        if (!webApps) {
          webApps = await api
            .getCSPApps(false, "%SYS")
            .then((data) => data.result.content ?? [])
            .catch(() => []);
          cspApps.set(key, webApps);
        }
        value.canRedirectDotvscode = webApps.includes("/_vscode");
      }
      wsServerRootFolders.set(wsFolder.uri.toString(), value);
    })
  );
}

/**
 * Alter isfs-type uri.path of /.vscode/* files or subdirectories.
 * Rewrite `/.vscode/path/to/file` as `/_vscode/XYZ/path/to/file`
 *  where XYZ comes from the `ns` queryparam of uri.
 *  Also alter query to specify `ns=%SYS&csp=1`
 * Also handles the alternative syntax isfs://server:namespace/
 *  in which there is no ns queryparam
 * For both syntaxes the namespace folder name is uppercased
 *
 * @returns uri, altered if necessary.
 * @throws if `ns` queryparam is missing but required, or if redirection
 * is required but not supported by the server and `err` was passed.
 */
export function redirectDotvscodeRoot(uri: vscode.Uri, err?: vscode.FileSystemError): vscode.Uri {
  if (notIsfs(uri)) return uri;
  const dotMatch = uri.path.match(/^(.*)\/\.vscode(\/.*)?$/);
  if (dotMatch) {
    const dotvscodeRoot = uri.with({ path: dotMatch[1] || "/" });
    const rootData = wsServerRootFolders.get(dotvscodeRoot.toString());
    if (!rootData?.redirectDotvscode) {
      // Don't redirect .vscode Uris
      return uri;
    }
    if (!rootData?.canRedirectDotvscode) {
      // Need to redirect .vscode Uris, but the server doesn't support it.
      // Throw if the caller gave us something to throw.
      if (err) throw err;
      return uri;
    }
    let namespace: string;
    const andCSP = !isCSP(uri) ? "&csp" : "";
    const nsMatch = `&${uri.query}&`.match(/&ns=([^&]+)&/);
    if (nsMatch) {
      namespace = nsMatch[1].toUpperCase();
      const newQueryString = (("&" + uri.query).replace(`ns=${namespace}`, "ns=%SYS") + andCSP).slice(1);
      return uri.with({ path: `/_vscode/${namespace}${dotMatch[2] || ""}`, query: newQueryString });
    } else {
      const parts = uri.authority.split(":");
      if (parts.length === 2) {
        namespace = parts[1].toUpperCase();
        return uri.with({
          authority: `${parts[0]}:%SYS`,
          path: `/_vscode/${namespace}${dotMatch[2] || ""}`,
          query: uri.query + andCSP,
        });
      }
    }
    throw new Error("No namespace determined from uri");
  } else {
    return uri;
  }
}

/** Check if local `file` exists using vscode's `workspace.fs` FileSystem. */
export async function fileExists(file: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(file);
    return true;
  } catch {
    // Only error thown is "FileNotFound"
    return false;
  }
}

/** Check if class `cls` is Deployed in using server connection `api`. */
export async function isClassDeployed(cls: string, api: AtelierAPI): Promise<boolean> {
  const clsname = cls.slice(-4).toLowerCase() == ".cls" ? cls.slice(0, -4) : cls;
  return (
    api
      .actionQuery("SELECT Deployed FROM %Dictionary.ClassDefinition WHERE Name = ?", [clsname])
      .then((data) => data.result.content[0]?.Deployed > 0)
      // Query failure is probably due to a permissions error, so fall back to index
      .catch(() => api.actionIndex([`${clsname}.cls`]).then((data) => data.result.content[0].content?.depl ?? false))
  );
}

/** Strip quotes from class member `name` if present */
export function stripClassMemberNameQuotes(name: string): string {
  return name.charAt(0) == '"' && name.charAt(name.length - 1) == '"' ? name.slice(1, -1).replaceAll('""', '"') : name;
}

/** Add quotes to class member `name` if required */
export function quoteClassMemberName(name: string): string {
  return name[0] == '"' ? name : identifierRegex.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

const classKeywordDelimitedValuesRegex = /"([^"]*)"|{([^}]*)}|\(([^)]*)\)/g;
const languageRegex = /\[[^\]]*Language\s*=\s*([a-z]+)/i;
const privateRegex = /\[[^\]]*Private/i;

/**
 * Return information about the class member at `symbol` in `document`.
 * This only works for class members that include a curly-brace
 * portion. For example, a Query, ClassMethod or Trigger.
 * Returns `undefined` if the member definition was malformed.
 */
export function parseClassMemberDefinition(
  document: vscode.TextDocument,
  symbol: vscode.DocumentSymbol,
  symbolLine?: number
): { definition: string; defEndLine: number; language: string; isPrivate: boolean } {
  const languageServer: boolean = vscode.extensions.getExtension(lsExtensionId)?.isActive ?? false;
  if (symbolLine == undefined) {
    if (languageServer) {
      symbolLine = symbol.selectionRange.start.line;
    } else {
      // This extension's symbol provider doesn't have a range
      // that always maps to the first line of the member definition
      for (let l = symbol.range.start.line; l < document.lineCount; l++) {
        symbolLine = l;
        if (!document.lineAt(l).text.startsWith("///")) break;
      }
    }
  }
  let definition: string;
  let defEndLine: number;
  for (let defLine = symbolLine; defLine < document.lineCount; defLine++) {
    const line = document.lineAt(defLine);
    if (line.text.trimEnd().endsWith("{")) {
      definition = document.getText(
        new vscode.Range(languageServer ? symbol.selectionRange.start : symbol.range.start, line.range.end)
      );
      defEndLine = defLine;
      break;
    }
  }
  if (!definition) return;
  const definitionNoDelimitedValues = definition.replace(classKeywordDelimitedValuesRegex, "");
  const languageMatch = definitionNoDelimitedValues.match(languageRegex);
  const privateMatch = definitionNoDelimitedValues.match(privateRegex);
  return {
    definition,
    defEndLine,
    language: languageMatch && languageMatch[1] ? languageMatch[1].toLowerCase() : "objectscript",
    isPrivate: privateMatch != null,
  };
}

/** Returns `true` if `uri1` is equal to or an ancestor of `uri2`.
 *  Non-path components (e.g., scheme, fragment, and query) must be identical.
 */
export function uriStartsWith(uri1: vscode.Uri, uri2: vscode.Uri): boolean {
  return (
    uri1.with({ path: "" }).toString == uri2.with({ path: "" }).toString &&
    // uri2.path "properly" starts with uri1.path.
    uri2.path.startsWith(uri1.path) &&
    (uri1.path.endsWith("/") || ["", "/"].includes(uri2.path.slice(uri1.path.length, uri1.path.length + 1)))
  );
}

/** Get the text of file `uri`. Works for all file systems and the `objectscript` `DocumentContentProvider`. */
export async function getFileText(uri: vscode.Uri): Promise<string> {
  if (uri.scheme == OBJECTSCRIPT_FILE_SCHEMA) {
    return await documentContentProvider.provideTextDocumentContent(uri, new vscode.CancellationTokenSource().token);
  } else {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  }
}

/** Determine the exact line of `method` and `offset` within a class. If the line could be determined, it is returned one-indexed. */
export function methodOffsetToLine(
  members: vscode.DocumentSymbol[],
  fileText: string,
  method: string,
  offset = 0
): number | undefined {
  let line: number;
  const languageServer: boolean = vscode.extensions.getExtension(lsExtensionId)?.isActive ?? false;
  // Find the DocumentSymbol for this method
  let currentSymbol: vscode.DocumentSymbol;
  for (const symbol of members) {
    if (stripClassMemberNameQuotes(symbol.name) === method && symbol.detail.toLowerCase().includes("method")) {
      currentSymbol = symbol;
      break;
    }
  }
  if (currentSymbol !== undefined) {
    const fileTextLines = fileText.split(/\r?\n/);
    if (languageServer) {
      for (
        let methodlinenum = currentSymbol.selectionRange.start.line;
        methodlinenum <= currentSymbol.range.end.line;
        methodlinenum++
      ) {
        // Find the offset of this breakpoint in the method
        const methodlinetext: string = fileTextLines[methodlinenum].trim();
        if (methodlinetext.endsWith("{")) {
          // This is the last line of the method definition, so count from here
          line = methodlinenum + offset + 1;
          break;
        }
      }
    } else {
      line = currentSymbol.selectionRange.start.line + offset;
    }
  }
  return line;
}

/** Return `true` if this username signals unauthenticated access  */
export function isUnauthenticated(username: string): boolean {
  return username == undefined || username == "" || username.toLowerCase() == "unknownuser";
}

/** Returns `true` if `uri.scheme` is neither `isfs` nor `isfs-readonly` */
export function notIsfs(uri: vscode.Uri): boolean {
  return !filesystemSchemas.includes(uri.scheme);
}

/** Base64 encoding must be in chunk size multiple of 3 and within the server's potential 32K string limit */
export function base64EncodeContent(content: Buffer): string[] {
  // Output is 4 chars for each 3 input, so 24573/3*4 = 32764
  const chunkSize = 24573;
  let start = 0;
  const result = [];
  while (start < content.byteLength) {
    result.push(content.toString("base64", start, start + chunkSize));
    start += chunkSize;
  }
  return result;
}

/** Returns `true` if `uri` has a class or routine file extension */
export function isClassOrRtn(uriOrName: string): boolean {
  return ["cls", "mac", "int", "inc"].includes(uriOrName.split(".").pop().toLowerCase());
}

interface ConnQPItem extends vscode.QuickPickItem {
  uri: vscode.Uri;
  ns: string;
}

/**
 * Prompt the user to pick an active server connection that's used in this workspace.
 * Returns the uri of the workspace folder corresponding to the chosen connection.
 * If there is only one active server connection, it will be returned without prompting the user.
 *
 * @param minVersion Optional minimum server version to enforce, in semantic version form (20XX.Y.Z).
 * @returns `undefined` if there were no suitable server connections and `null` if the
 * user explicitly escaped from the QuickPick.
 */
export async function getWsServerConnection(minVersion?: string): Promise<vscode.Uri | null | undefined> {
  if (!vscode.workspace.workspaceFolders?.length) return;
  const conns: ConnQPItem[] = [];
  for (const wsFolder of vscode.workspace.workspaceFolders) {
    const api = new AtelierAPI(wsFolder.uri);
    if (!api.active) continue;
    const config = api.config;
    if (minVersion && lt(config.serverVersion, minVersion)) continue;
    const conn = {
      label: api.connInfo,
      description: isUnauthenticated(config.username) ? "Unauthenticated" : config.username,
      detail: `http${config.https ? "s" : ""}://${config.host}:${config.port}${config.pathPrefix}`,
      uri: wsFolder.uri,
      ns: api.ns,
    };
    if (!conns.some((c) => c.detail == conn.detail && c.description == conn.description && c.ns == conn.ns))
      conns.push(conn);
  }
  if (!conns.length) return;
  if (conns.length == 1) return conns[0].uri;
  return vscode.window
    .showQuickPick(conns, {
      canPickMany: false,
      matchOnDescription: true,
      matchOnDetail: true,
      title: "Pick a server connection from the current workspace",
    })
    .then((c) => c?.uri ?? null);
}

/**
 * Prompt the user to pick a workspace folder.
 * Returns the chosen `vscode.WorkspaceFolder` object.
 * If there is only one workspace folder, it will be returned without prompting the user.
 *
 * @param title An optional custom prompt title.
 * @param writableOnly If `true`, only allow the user to pick from writeable folders.
 * @param isfsOnly If `true`, only allow the user to pick from `isfs(-readonly)` folders.
 * @param notIsfsOnly If `true`, only allow the user to pick from non-`isfs(-readonly)` folders.
 * @param active If `true`, only allow the user to pick from folders with an active server connection.
 * @returns `undefined` if there were no workspace folders and `null` if the
 * user explicitly escaped from the QuickPick.
 */
export async function getWsFolder(
  title = "",
  writeableOnly = false,
  isfsOnly = false,
  notIsfsOnly = false,
  active = false
): Promise<vscode.WorkspaceFolder | null | undefined> {
  if (!vscode.workspace.workspaceFolders?.length) return;
  // Apply the filters
  const folders = vscode.workspace.workspaceFolders.filter(
    (f) =>
      (!writeableOnly || (writeableOnly && vscode.workspace.fs.isWritableFileSystem(f.uri.scheme))) &&
      (!isfsOnly || (isfsOnly && filesystemSchemas.includes(f.uri.scheme))) &&
      (!notIsfsOnly || (notIsfsOnly && notIsfs(f.uri))) &&
      (!active || (active && new AtelierAPI(f.uri).active))
  );
  if (!folders.length) return;
  if (folders.length == 1) return folders[0];
  return vscode.window
    .showQuickPick(
      folders.map((f) => {
        return { label: f.name, detail: displayableUri(f.uri), f };
      }),
      {
        canPickMany: false,
        matchOnDetail: true,
        title: title || "Pick a workspace folder",
      }
    )
    .then((i) => i?.f ?? null);
}

/** Convert `query` to a fuzzy LIKE compatible pattern */
export function queryToFuzzyLike(query: string): string {
  let p = "%";
  for (const c of query.toLowerCase()) p += `${["_", "%", "\\"].includes(c) ? "\\" : ""}${c}%`;
  return p;
}

let _lastUsedLocalUri: vscode.Uri;

/** Get or set the uri of last used local file for XML import/export or local file import from an `isfs(-readonly)` workspace folder  */
export function lastUsedLocalUri(newValue?: vscode.Uri): vscode.Uri {
  if (newValue) _lastUsedLocalUri = newValue;
  return _lastUsedLocalUri;
}

/**
 * Replace the contents `uri` with `content` using the `workspace.applyEdit()` API.
 * That API is used so the change fires "onWill" and "onDid" events.
 * Will overwrite the file if it exists and create the file if it doesn't.
 */
export async function replaceFile(uri: vscode.Uri, content: string | string[] | Buffer): Promise<void> {
  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.createFile(uri, {
    overwrite: true,
    contents: Buffer.isBuffer(content)
      ? content
      : new TextEncoder().encode(Array.isArray(content) ? content.join("\n") : content),
  });
  const success = await vscode.workspace.applyEdit(wsEdit);
  if (!success) throw `Failed to create or replace contents of file '${displayableUri(uri)}'`;
}

/** Show the compilation failure error message if required. */
export function compileErrorMsg(): void {
  vscode.window
    .showErrorMessage(
      "Compilation failed. Check 'ObjectScript' Output channel for details.",
      !vscode.window.visibleTextEditors.some((e) => e.document.languageId == outputLangId) ? "Show" : undefined,
      "Dismiss"
    )
    .then((action) => {
      if (action == "Show") {
        outputChannel.show(true);
      }
    });
}

/** Return a string containing the displayable form of `uri` */
export function displayableUri(uri: vscode.Uri): string {
  return uri.scheme == "file" ? uri.fsPath : uri.toString(true);
}

/** Return `true` if document `name` can be compiled */
export function isCompilable(name: string): boolean {
  // Exlcude web app files that are not CSP or CSR files
  return !(name.includes("/") && !["csp", "csr"].includes(name.split(".").pop().toLowerCase()));
}

/** CSS that is shared between multiple webviews. Most webview CSS was borrowed from https://github.com/vscode-elements/elements-lite. */
export const webviewCSS = `
.vscode-divider {
  background-color: var(--vscode-widget-border);
  border: 0;
  display: block;
  height: 1px;
  margin-bottom: 10px;
  margin-top: 10px;
}
div.code-block {
  background-color: var(--vscode-textCodeBlock-background);
  border-radius: 5px;
  font-family: monospace;
  white-space: pre;
  padding: 10px;
  padding-top: initial;
  overflow-x: scroll;
}
`;

class Semaphore {
  /** Queue of tasks waiting to acquire the semaphore */
  private _tasks: (() => void)[] = [];
  /** Current available slots in the semaphore */
  private _counter: number;

  constructor(maxConcurrent: number) {
    // Initialize the counter with the maximum number of concurrent tasks
    this._counter = maxConcurrent;
  }

  /** Acquire a slot in the semaphore */
  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this._counter > 0) {
        // If a slot is available, decrease the counter and resolve immediately
        this._counter--;
        resolve();
      } else {
        // If no slots are available, add the task to the queue
        this._tasks.push(resolve);
      }
    });
  }

  /** Release a slot in the semaphore */
  release(): void {
    if (this._tasks.length > 0) {
      // If there are tasks waiting, take the next task from the queue and run it
      const nextTask = this._tasks.shift();
      if (nextTask) nextTask();
    } else {
      // If no tasks are waiting, increase the counter
      this._counter++;
    }
  }
}

export class RateLimiter {
  private _semaphore: Semaphore;

  constructor(maxConcurrent: number) {
    // Initialize the semaphore with the maximum number of concurrent tasks
    this._semaphore = new Semaphore(maxConcurrent);
  }

  /** Execute a function with rate limiting */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    // Acquire a slot in the semaphore. Will not reject.
    await this._semaphore.acquire();
    try {
      // Execute the provided function
      return await fn();
    } finally {
      // Always release the slot in the semaphore after the function completes
      this._semaphore.release();
    }
  }
}
