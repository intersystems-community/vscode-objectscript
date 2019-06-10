import * as vscode from "vscode";

export class NodeBase {
  public readonly label: string;
  public readonly fullName: string;

  protected constructor(label: string) {
    this.label = label;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      label: this.label,
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    return [];
  }
}
