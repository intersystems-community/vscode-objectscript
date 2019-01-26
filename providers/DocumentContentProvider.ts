import * as vscode from 'vscode';
import { AtelierAPI } from './../api';
import * as glob from 'glob';
import * as url from 'url';

import { OBJECTSCRIPT_FILE_SCHEMA } from '../extension';
import { currentWorkspaceFolder, workspaceFolderUri } from '../utils';

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  constructor() {}

  static findAsFile(name: string, workspaceFolder: string) {
    let fileName = name.split('.');
    let fileExt = fileName.pop().toLowerCase();
    let root = workspaceFolderUri(workspaceFolder).path;
    let pattern = `/**/{${fileName.join('.')},${fileName.join('/')}}.${fileExt}`;
    let found = glob.sync(pattern, { root, nodir: true });
    return found.length ? found.pop() : null;
  }

  public static getUri(name: string, workspaceFolder?: string, namespace?: string): vscode.Uri {
    workspaceFolder = workspaceFolder && workspaceFolder !== '' ? workspaceFolder : currentWorkspaceFolder();
    let found = this.findAsFile(name, workspaceFolder);
    if (found) {
      return vscode.Uri.file(found);
    }
    let uri = vscode.Uri.file(name).with({
      scheme: OBJECTSCRIPT_FILE_SCHEMA
    });
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
      if (workspaceFolder && workspaceFolder !== '') {
        uri = uri.with({
          authority: workspaceFolder
        });
      }
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
