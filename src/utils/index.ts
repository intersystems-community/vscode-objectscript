import path = require("path");
import { exec } from "child_process";
import * as vscode from "vscode";
import { config, schemas, workspaceState, terminals, extensionContext, cspApps } from "../extension";
import { getCategory } from "../commands/export";
import { isCSPFile } from "../providers/FileSystemProvider/FileSystemProvider";
import { AtelierAPI } from "../api";

let latestErrorMessage = "";
export const outputChannel: {
  resetError?(): void;
  appendError?(value: string, show?: boolean): void;
} & vscode.OutputChannel = vscode.window.createOutputChannel("ObjectScript", "vscode-objectscript-output");

/// Append Error if no duplicates previous one
outputChannel.appendError = (value: string, show = true): void => {
  if (latestErrorMessage === value) {
    return;
  }
  latestErrorMessage = value;
  outputChannel.appendLine(value);
  show && outputChannel.show(true);
};
outputChannel.resetError = (): void => {
  latestErrorMessage = "";
};

export function outputConsole(data: string[]): void {
  data.forEach((line): void => {
    outputChannel.appendLine(line);
  });
}

// tslint:disable-next-line: interface-name
export interface CurrentFile {
  name: string;
  fileName: string;
  content: string;
  uri: vscode.Uri;
  eol: vscode.EndOfLine;
  workspaceFolder: string;
  uniqueId: string;
}

// For workspace roots in the local filesystem, configName is the root's name
//  which defaults to the folder name, and apiTarget is the same.
// For isfs roots, configName is the uri.authority (i.e. isfs://this-bit/...)
//  which is normally the server name as looked up in intersystems.servers, and
//  apiTarget is the uri.
export interface ConnectionTarget {
  apiTarget: string | vscode.Uri;
  configName: string;
}

/**
 * Get a list of all CSP web apps in the server-namespace that `uri` is connected to.
 */
export function cspAppsForUri(uri: vscode.Uri): string[] {
  const api = new AtelierAPI(uri);
  const key = (
    api.config.serverName && api.config.serverName != ""
      ? `${api.config.serverName}:${api.config.ns}`
      : `${api.config.host}:${api.config.port}${api.config.pathPrefix}:${api.config.ns}`
  ).toLowerCase();
  return cspApps.get(key) ?? [];
}

/**
 * Determine the server name of a local non-ObjectScript file (any file that's not CLS,MAC,INT,INC).
 * @param localPath The full path to the file on disk.
 * @param workspace The workspace the file is in.
 * @param fileExt The extension of the file.
 */
function getServerDocName(localPath: string, workspace: string, fileExt: string): string {
  if (!workspace) {
    // No workspace folders are open
    return null;
  }
  const workspacePath = uriOfWorkspaceFolder(workspace).fsPath;
  const filePathNoWorkspaceArr = localPath.replace(workspacePath + path.sep, "").split(path.sep);
  const uri = vscode.Uri.file(localPath);
  const cspIdx = uri.path.indexOf(cspAppsForUri(uri).find((cspApp) => uri.path.includes(cspApp + "/")));
  if (cspIdx != -1) {
    return uri.path.slice(cspIdx);
  } else {
    const { atelier, folder, addCategory } = config("export", workspace);
    const root = [
      typeof folder === "string" && folder.length ? folder : null,
      addCategory ? getCategory(localPath, addCategory) : null,
    ]
      .filter(notNull)
      .join(path.sep);
    let filePath = filePathNoWorkspaceArr.join(path.sep).slice(root.length + path.sep.length);
    if (fileExt == "dfi" && atelier) {
      filePath = filePath.replaceAll(path.sep, "-");
    }
    return filePath;
  }
}

/**
 * Determine if this non-ObjectScript local file is importable
 * (i.e. is part of a CSP application or matches our export settings).
 * @param file The file to check.
 */
