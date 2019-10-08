import * as vscode from "vscode";
import { RootNode } from "./rootNode";

export class PackageNode extends RootNode {
  public constructor(label: string, fullName: string, category: string, options) {
    super(label, fullName, "dataNode:packageNode", category, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: `${displayName}`,
      // iconPath: {
      //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'package.svg'),
      //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'package.svg')
      // }
    };
  }

  public getClasses(): string[] {
    return [];
  }
}
