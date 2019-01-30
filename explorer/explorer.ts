import * as vscode from 'vscode';
import { NodeBase } from './models/nodeBase';

import { config } from '../extension';
import { WorkspaceNode } from './models/workspaceNode';

export class ObjectScriptExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  onDidChange?: vscode.Event<vscode.Uri>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase> = new vscode.EventEmitter<NodeBase>();
  readonly onDidChangeTreeData: vscode.Event<NodeBase> = this._onDidChangeTreeData.event;
  private _showSystem = false;
  private _showSystem4Workspace: boolean[] = [];

  constructor() {}

  get showSystem(): boolean {
    return this._showSystem;
  }

  set showSystem(value) {
    this._showSystem = value;
    this._onDidChangeTreeData.fire(null);
  }

  showSystem4Workspace(workspaceFolder: string, value: boolean) {
    this._showSystem4Workspace[workspaceFolder] = value;
    this._onDidChangeTreeData.fire(null);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  getTreeItem(element: NodeBase): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: NodeBase): Promise<NodeBase[]> {
    if (!element) {
      return this.getRootNodes();
    }
    return element.getChildren(element);
  }

  private async getRootNodes(): Promise<NodeBase[]> {
    const rootNodes: NodeBase[] = [];
    let node: NodeBase;

    let workspaceFolders = vscode.workspace.workspaceFolders || [];
    workspaceFolders.forEach(workspaceFolder => {
      let conn: any = config('conn', workspaceFolder.name);
      if (conn.active) {
        node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData);
        rootNodes.push(node);

        if (this.showSystem || this._showSystem4Workspace[workspaceFolder.name]) {
          node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData, true);
          rootNodes.push(node);
        }
      }
    });
    return rootNodes;
  }
}
