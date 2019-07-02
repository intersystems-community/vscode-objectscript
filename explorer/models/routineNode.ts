import * as vscode from "vscode";
import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { NodeBase } from "./nodeBase";

export class RoutineNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:routineNode";
  constructor(
    public readonly label: string,
    public readonly fullName: string,
    workspaceFolder: string,
    namespace: string,
  ) {
    super(label, workspaceFolder, namespace);
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
