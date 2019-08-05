import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { currentFile } from "../utils";

export async function viewOthers(): Promise<void> {
  const file = currentFile();
  if (!file) {
    return;
  }
  if (!config("conn").active) {
    return;
  }

  const open = item => {
    const uri = DocumentContentProvider.getUri(item);
    vscode.window.showTextDocument(uri);
  };

  const getOthers = info => {
    return info.result.content[0].others;
  };
  const api = new AtelierAPI();
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
