import * as vscode from "vscode";

import { AtelierAPI } from "../api";
import { ClassNode } from "../explorer/models/classNode";
import { PackageNode } from "../explorer/models/packageNode";
import { RootNode } from "../explorer/models/rootNode";
import { RoutineNode } from "../explorer/models/routineNode";
import { explorerProvider } from "../extension";
import { outputChannel } from "../utils";
import { OtherStudioAction, fireOtherStudioAction } from "./studio";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

function deleteList(items: string[], workspaceFolder: string): Promise<any> {
  if (!items || !items.length) {
    vscode.window.showWarningMessage("Nothing to export");
  }

  const api = new AtelierAPI(workspaceFolder);
  return Promise.all(items.map((item) => api.deleteDoc(item))).then((files) => {
    files.forEach((file) => {
      if (file.result.ext) {
        const uri = DocumentContentProvider.getUri(file.result.name);
        fireOtherStudioAction(OtherStudioAction.DeletedDocument, uri, file.result.ext);
      }
    });
    outputChannel.appendLine(`Deleted items: ${files.filter((el) => el.result).length}`);
  });
}

export async function deleteItem(node: RootNode | PackageNode | ClassNode | RoutineNode): Promise<any> {
  const workspaceFolder = node.workspaceFolder;
  const nodesList = node instanceof RootNode ? node.getChildren(node) : Promise.resolve([node]);
  return nodesList
    .then((nodes) =>
      nodes.reduce(
        (list, subNode) => list.concat(subNode instanceof PackageNode ? subNode.getClasses() : [subNode.fullName]),
        []
      )
    )
    .then((items) => {
      deleteList(items, workspaceFolder);
      explorerProvider.refresh();
    });
}
