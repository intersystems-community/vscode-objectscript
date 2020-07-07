import * as vscode from "vscode";
import { currentWorkspaceFolder } from "../../utils";
import { AtelierAPI } from "../../api";

export interface NodeOptions {
  extraNode?: boolean;
  generated?: boolean;
  system?: boolean;
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
    const api = new AtelierAPI(workspaceFolder);
    this.conn = api.config;
    this.namespace = namespace || this.conn.ns;
    this.extraNode = extraNode;
  }

  public get connInfo(): string {
    return `${this.conn.host}:${this.conn.port}[${this.namespace}]`;
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
