import * as vscode from "vscode";
import { RootNode } from "./rootNode";
import { NodeOptions } from "./nodeBase";
import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { config } from "../../extension";

export class PackageNode extends RootNode {
  public constructor(label: string, fullName: string, category: string, options: NodeOptions) {
    super(label, fullName, "dataNode:packageNode", category, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const localFolderPath = DocumentContentProvider.getAsFolder(this.fullName, this.workspaceFolder, "cls");
    const localUri = localFolderPath ? vscode.Uri.file(localFolderPath) : undefined;
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      resourceUri: !this.extraNode && !showServerCopy ? localUri : undefined,
      contextValue: this.contextValue,
      label: `${displayName}`,
      tooltip: this.fullName,
      //iconPath: new vscode.ThemeIcon("package"),
    };
  }

  public getClasses(): string[] {
    return [];
  }
}
