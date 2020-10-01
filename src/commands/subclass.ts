import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { currentFile } from "../utils";
import { ClassDefinition } from "../utils/classDefinition";

export async function subclass(): Promise<void> {
  const file = currentFile();
  if (!file || !file.name.toLowerCase().endsWith(".cls")) {
    return;
  }
  const className = file.name.split(".").slice(0, -1).join(".");
  const api = new AtelierAPI(file.uri);
  if (!api.active) {
    return;
  }

  const open = (item) => {
    const uri = DocumentContentProvider.getUri(ClassDefinition.normalizeClassName(item, true));
    vscode.window.showTextDocument(uri);
  };

  return api
    .actionQuery("CALL %Dictionary.ClassDefinitionQuery_SubclassOf(?)", [className])
    .then((data) => {
      const list = data.result.content.slice(0, 100) || [];
      if (!list.length) {
        return;
      }
      vscode.window
        .showQuickPick(
          list.map((el) => el.Name),
          { placeHolder: "Pick a subclass" }
        )
        .then((item) => {
          open(item);
        });
    })
    .catch((err) => console.error(err));
}
