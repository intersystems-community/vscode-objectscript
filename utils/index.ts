import * as vscode from 'vscode';
import fs = require('fs');
import path = require('path');

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
}

export function currentFile(): CurrentFile {
  const document = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document : null;
  if (!document || !document.fileName || !document.languageId || !document.languageId.startsWith('objectscript')) {
    return null;
  }
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
    content
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
