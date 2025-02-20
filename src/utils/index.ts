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
} from "../extension";
import { getCategory } from "../commands/export";
import { isCSP, isfsDocumentName } from "../providers/FileSystemProvider/FileSystemProvider";
import { AtelierAPI } from "../api";

export const outputChannel = vscode.window.createOutputChannel("ObjectScript", "vscode-objectscript-output");

/**
 * A map of all CSP web apps in a server-namespace.
 * The key is either `serverName:ns`, or `host:port/pathPrefix:ns`, lowercase.
 * The value is an array of CSP apps as returned by GET %25SYS/cspapps.
 */
export const cspApps: Map<string, string[]> = new Map();

/**
 * A map of all Studio Abstract Document extensions in a server-namespace.
 * The key is either `serverName:ns`, or `host:port/pathPrefix:ns`, lowercase.
 * The value is lowercase array of file extensions, without the dot.
 */
export const otherDocExts: Map<string, string[]> = new Map();

/**
 * The URI strings for all documents that are open in a custom editor.
 */
export const openCustomEditors: string[] = [];

/**
 * Array of stringified `Uri`s that have been exported.
 * Used by the documentIndex to determine if a created/changed
 * file needs to be synced with the server. If the documentIndex
 * finds a match in this array, the element is then removed.
 */
export const exportedUris: string[] = [];

/**
 * Return a string represenattion of `error`.
 * If `error` is `undefined`, returns the empty string.
 */
export function stringifyError(error): string {
  try {
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
  name: string;
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
  return (
    cspApps.get(
      (api.config.serverName && api.config.serverName != ""
        ? `${api.config.serverName}:${api.config.ns}`
        : `${api.config.host}:${api.config.port}${api.config.pathPrefix}:${api.config.ns}`
      ).toLowerCase()
    ) ?? []
  );
}

/**
 * Get a list of Studio Abstract Document extensions in the server-namespace that `uri` is connected to.
 */
function otherDocExtsForUri(uri: vscode.Uri): string[] {
  const api = new AtelierAPI(uri);
  return otherDocExts.get(`${api.serverId}:${api.config.ns}`.toLowerCase()) ?? [];
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
    !isClassOrRtn(uri) &&
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
    !isClassOrRtn(document.uri) &&
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
    if (notIsfs(uri)) {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      // Active document might not be from any folder in the workspace (e.g. user's settings.json)
      if (folder) {
        result.configName = folder.name;
        result.apiTarget = result.configName;
      }
    } else if (schemas.includes(uri.scheme)) {
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
  if (notIsfs(uri)) {
    if (vscode.workspace.getWorkspaceFolder(uri)) {
      return vscode.workspace.getWorkspaceFolder(uri).name;
    }
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
  ).uri;
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
): Promise<{ port: number; docker: boolean; service?: string }> {
  // When running remotely, behave as if there is no docker-compose object within objectscript.conn
  if (extensionContext.extension.extensionKind === vscode.ExtensionKind.Workspace) {
    return { docker: false, port: null };
  }

  // Seek a valid docker-compose object within objectscript.conn
  const { "docker-compose": dockerCompose = {} } = config("conn", workspaceFolderName);
  const { service, file = "docker-compose.yml", internalPort = 52773, envFile } = dockerCompose;
  if (!internalPort || !file || !service || service === "") {
    return { docker: false, port: null };
  }

  const result = { port: null, docker: true, service };
  const workspaceFolder = uriOfWorkspaceFolder(workspaceFolderName);
  if (!workspaceFolder) {
    // No workspace folders are open
    return { docker: false, port: null };
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
          reject(`Port ${internalPort} not published for service '${service}' in '${path.join(cwd, file)}'.`);
        }
        resolve({ port: parseInt(port, 10), docker: true, service });
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
}

const wsServerRootFolders = new Map<string, WSServerRootFolderData>();

/**
 * Add uri to the wsServerRootFolders map if eligible
 */
export async function addWsServerRootFolderData(uri: vscode.Uri): Promise<void> {
  if (!schemas.includes(uri.scheme)) {
    return;
  }
  const value: WSServerRootFolderData = {
    redirectDotvscode: true,
  };
  if (isCSP(uri) && !["", "/"].includes(uri.path)) {
    // A CSP-type root folder for a specific webapp that already has a .vscode/settings.json file must not redirect .vscode/* references
    const api = new AtelierAPI(uri);
    api
      .headDoc(`${uri.path}${!uri.path.endsWith("/") ? "/" : ""}.vscode/settings.json`)
      .then(() => {
        value.redirectDotvscode = false;
      })
      .catch(() => {});
  }
  wsServerRootFolders.set(uri.toString(), value);
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
 * @throws if `ns` queryparam is missing but required.
 */
export function redirectDotvscodeRoot(uri: vscode.Uri): vscode.Uri {
  if (!schemas.includes(uri.scheme)) {
    return uri;
  }
  const dotMatch = uri.path.match(/^(.*)\/\.vscode(\/.*)?$/);
  if (dotMatch) {
    const dotvscodeRoot = uri.with({ path: dotMatch[1] || "/" });
    if (!wsServerRootFolders.get(dotvscodeRoot.toString())?.redirectDotvscode) {
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

/** Returns `true` if `uri1` is a parent of `uri2`. */
export function uriIsParentOf(uri1: vscode.Uri, uri2: vscode.Uri): boolean {
  uri1 = uri1.with({ path: !uri1.path.endsWith("/") ? `${uri1.path}/` : uri1.path });
  return (
    uri2
      .with({ query: "", fragment: "" })
      .toString()
      .startsWith(uri1.with({ query: "", fragment: "" }).toString()) &&
    uri1.query == uri2.query &&
    uri1.fragment == uri2.fragment
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
export function isClassOrRtn(uriOrName: vscode.Uri | string): boolean {
  return ["cls", "mac", "int", "inc"].includes(
    (uriOrName instanceof vscode.Uri ? uriOrName.path : uriOrName).split(".").pop().toLowerCase()
  );
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
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true,
      title: "Pick a server connection from the current workspace",
    })
    .then((c) => c?.uri ?? null);
}

/** Convert `query` to a fuzzy LIKE compatible pattern */
export function queryToFuzzyLike(query: string): string {
  let p = "%";
  for (const c of query.toLowerCase()) p += `${["_", "%", "\\"].includes(c) ? "\\" : ""}${c}%`;
  return p;
}

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
