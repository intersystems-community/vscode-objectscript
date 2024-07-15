import * as vscode from "vscode";
import { RootNode } from "./rootNode";
import { NodeOptions } from "./nodeBase";

export class PackageNode extends RootNode {
  public constructor(label: string, fullName: string, category: string, options: NodeOptions) {
    super(label, fullName, "dataNode:packageNode", category, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: `${displayName}`,
      tooltip: this.fullName,
    };
  }

  public getClasses(): string[] {
    return [];
  }
}
