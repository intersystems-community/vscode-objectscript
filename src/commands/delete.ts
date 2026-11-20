import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { FILESYSTEM_SCHEMA, explorerProvider } from "../extension";
import { handleError, outputChannel } from "../utils";
import { OtherStudioAction, fireOtherStudioAction } from "./studio";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { UserAction } from "../api/atelier";
import { NodeBase } from "../explorer/nodes";

export async function deleteExplorerItems(nodes: NodeBase[]): Promise<any> {
  const { wsFolder, namespace } = nodes[0];
  const docs = await Promise.allSettled(nodes.map((node) => node.getItemsForExport())).then((results) => {
    const items = new Set<string>();
    results.forEach(result => {
      if (result.status == "fulfilled") {
        for (const item of result.value) items.add(item);
      }
    });
    return Array.from(items);
  });
  if (!docs.length) {
    vscode.window.showWarningMessage("No documents to delete.", "Dismiss");
    return;
  }
  // Ask the user to confirm
  const msg = docs.length > 1 ? `${docs.length} documents` : `'${docs[0]}'`;
  const confirm = await vscode.window.showWarningMessage(
    `About to delete ${msg}. Are you sure you want to proceed?`,
    "Cancel",
    "Confirm"
  );
  if (confirm != "Confirm") {
    // Don't delete without confirmation
    return;
  }
  const api = new AtelierAPI(wsFolder.uri);
  if (namespace) api.setNamespace(namespace);
  await api.deleteDocs(docs).then((result) => {
    for (const doc of result.result) {
      if (doc.status == "" || doc.status.includes("#16005:")) {
        outputChannel.appendLine(`Deleted ${doc.name}`);
      } else {
        outputChannel.appendLine(`Failed to delete ${doc.name}: ${doc.status}`);
      }
      if (doc.ext && wsFolder.uri.scheme == FILESYSTEM_SCHEMA) {
        // Only process source control output if we're in an isfs folder
        const uri = DocumentContentProvider.getUri(doc.name,undefined,namespace,undefined,wsFolder.uri);
        fireOtherStudioAction(OtherStudioAction.DeletedDocument, uri!, <UserAction>doc.ext);
      }
    }
    explorerProvider.refresh();
  }).catch((error) => handleError(error, `Failed to delete ${msg}.`));
}
