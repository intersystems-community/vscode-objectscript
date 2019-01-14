import * as vscode from 'vscode';
import { OBJECTSCRIPT_FILE_SCHEMA } from '../extension';
import { AtelierAPI } from '../api';
import { currentFile } from '../utils';

export async function viewOthers(): Promise<void> {
  const api = new AtelierAPI();
  const file = currentFile();
  if (!file) {
    return;
  }

  const open = item => {
    const uri = vscode.Uri.parse(encodeURI(`${OBJECTSCRIPT_FILE_SCHEMA}:///${item}`));
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
