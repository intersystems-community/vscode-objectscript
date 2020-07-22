import fs = require("fs");
import path = require("path");
import * as url from "url";
import { execSync } from "child_process";
import * as vscode from "vscode";
import { config, schemas, workspaceState, terminals } from "../extension";

export const outputChannel = vscode.window.createOutputChannel("ObjectScript");

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

export function currentFile(document?: vscode.TextDocument): CurrentFile {
  document =
    document ||
    (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document
      ? vscode.window.activeTextEditor.document
      : null);
  if (!document) {
    return null;
  }
  if (
    !schemas.includes(document.uri.scheme) &&
    (!document || !document.fileName || !document.languageId || !document.languageId.startsWith("objectscript"))
  ) {
    return null;
  }
  const eol = document.eol || vscode.EndOfLine.LF;
  const uri = document.uri;
  const fileName = document.fileName;
  const content = document.getText();
  const fileExt = fileName.split(".").pop().toLowerCase();
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

export function currentWorkspaceFolder(document?: vscode.TextDocument): string {
  let workspaceFolder;
  document = document ? document : vscode.window.activeTextEditor && vscode.window.activeTextEditor.document;
  if (document) {
    const uri = document.uri;
    if (uri.scheme === "file") {
      if (vscode.workspace.getWorkspaceFolder(uri)) {
        workspaceFolder = vscode.workspace.getWorkspaceFolder(uri).name;
      }
    } else if (schemas.includes(uri.scheme)) {
      workspaceFolder = uri.authority;
    }
  }
  const first =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length
      ? vscode.workspace.workspaceFolders[0].name
      : "";
  return workspaceFolder || workspaceState.get<string>("workspaceFolder") || first;
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
