import * as vscode from 'vscode';
import { AtelierAPI } from './../api';

import { OBJECTSCRIPT_FILE_SCHEMA } from '../extension';

export function getUri(name: string): vscode.Uri {
  return vscode.Uri.parse(encodeURI(`${OBJECTSCRIPT_FILE_SCHEMA}:///${name}`));
}

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  private _api: AtelierAPI;
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  constructor() {
    this._api = new AtelierAPI();
  }

  provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    let fileName = uri.path.split('/')[1];
    return this._api.getDoc(fileName).then(data => {
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
