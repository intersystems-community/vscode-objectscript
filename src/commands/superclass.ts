import * as vscode from "vscode";
import { config } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { currentFile, notIsfs } from "../utils";
import { ClassDefinition } from "../utils/classDefinition";

export async function superclass(): Promise<void> {
  const file = currentFile();
  if (!file || !file.name.toLowerCase().endsWith(".cls") || (notIsfs(file.uri) && !config("conn").active)) {
    return;
  }

  const open = (item) => {
    const uri = DocumentContentProvider.getUri(ClassDefinition.normalizeClassName(item, true));
    vscode.window.showTextDocument(uri);
  };

  const classDefinition = new ClassDefinition(file.name);
  return classDefinition
    .super()
    .then((data) => {
      const list = data || [];
      if (!list.length) {
        return;
      }
      vscode.window.showQuickPick(list, { title: "Pick a superclass" }).then((item) => {
        open(item);
      });
    })
    .catch((err) => console.error(err));
}
