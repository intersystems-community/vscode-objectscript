import * as vscode from "vscode";
import { NodeBase } from "./models/nodeBase";

import { AtelierAPI } from "../api";
import { config } from "../extension";
import { WorkspaceNode } from "./models/workspaceNode";

export class ObjectScriptExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  public onDidChange?: vscode.Event<vscode.Uri>;
  public onDidChangeTreeData: vscode.Event<NodeBase>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase>;
  private _showExtra4Workspace: string[] = [];

  public constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter<NodeBase>();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  public async selectNamespace(workspaceFolder: string): Promise<any> {
    const api = new AtelierAPI(workspaceFolder);
    return api
      .serverInfo()
      .then(data => data.result.content.namespaces)
      .then(data => data.filter(ns => ns !== api.ns && !this._showExtra4Workspace.includes(ns)))
      .then(data => data.map(ns => ({ label: ns })))
      .then(vscode.window.showQuickPick)
      .then(ns => this.showExtra4Workspace(workspaceFolder, ns.label));
  }

  public showExtra4Workspace(workspaceFolder: string, ns: string) {
    if (!this._showExtra4Workspace.includes(ns)) {
      this._showExtra4Workspace.push(ns);
      this._onDidChangeTreeData.fire(null);
    }
  }

  public closeExtra4Workspace(workspaceFolder: string, ns: string) {
    const pos = this._showExtra4Workspace.indexOf(ns);
    if (pos >= 0) {
      this._showExtra4Workspace.splice(pos, 1);
      this._onDidChangeTreeData.fire(null);
    }
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire(null);
  }

  public getTreeItem(element: NodeBase): vscode.TreeItem {
    return element.getTreeItem();
  }

  public async getChildren(element?: NodeBase): Promise<NodeBase[]> {
    if (!element) {
      return this.getRootNodes();
    }
    return element.getChildren(element);
  }

  private async getRootNodes(): Promise<NodeBase[]> {
    const rootNodes: NodeBase[] = [];
    let node: NodeBase;

    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    workspaceFolders
      .filter(workspaceFolder => workspaceFolder.uri && workspaceFolder.uri.scheme === "file")
      .forEach(workspaceFolder => {
        const conn: any = config("conn", workspaceFolder.name);
        if (conn.active && conn.ns) {
          node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData, {});
          rootNodes.push(node);

          this._showExtra4Workspace.forEach(ns => {
            node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData, {
              namespace: ns,
              extraNode: true,
            });
            rootNodes.push(node);
          });
        }
      });
    return rootNodes;
  }
}
