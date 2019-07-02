import * as vscode from "vscode";
import { config } from "../../extension";

export class NodeBase {
  public readonly fullName: string;
  public readonly conn: any;
  public readonly extraNode: boolean;


  protected constructor(
    public readonly label: string,
    public readonly workspaceFolder,
    public readonly namespace: string,
  ) {
    this.conn = config("conn", workspaceFolder);
    this.namespace = namespace || this.conn.ns;
    this.extraNode = (this.conn.ns !== this.namespace);
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
