import * as vscode from 'vscode';
import { NodeBase } from './models/nodeBase';

import { config } from '../extension';
import { WorkspaceNode } from './models/workspaceNode';
import { AtelierAPI } from '../api';

export class ObjectScriptExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  onDidChange?: vscode.Event<vscode.Uri>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase> = new vscode.EventEmitter<NodeBase>();
  readonly onDidChangeTreeData: vscode.Event<NodeBase> = this._onDidChangeTreeData.event;
  private _showExtra4Workspace: string[] = [];

  constructor() { }

  async selectNamespace(workspaceFolder: string): Promise<any> {
    let api = new AtelierAPI(workspaceFolder);
    return api
      .serverInfo()
      .then(data => data.result.content.namespaces)
      .then(data => data.filter(ns => ns !== api.ns && !this._showExtra4Workspace.includes(ns)))
      .then(data => data.map(ns => ({ label: ns })))
      .then(vscode.window.showQuickPick)
      .then(ns => this.showExtra4Workspace(workspaceFolder, ns.label));
  }

  showExtra4Workspace(workspaceFolder: string, ns: string) {
    if (!this._showExtra4Workspace.includes(ns)) {
      this._showExtra4Workspace.push(ns);
      this._onDidChangeTreeData.fire(null);
    }
  }

  closeExtra4Workspace(workspaceFolder: string, ns: string) {
    let pos = this._showExtra4Workspace.indexOf(ns);
    if (pos >= 0) {
      this._showExtra4Workspace.splice(pos, 1)
      this._onDidChangeTreeData.fire(null);
    }
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

        this._showExtra4Workspace.forEach(ns => {
          node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData, ns);
          rootNodes.push(node);
        })
      }
    });
    return rootNodes;
  }
}
