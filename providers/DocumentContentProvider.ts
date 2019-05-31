import * as vscode from 'vscode';
import { AtelierAPI } from './../api';
import * as url from 'url';
import * as path from 'path';
import * as fs from 'fs';

import { OBJECTSCRIPT_FILE_SCHEMA, config, FILESYSTEM_SCHEMA } from '../extension';
import { currentWorkspaceFolder, workspaceFolderUri } from '../utils';
import { getFileName } from '../commands/export';

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  constructor() { }

  static getAsFile(name: string, workspaceFolder: string) {
    const { atelier, folder, addCategory } = config('export', workspaceFolder);

    const root = [workspaceFolderUri(workspaceFolder).fsPath, folder].join(path.sep);
    const fileName = getFileName(root, name, atelier, addCategory);
    if (fs.existsSync(fileName)) {
      return fileName
    }
  }

  public static getUri(name: string, workspaceFolder?: string, namespace?: string, vfs = true): vscode.Uri {
    workspaceFolder = workspaceFolder && workspaceFolder !== '' ? workspaceFolder : currentWorkspaceFolder();
    let found = this.getAsFile(name, workspaceFolder);
    if (found) {
      return vscode.Uri.file(found);
    }
    let uri = vscode.Uri.file(name).with({
      scheme: vfs ? FILESYSTEM_SCHEMA : OBJECTSCRIPT_FILE_SCHEMA
    });
    if (workspaceFolder && workspaceFolder !== '') {
      uri = uri.with({
        authority: workspaceFolder
      });
    }
    if (namespace && namespace !== '') {
      uri = uri.with({
        query: `ns=${namespace}`
      });
    }
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    let fileName = uri.path.split('/')[1];
    const api = new AtelierAPI();
    let query = url.parse(decodeURIComponent(uri.toString()), true).query;
    if (query) {
      if (query.ns && query.ns !== '') {
        let namespace = query.ns.toString();
        api.setNamespace(namespace);
      }
    }
    api.setConnection(uri.authority);
    return api.getDoc(fileName).then(data => {
      return data.result.content.join('\n');
    });
  }

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  public update(uri: vscode.Uri, message?: string): void {
    this.onDidChangeEvent.fire(uri);
  }
}
