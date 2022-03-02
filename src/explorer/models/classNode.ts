import * as vscode from "vscode";
import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { NodeBase, NodeOptions } from "./nodeBase";
import { config } from "../../extension";

export class ClassNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:classNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const itemUri = DocumentContentProvider.getUri(this.fullName, this.workspaceFolder, this.namespace);
    const isLocalFile = itemUri.scheme === "file";
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);
    const serverCopyUri = DocumentContentProvider.getUri(
      this.fullName,
      this.workspaceFolder,
      this.namespace,
      undefined,
      undefined,
      true
    );

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [isLocalFile && !showServerCopy ? itemUri : serverCopyUri],
        command: "vscode-objectscript.explorer.open",
        title: "Open Class",
      },
      resourceUri: isLocalFile && !showServerCopy ? itemUri : undefined,
      contextValue: "dataNode:classNode",
      label: `${displayName}`,
      tooltip: isLocalFile ? undefined : this.fullName,
    };
  }
}
