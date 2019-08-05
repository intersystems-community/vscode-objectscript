import * as vscode from "vscode";
import { config } from "../../extension";

export class NodeBase {
  public readonly label: string;
  public readonly fullName: string;
  public readonly workspaceFolder: string;
  public readonly conn: any;
  public readonly extraNode: boolean;
  public readonly namespace: string;

  protected constructor(label: string, fullName: string, workspaceFolder, namespace: string) {
    this.label = label;
    this.fullName = fullName;
    this.workspaceFolder = workspaceFolder;
    this.conn = config("conn", workspaceFolder);
    this.namespace = namespace || this.conn.ns;
    this.extraNode = this.conn.ns !== this.namespace;
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
