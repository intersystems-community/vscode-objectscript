import fs = require("fs");
import path = require("path");
import * as url from "url";
import { execSync } from "child_process";
import * as vscode from "vscode";
import { config, schemas, workspaceState, terminals } from "../extension";

let latestErrorMessage = "";
export const outputChannel: {
  resetError?(): void;
  appendError?(value: string, show?: boolean): void;
} & vscode.OutputChannel = vscode.window.createOutputChannel("ObjectScript");

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

import { InputBoxManager } from "./inputBoxManager";
export { InputBoxManager };

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
      fileExt.match(/(csp)/i)) // Skip CSP for now, yet
  ) {
    return null;
  }
  const eol = document.eol || vscode.EndOfLine.LF;
  const uri = document.uri;
  const content = document.getText();
  let name = "";
  let ext = "";
  const { query } = url.parse(decodeURIComponent(uri.toString()), true);
  const csp = query.csp === "" || query.csp === "1";
  if (csp) {
    name = fileName;
  } else if (fileExt === "cls") {
    const match = content.match(/^Class (%?\w+(?:\.\w+)+)/im);
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
    name = fileName;
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

export async function mkdirSyncRecursive(dirpath: string): Promise<string> {
  if (fs.existsSync(dirpath)) {
    return Promise.resolve(dirpath);
  }
  const mkdir = (currentPath, folder): void => {
    currentPath += folder + path.sep;

    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath);
    }

    return currentPath;
  };
  return new Promise<string>((resolve, reject): void => {
    try {
      dirpath.split(path.sep).reduce(mkdir, "");
      resolve(dirpath);
    } catch (error) {
      reject(error);
    }
  });
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
      result.configName = uri.authority;
    }
  }

  // Fall back to the connection for the first folder in the workspace
  if (result.apiTarget === "") {
    const firstFolder =
      vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
        ? vscode.workspace.workspaceFolders[0]
        : undefined;
    if (firstFolder && schemas.includes(firstFolder.uri.scheme)) {
      result.configName = firstFolder.uri.authority;
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
    const uri = document.uri;
    if (uri.scheme === "file") {
      if (vscode.workspace.getWorkspaceFolder(uri)) {
        return vscode.workspace.getWorkspaceFolder(uri).name;
      }
    } else if (schemas.includes(uri.scheme)) {
      return uri.authority;
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

export function workspaceFolderUri(workspaceFolder: string = currentWorkspaceFolder()): vscode.Uri {
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

export function portFromDockerCompose(): { port: number; docker: boolean } {
  const { "docker-compose": dockerCompose = {} } = config("conn");
  const { service, file = "docker-compose.yml", internalPort = 52773, envFile } = dockerCompose;
  if (!internalPort || !file || !service || service === "") {
    return { docker: false, port: null };
  }
  const result = { port: null, docker: true };
  const workspaceFolderPath = workspaceFolderUri().fsPath;
  const workspaceRootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

  const cwd = fs.existsSync(path.join(workspaceFolderPath, file))
    ? workspaceFolderPath
    : fs.existsSync(path.join(workspaceRootPath, file))
    ? workspaceRootPath
    : null;

  if (!cwd) {
    return result;
  }

  const envFileParam = envFile ? `--env-file ${envFile}` : "";
  const cmd = `docker-compose -f ${file} ${envFileParam} port --protocol=tcp ${service} ${internalPort}`;

  try {
    const serviceLine = execSync(cmd, {
      cwd,
    })
      .toString()
      .replace("/r", "")
      .split("/n")
      .pop();
    const servicePortMatch = serviceLine.match(new RegExp(`:(\\d+)`));
    if (servicePortMatch) {
      const [, newPort] = servicePortMatch;
      return { port: parseInt(newPort, 10), docker: true };
    }
  } catch (e) {
    // nope
  }
  return result;
}

export async function terminalWithDocker(): Promise<vscode.Terminal> {
  const { ns, "docker-compose": dockerCompose } = config("conn");
  const { service, file = "docker-compose.yml" } = dockerCompose;
  const workspace = currentWorkspaceFolder();

  const terminalName = `ObjectScript:${workspace}`;
  let terminal = terminals.find((t) => t.name == terminalName && t.exitStatus == undefined);
  if (!terminal) {
    terminal = vscode.window.createTerminal(terminalName, "docker-compose", [
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
