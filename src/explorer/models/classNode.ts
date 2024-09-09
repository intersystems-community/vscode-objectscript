import * as vscode from "vscode";
import { NodeBase, NodeOptions } from "./nodeBase";
import { config } from "../../extension";
import { getLeafNodeUri } from "../explorer";
import { notIsfs } from "../../utils";

export class ClassNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:classNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const itemUri = getLeafNodeUri(this);
    const isLocalFile = notIsfs(itemUri);
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);
    const serverCopyUri = getLeafNodeUri(this, true);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [isLocalFile && !showServerCopy ? itemUri : serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open Class",
      },
      resourceUri: isLocalFile && !showServerCopy ? itemUri : undefined,
      contextValue: "dataNode:classNode",
      label: `${displayName}`,
      tooltip: isLocalFile && !showServerCopy ? undefined : this.fullName,
    };
  }
}
