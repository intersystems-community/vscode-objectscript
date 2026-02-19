import * as vscode from "vscode";

import { AtelierAPI } from "../api";
import { FILESYSTEM_SCHEMA, explorerProvider } from "../extension";
import { outputChannel } from "../utils";
import { OtherStudioAction, fireOtherStudioAction } from "./studio";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { UserAction } from "../api/atelier";
import { NodeBase, PackageNode, RootNode } from "../explorer/nodes";

function deleteList(items: string[], wsFolder: vscode.WorkspaceFolder, namespace?: string): Promise<any> {
  if (!items || !items.length) {
    vscode.window.showWarningMessage("No documents to delete.", "Dismiss");
  }
  const api = new AtelierAPI(wsFolder.uri);
  if (namespace) api.setNamespace(namespace);
  return Promise.all(items.map((item) => api.deleteDoc(item))).then((files) => {
    files.forEach((file) => {
      if (file.result.ext && wsFolder.uri.scheme == FILESYSTEM_SCHEMA) {
        // Only process source control output if we're in an isfs folder
        const uri = DocumentContentProvider.getUri(file.result.name);
        fireOtherStudioAction(OtherStudioAction.DeletedDocument, uri, <UserAction>file.result.ext);
      }
    });
    outputChannel.appendLine(`Deleted items: ${files.filter((el) => el.result).length}`);
  });
}

export async function deleteExplorerItems(nodes: NodeBase[]): Promise<any> {
  const { wsFolder, namespace } = nodes[0];
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
      if (items.length) {
        // Ask the user to confirm
        const confirm = await vscode.window.showWarningMessage(
          `About to delete ${
            items.length > 1 ? `${items.length} documents` : `'${items[0]}'`
          }. Are you sure you want to proceed?`,
          "Cancel",
          "Confirm"
        );
        if (confirm !== "Confirm") {
          // Don't delete without confirmation
          return;
        }
        deleteList(items, wsFolder, namespace);
        explorerProvider.refresh();
      }
    });
}
