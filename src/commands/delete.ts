import * as vscode from "vscode";

import { AtelierAPI } from "../api";
import { PackageNode } from "../explorer/models/packageNode";
import { RootNode } from "../explorer/models/rootNode";
import { NodeBase } from "../explorer/models/nodeBase";
import { explorerProvider } from "../extension";
import { outputChannel } from "../utils";
import { OtherStudioAction, fireOtherStudioAction } from "./studio";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

function deleteList(items: string[], workspaceFolder: string, namespace: string): Promise<any> {
  if (!items || !items.length) {
    vscode.window.showWarningMessage("Nothing to delete");
  }

  const api = new AtelierAPI(workspaceFolder);
  api.setNamespace(namespace);
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

export async function deleteExplorerItems(nodes: NodeBase[]): Promise<any> {
  const { workspaceFolder, namespace } = nodes[0];
  const nodesPromiseList: Promise<NodeBase[]>[] = [];
  for (const node of nodes) {
    nodesPromiseList.push(node instanceof RootNode ? node.getChildren(node) : Promise.resolve([node]));
  }
  return Promise.all(nodesPromiseList)
    .then((nodesList) => nodesList.flat())
    .then((allNodes) =>
      allNodes.reduce<string[]>(
        (list, subNode) => list.concat(subNode instanceof PackageNode ? subNode.getClasses() : [subNode.fullName]),
        []
      )
    )
    .then(async (items) => {
      if (nodes.length > 1) {
        // Ask the user to confirm if they're deleting more than one explorer node
        const confirm = await vscode.window.showWarningMessage(
          `About to delete ${items.length} document${items.length > 1 ? "s" : ""}. Are you sure you want to proceed?`,
          "Cancel",
          "Confirm"
        );
        if (confirm !== "Confirm") {
          // Don't delete without confirmation
          return;
        }
      }
      deleteList(items, workspaceFolder, namespace);
      explorerProvider.refresh();
    });
}
