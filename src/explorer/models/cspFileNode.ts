import * as vscode from "vscode";
import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { NodeBase, NodeOptions } from "./nodeBase";

export class CSPFileNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:cspFileNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const itemUri = DocumentContentProvider.getUri(this.fullName, this.workspaceFolder, this.namespace);
    const isLocalFile = itemUri.scheme === "file";

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [itemUri],
        command: "vscode-objectscript.explorer.openCSPFile",
        title: "Open File",
      },
      contextValue: CSPFileNode.contextValue,
      label: `${displayName}`,
      tooltip: isLocalFile ? undefined : this.fullName,
    };
  }
}
