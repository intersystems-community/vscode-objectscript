import * as vscode from "vscode";
import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { NodeBase, NodeOptions } from "./nodeBase";

export class RoutineNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:routineNode";
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
        command: "vscode-objectscript.explorer.openRoutine",
        title: "Open routine",
      },
      resourceUri: isLocalFile ? itemUri : undefined,
      contextValue: "dataNode:routineNode",
      label: `${displayName}`,
      tooltip: isLocalFile ? undefined : this.fullName,
    };
  }
}
