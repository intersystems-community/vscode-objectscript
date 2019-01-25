import * as vscode from 'vscode';
import { OBJECTSCRIPT_FILE_SCHEMA, config } from '../extension';
import { AtelierAPI } from '../api';
import { currentFile } from '../utils';

export async function viewOthers(): Promise<void> {
  const api = new AtelierAPI();
  const file = currentFile();
  if (!file) {
    return;
  }
  if (!config().conn.active) {
    return;
  }

  const open = item => {
    let uri = vscode.Uri.file(item).with({
      scheme: OBJECTSCRIPT_FILE_SCHEMA
    });
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
      if (file.uri.scheme === 'file') {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
        uri = uri.with({
          authority: workspaceFolder.name
        });
      } else {
        uri = uri.with({
          authority: file.uri.authority
        });
      }
    }
    vscode.window.showTextDocument(uri);
  };

  const getOthers = info => {
    return info.result.content[0].others;
  };
  return api
    .actionIndex([file.name])
    .then(info => {
      const listOthers = getOthers(info) || [];
      if (!listOthers.length) {
        return;
      }
      if (listOthers.length === 1) {
        open(listOthers[0]);
      } else {
        vscode.window.showQuickPick(listOthers).then(item => {
          open(item);
        });
      }
    })
    .catch(err => console.error(err));
}
