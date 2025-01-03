import path = require("path");
import { exec } from "child_process";
import * as vscode from "vscode";
import {
  config,
  schemas,
  workspaceState,
  terminals,
  extensionContext,
  cspApps,
  lsExtensionId,
  OBJECTSCRIPT_FILE_SCHEMA,
  documentContentProvider,
} from "../extension";
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

// For workspace roots in the local filesystem, configName is the root's name
//  which defaults to the folder name, and apiTarget is the same.
// For isfs roots, configName is the uri.authority (i.e. isfs://this-bit/...)
//  which is normally the server name as looked up in intersystems.servers, and
//  apiTarget is the uri.
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
    const match = content.match(classNameRegex);
    if (match) {
      [, name, ext = "cls"] = match;
    }
  } else if (fileExt.match(/(mac|int|inc)/i)) {
    const match = content.match(routineNameTypeRegex);
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
