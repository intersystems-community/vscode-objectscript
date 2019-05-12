import * as vscode from 'vscode';
import fs = require('fs');
import path = require('path');
import { workspaceState } from '../extension';

export const outputChannel = vscode.window.createOutputChannel('ObjectScript');

export function outputConsole(data: string[]) {
  data.forEach(line => {
    outputChannel.appendLine(line);
  });
}

export interface CurrentFile {
  name: string;
  fileName: string;
  content: string;
  uri: vscode.Uri;
}

export function currentFile(document?: vscode.TextDocument): CurrentFile {
  document = document || (vscode.window.activeTextEditor.document ? vscode.window.activeTextEditor.document : null);
  if (!document || !document.fileName || !document.languageId || !document.languageId.startsWith('objectscript')) {
    return null;
  }
  const uri = document.uri;
  const fileName = document.fileName;
  const content = document.getText();
  const fileExt = fileName.match(/\.(\w+)$/)[1].toLowerCase();
  let name = '';
  let ext = '';
  if (fileExt === 'cls') {
    const match = content.match(/^Class (%?\w+(?:\.\w+)+)/im);
    name = match[1];
    ext = 'cls';
  } else {
    const match = content.match(/^ROUTINE ([^\s]+)(?:\s+\[.*Type=([a-z]{3,}))?/i);
    name = match[1];
    ext = match[2] || 'mac';
  }
  if (!name) {
    return null;
  }
  name += '.' + ext;

  return {
    name,
    fileName,
    content,
    uri
  };
}

export async function mkdirSyncRecursive(dirpath: string): Promise<string> {
  const mkdir = (currentPath, folder) => {
    currentPath += folder + path.sep;

    if (!fs.existsSync(currentPath)) {
      fs.mkdirSync(currentPath);
    }

    return currentPath;
  };
  return new Promise<string>((resolve, reject) => {
    try {
      dirpath.split(path.sep).reduce(mkdir, '');
      resolve(dirpath);
    } catch (error) {
      reject(error);
    }
  });
}

export function currentWorkspaceFolder(): string {
  let workspaceFolder;
  if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
    const uri = vscode.window.activeTextEditor.document.uri;
    if (uri.scheme === 'file') {
      if (vscode.workspace.getWorkspaceFolder(uri)) {
        workspaceFolder = vscode.workspace.getWorkspaceFolder(uri).name;
      }
    } else if (uri.scheme.startsWith('objectscript')) {
      workspaceFolder = uri.authority;
    }
  }
  return workspaceFolder || workspaceState.get<string>('workspaceFolder');
}

export function workspaceFolderUri(workspaceFolder: string = currentWorkspaceFolder()): vscode.Uri {
  return vscode.workspace.workspaceFolders.find(el => el.name.toLowerCase() === workspaceFolder.toLowerCase()).uri;
}

export function onlyUnique(value: any, index: number, self: any) {
  if (value && value.name) {
    return self.findIndex(el => el.name === value.name) === index;
  }
  return self.indexOf(value) === index;
}

export function notNull(el: any) {
  return el !== null;
}
