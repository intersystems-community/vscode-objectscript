import * as vscode from "vscode";
import { NodeBase, NodeOptions } from "./nodeBase";
import { config } from "../../extension";
import { getLeafNodeUri } from "../explorer";

export class CSPFileNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:cspFileNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const itemUri = getLeafNodeUri(this);
    const isLocalFile = itemUri.scheme === "file";
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);
    const serverCopyUri = getLeafNodeUri(this, true);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [isLocalFile && !showServerCopy ? itemUri : serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open File",
      },
      resourceUri: isLocalFile && !showServerCopy ? itemUri : undefined,
      contextValue: CSPFileNode.contextValue,
      label: `${displayName}`,
      tooltip: isLocalFile && !showServerCopy ? undefined : this.fullName,
    };
  }
}
