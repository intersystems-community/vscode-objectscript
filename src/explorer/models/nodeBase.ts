import * as vscode from "vscode";
import { config, workspaceState } from "../../extension";
import { currentWorkspaceFolder } from "../../utils";

export interface NodeOptions {
  extraNode?: boolean;
  generated?: boolean;
  namespace?: string;
  workspaceFolder?: string;
}

export class NodeBase {
  public readonly options: NodeOptions;
  public readonly label: string;
  public readonly fullName: string;
  public readonly workspaceFolder: string;
  public readonly conn: any;
  public readonly extraNode: boolean;
  public readonly namespace: string;

  protected constructor(label: string, fullName: string, options: NodeOptions) {
    this.options = {
      generated: false,
      extraNode: false,
      ...options,
    };
    this.label = label;
    this.fullName = fullName;
    const { workspaceFolder, namespace, extraNode } = options;
    this.workspaceFolder = workspaceFolder || currentWorkspaceFolder();
    this.conn = config("conn", workspaceFolder);
    this.namespace = namespace || this.conn.ns;
    this.extraNode = extraNode;
  }

  public get connInfo(): string {
    const port = workspaceState.get(this.workspaceFolder + ":port", this.conn.port);
    return `${this.conn.host}:${port}[${this.namespace}]`;
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

  public async getItems4Export(): Promise<string[]> {
    return [this.fullName];
  }
}
