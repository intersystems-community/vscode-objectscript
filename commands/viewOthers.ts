import * as vscode from 'vscode';
import { config } from '../extension';
import { AtelierAPI } from '../api';
import { currentFile } from '../utils';
import { DocumentContentProvider } from '../providers/DocumentContentProvider';

export async function viewOthers(): Promise<void> {
  const api = new AtelierAPI();
  const file = currentFile();
  if (!file) {
    return;
  }
  if (!config('conn').active) {
    return;
  }

  const open = item => {
    let uri = DocumentContentProvider.getUri(item);
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