export function isImportableLocalFile(file: vscode.TextDocument): boolean {
  const workspace = currentWorkspaceFolder(file);
  if (workspace == "") {
    // No workspace folders are open
    return false;
  }
  const workspacePath = uriOfWorkspaceFolder(workspace).fsPath;
  const filePathNoWorkspaceArr = file.fileName.replace(workspacePath + path.sep, "").split(path.sep);
  const isCSP = cspAppsForUri(file.uri).findIndex((cspApp) => file.uri.path.includes(cspApp + "/")) != -1;
  if (isCSP) {
    return true;
  } else {
    // Check if this file matches our export settings
    const { atelier, folder, addCategory } = config("export", workspace);
    const expectedRoot = [
      typeof folder === "string" && folder.length ? folder : null,
      addCategory ? getCategory(file.fileName, addCategory) : null,
    ]
      .filter(notNull)
      .join(path.sep);
    let filePath = filePathNoWorkspaceArr.join(path.sep);
    if (filePath.startsWith(expectedRoot)) {
      filePath = filePath.slice(expectedRoot.length + path.sep.length);
      if (file.uri.path.toLowerCase().endsWith(".dfi")) {
        // DFI files can be split using the atelier setting
        if ((atelier && !filePath.includes("-")) || !atelier) {
          return true;
        }
      } else {
        // Non-CSP or DFI files cannot be in subdirectories
        return !filePath.includes(path.sep);
      }
    }
    return false;
  }
}

