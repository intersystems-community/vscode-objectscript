import * as vscode from 'vscode';
import { AtelierAPI } from './../api';

import { OBJECTSCRIPT_FILE_SCHEMA, workspaceState, currentWorkspaceFolder } from '../extension';
const url = require('url');

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  constructor() {}

  public static getUri(name: string, workspaceFolder?: string, namespace?: string): vscode.Uri {
    workspaceFolder = workspaceFolder && workspaceFolder !== '' ? workspaceFolder : currentWorkspaceFolder();
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
        api.setNamespace(query.ns);
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
