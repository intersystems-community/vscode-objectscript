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

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [DocumentContentProvider.getUri(this.fullName, this.workspaceFolder, this.namespace)],
        command: "vscode-objectscript.explorer.openRoutine",
        title: "Open routine",
      },
      contextValue: "dataNode:routineNode",
      label: `${displayName}`,
      // iconPath: {
      //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'routine.svg'),
      //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'routine.svg')
      // }
    };
  }
}
