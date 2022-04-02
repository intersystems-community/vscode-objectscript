import * as vscode from "vscode";
import { currentWorkspaceFolder, uriOfWorkspaceFolder } from "../../utils";
import { AtelierAPI } from "../../api";

export interface NodeOptions {
  extraNode?: boolean;
  generated?: boolean;
  system?: boolean;
  namespace?: string;
  workspaceFolder?: string;
  workspaceFolderUri?: vscode.Uri;
  project?: string;
}

export class NodeBase {
  public readonly options: NodeOptions;
  public readonly label: string;
  public readonly fullName: string;
  public readonly workspaceFolder: string;
  public readonly conn: any;
  public readonly extraNode: boolean;
  public readonly namespace: string;
  public readonly workspaceFolderUri: vscode.Uri;

  protected constructor(label: string, fullName: string, options: NodeOptions) {
    this.options = {
      generated: false,
      extraNode: false,
      ...options,
    };
    this.label = label;
    this.fullName = fullName;
    const { workspaceFolder, namespace, extraNode, workspaceFolderUri } = options;
    if (workspaceFolderUri) {
      // Used by Projects tree
      this.workspaceFolderUri = workspaceFolderUri;
      this.workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri)?.name;
      const api = new AtelierAPI(workspaceFolderUri);
      this.conn = api.config;
    } else {
      this.workspaceFolder = workspaceFolder || currentWorkspaceFolder();
      this.workspaceFolderUri = uriOfWorkspaceFolder(this.workspaceFolder);
      const api = new AtelierAPI(workspaceFolder);
      this.conn = api.config;
    }
    this.namespace = namespace || this.conn.ns;
    this.extraNode = extraNode;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      label: this.label,
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    return [];
  }

  public async getItems4Export(): Promise<string[]> {
    return [this.fullName];
  }
}