export function currentFileFromContent(uri: vscode.Uri, content: string): CurrentFile {
  const fileName = uri.fsPath;
  const workspaceFolder = workspaceFolderOfUri(uri);
  if (!workspaceFolder) {
    // No workspace folders are open
    return null;
  }
  const fileExt = fileName.split(".").pop().toLowerCase();
  let name = "";
  let ext = "";
  if (fileExt === "cls") {
    // Allow Unicode letters
    const match = content.match(/^[ \t]*Class[ \t]+(%?[\p{L}\d]+(?:\.[\p{L}\d]+)+)/imu);
    if (match) {
      [, name, ext = "cls"] = match;
    }
  } else if (fileExt.match(/(mac|int|inc)/i)) {
    const match = content.match(/^ROUTINE ([^\s]+)(?:\s*\[\s*Type\s*=\s*\b([a-z]{3})\b)?/i);
    if (match) {
      [, name, ext = "mac"] = match;
    } else {
      [name, ext = "mac"] = path.basename(fileName).split(".");
    }
  } else {
    name = getServerDocName(fileName, workspaceFolder, fileExt);
    // Need to strip leading / for custom Studio documents which should not be treated as files.
    // e.g. For a custom Studio document Test.ZPM, the variable name would be /Test.ZPM which is
    // not the document name. The document name is Test.ZPM so requests made to the Atelier APIs
    // using the name with the leading / would fail to find the document.
    if (name.charAt(0) === "/") {
      name = name.slice(1);
    }
  }
  if (!name) {
    return null;
  }
  name += ext ? "." + ext.toLowerCase() : "";
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
}

export function currentFile(document?: vscode.TextDocument): CurrentFile {
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
    !schemas.includes(document.uri.scheme) &&
    (!document ||
      !document.fileName ||
      !document.languageId ||
      !document.languageId.startsWith("objectscript") ||
      document.languageId === "objectscript-output")
  ) {
    // This is a non-InterSystems local file, so check if we can import it
    if (!isImportableLocalFile(document)) {
      return null;
    }
  }
  const eol = document.eol || vscode.EndOfLine.LF;
  const uri = redirectDotvscodeRoot(document.uri);
  const content = document.getText();
  let name = "";
  let ext = "";
  const params = new URLSearchParams(uri.query);
  const csp = params.has("csp") && ["", "1"].includes(params.get("csp"));
  if (csp) {
    name = uri.path;
  } else if (fileExt === "cls") {
    // Allow Unicode letters
    const match = content.match(/^[ \t]*Class[ \t]+(%?[\p{L}\d]+(?:\.[\p{L}\d]+)+)/imu);
    if (match) {
      [, name, ext = "cls"] = match;
    }
  } else if (fileExt.match(/(mac|int|inc)/i)) {
    const match = content.match(/^ROUTINE ([^\s]+)(?:\s*\[\s*Type\s*=\s*\b([a-z]{3})\b)?/i);
    if (match) {
      [, name, ext = "mac"] = match;
    } else {
      [name, ext = "mac"] = path.basename(document.fileName).split(".");
    }
  } else {
    if (document.uri.scheme === "file") {
      if (fileExt.match(/(csp|csr)/i) && !isImportableLocalFile(document)) {
        // This is a csp or csr file that's not in a csp directory
        return null;
      }
      name = getServerDocName(fileName, currentWorkspaceFolder(document), fileExt);
    } else {
      name = fileName;
    }
    // Need to strip leading / for custom Studio documents which should not be treated as files.
    // e.g. For a custom Studio document Test.ZPM, the variable name would be /Test.ZPM which is
    // not the document name. The document name is Test.ZPM so requests made to the Atelier APIs
    // using the name with the leading / would fail to find the document.
    if (name.charAt(0) === "/") {
      name = name.slice(1);
    }
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
    if (uri.scheme === "file") {
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

/**
 * Given a URI, returns a server name for it if it is under isfs[-readonly] or null if it is not an isfs file.
 * @param uri URI to evaluate
 */
export function getServerName(uri: vscode.Uri): string {
  if (!schemas.includes(uri.scheme)) {
    return null;
  }
  if (isCSPFile(uri)) {
    // The full file path is the server name of the file.
    return uri.path;
  } else {
    // Complex case: replace folder slashes with dots.
    const filePath = uri.path.slice(1);
    let serverName = filePath.replace(/\//g, ".");
    if (!filePath.split("/").pop().includes(".")) {
      // This is a package so add the .PKG extension
      serverName += ".PKG";
    }
    return serverName;
  }
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
  if (uri.scheme === "file") {
    if (vscode.workspace.getWorkspaceFolder(uri)) {
      return vscode.workspace.getWorkspaceFolder(uri).name;
    }
  } else if (schemas.includes(uri.scheme)) {
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

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function notNull(el: any): boolean {
  return el !== null;
}

export async function portFromDockerCompose(): Promise<{ port: number; docker: boolean; service?: string }> {
  // When running remotely, behave as if there is no docker-compose object within objectscript.conn
  if (extensionContext.extension.extensionKind === vscode.ExtensionKind.Workspace) {
    return { docker: false, port: null };
  }

  // Seek a valid docker-compose object within objectscript.conn
  const { "docker-compose": dockerCompose = {} } = config("conn");
  const { service, file = "docker-compose.yml", internalPort = 52773, envFile } = dockerCompose;
  if (!internalPort || !file || !service || service === "") {
    return { docker: false, port: null };
  }

  const result = { port: null, docker: true, service };
  const workspaceFolder = uriOfWorkspaceFolder();
  if (!workspaceFolder) {
    // No workspace folders are open
    return { docker: false, port: null };
  }
  const workspaceFolderPath = workspaceFolder.fsPath;
  const workspaceRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

  const cwd: string = await fileExists(vscode.Uri.file(path.join(workspaceFolderPath, file))).then((exists) => {
    if (exists) {
      return workspaceRootPath;
    } else {
      throw new Error(`File '${file}' not found.`);
    }
  });

  if (!cwd) {
    return result;
  }

  const envFileParam = envFile ? `--env-file ${envFile}` : "";
  const exe = process.platform === "win32" ? "docker-compose.exe" : "docker-compose";
  const cmd = `${exe} -f ${file} ${envFileParam} `;

  return new Promise((resolve, reject) => {
    exec(`${cmd} ps --services --filter status=running`, { cwd }, (error, stdout) => {
      if (error) {
        reject(error.message);
      }
      if (!stdout.replaceAll("\r", "").split("\n").includes(service)) {
        reject(`Service '${service}' not found in '${file}', or not running.`);
      }

      exec(`${cmd} port --protocol=tcp ${service} ${internalPort}`, { cwd }, (error, stdout) => {
        if (error) {
          reject(error.message);
        }
        const [, port] = stdout.match(/:(\d+)/) || [];
        if (!port) {
          reject(`Port ${internalPort} not published for service '${service}'.`);
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
    const exe = process.platform === "win32" ? "docker-compose.exe" : "docker-compose";
    terminal = vscode.window.createTerminal(terminalName, exe, [
      "-f",
      file,
      "exec",
      service,
      "/bin/bash",
      "-c",
      `[ -f /tmp/vscodesession.pid ] && kill $(cat /tmp/vscodesession.pid) >/dev/null 2>&1 ; echo $$ > /tmp/vscodesession.pid;
        $(command -v ccontrol || command -v iris) session $ISC_PACKAGE_INSTANCENAME -U ${ns}`,
    ]);
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
    const exe = process.platform === "win32" ? "docker-compose.exe" : "docker-compose";
    terminal = vscode.window.createTerminal(terminalName, exe, ["-f", file, "exec", service, "/bin/bash"]);
    terminals.push(terminal);
  }
  terminal.show(true);
  return terminal;
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
  const dotMatch = uri.path.match(/^\/(\.[^/]*)(\/.*)?$/);
  if (dotMatch && dotMatch[1] === ".vscode") {
    let namespace: string;
    const nsMatch = `&${uri.query}&`.match(/&ns=([^&]+)&/);
    if (nsMatch) {
      namespace = nsMatch[1].toUpperCase();
      const newQueryString = (("&" + uri.query).replace(`ns=${namespace}`, "ns=%SYS") + "&csp").slice(1);
      return uri.with({ path: `/_vscode/${namespace}${dotMatch[2] || ""}`, query: newQueryString });
    } else {
      const parts = uri.authority.split(":");
      if (parts.length === 2) {
        namespace = parts[1].toUpperCase();
        return uri.with({
          authority: `${parts[0]}:%SYS`,
          path: `/_vscode/${namespace}${dotMatch[2] || ""}`,
          query: uri.query + "&csp",
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

// ---------------------------------------------------------------------
// Source: https://github.com/amsterdamharu/lib/blob/master/src/index.js

const promiseLike = (x) => x !== undefined && typeof x.then === "function";
const ifPromise = (fn) => (x) => promiseLike(x) ? x.then(fn) : fn(x);

/*
  causes a promise returning function not to be called
  until less than max are active
  usage example:
  max2 = throttle(2);
  urls = [url1,url2,url3...url100]
  Promise.all(//even though a 100 promises are created, only 2 are active
    urls.map(max2(fetch))
  )
*/
const throttle = (max: number): ((fn: any) => (arg: any) => Promise<any>) => {
  let que = [];
  let queIndex = -1;
  let running = 0;
  const wait = (resolve, fn, arg) => () => resolve(ifPromise(fn)(arg)) || true; //should always return true
  const nextInQue = () => {
    ++queIndex;
    if (typeof que[queIndex] === "function") {
      return que[queIndex]();
    } else {
      que = [];
      queIndex = -1;
      running = 0;
      return "Does not matter, not used";
    }
  };
  const queItem = (fn, arg) => new Promise((resolve, reject) => que.push(wait(resolve, fn, arg)));
  return (fn) => (arg) => {
    const p = queItem(fn, arg).then((x) => nextInQue() && x);
    running++;
    if (running <= max) {
      nextInQue();
    }
    return p;
  };
};

// ---------------------------------------------------------------------

/**
 * Wrap around each promise in array to avoid overloading the server.
 */
export const throttleRequests = throttle(50);
