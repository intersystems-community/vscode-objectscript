import * as vscode from "vscode";
import { NodeBase } from "./models/nodeBase";

import { AtelierAPI } from "../api";
import { config } from "../extension";
import { WorkspaceNode } from "./models/workspaceNode";

// The vscode-objectscript.explorer.open command is not listed in settings.json as a contribution because it only gets invoked
//  from the user's click on an item in the ObjectScriptExplorerProvider tree.
// It serves as a proxy for the vscode.open command, detecting two opens of the same item in quick succession
//  and treating the second of these as a non-preview open.
export function registerExplorerOpen(explorerProvider: ObjectScriptExplorerProvider): vscode.Disposable {
  return vscode.commands.registerCommand("vscode-objectscript.explorer.open", async function (uri: vscode.Uri) {
    let usePreview = <boolean>vscode.workspace.getConfiguration("workbench.editor").get("enablePreview");

    if (usePreview) {
      usePreview = !wasDoubleClick(uri, explorerProvider);
    }

    await vscode.commands.executeCommand("vscode.open", uri, { preview: usePreview });
  });
}

// Return true if previously called with the same arguments within the past 0.5 seconds
function wasDoubleClick(uri: vscode.Uri, explorerProvider: ObjectScriptExplorerProvider): boolean {
  let result = false;
  if (explorerProvider.lastOpened) {
    const isTheSameUri = explorerProvider.lastOpened.uri === uri;
    const dateDiff = <number>(<any>new Date() - <any>explorerProvider.lastOpened.date);
    result = isTheSameUri && dateDiff < 500;
  }

  explorerProvider.lastOpened = {
    uri: uri,
    date: new Date(),
  };
  return result;
}
export class ObjectScriptExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  public onDidChange?: vscode.Event<vscode.Uri>;
  public onDidChangeTreeData: vscode.Event<NodeBase>;

  // Use for detecting doubleclick
  public lastOpened: { uri: vscode.Uri; date: Date };

  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase>;
  private _showExtra4Workspace: { [key: string]: string[] }[] = [];

  public constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter<NodeBase>();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  public async selectNamespace(workspaceFolder: string): Promise<any> {
    const extra4Workspace = this._showExtra4Workspace[workspaceFolder] || [];
    const api = new AtelierAPI(workspaceFolder);
    return api
      .serverInfo()
      .then((data) => data.result.content.namespaces)
      .then((data) => data.filter((ns) => ns !== api.ns && !extra4Workspace.includes(ns)))
      .then((data) => data.map((ns) => ({ label: ns })))
      .then((data) =>
        vscode.window.showQuickPick(data, {
          placeHolder: `Choose a namespace on ${api.config.host}:${api.config.port} to add to ObjectScript Explorer`,
        })
      )
      .then((ns) => this.showExtra4Workspace(workspaceFolder, ns.label));
  }

  public showExtra4Workspace(workspaceFolder: string, ns: string): void {
    const extra4Workspace = this._showExtra4Workspace[workspaceFolder] || [];
    if (!extra4Workspace.includes(ns)) {
      extra4Workspace.push(ns);
      this._showExtra4Workspace[workspaceFolder] = extra4Workspace;
      this._onDidChangeTreeData.fire(null);
    }
  }

  public closeExtra4Workspace(workspaceFolder: string, ns: string): void {
    const extra4Workspace = this._showExtra4Workspace[workspaceFolder] || [];
    const pos = extra4Workspace.indexOf(ns);
    if (pos >= 0) {
      extra4Workspace.splice(pos, 1);
      this._showExtra4Workspace[workspaceFolder] = extra4Workspace;
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
      .filter((workspaceFolder) => workspaceFolder.uri && workspaceFolder.uri.scheme === "file")
      .forEach((workspaceFolder) => {
        const conn: any = config("conn", workspaceFolder.name);
        if (conn.active && conn.ns) {
          const extra4Workspace = this._showExtra4Workspace[workspaceFolder.name] || [];
          node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData, {
            workspaceFolder: workspaceFolder.name,
          });
          rootNodes.push(node);

          extra4Workspace.forEach((ns) => {
            node = new WorkspaceNode(workspaceFolder.name, this._onDidChangeTreeData, {
              workspaceFolder: workspaceFolder.name,
              namespace: ns,
              extraNode: true,
            });
            rootNodes.push(node);
          });
        }
      });
    await vscode.commands.executeCommand("setContext", "vscode-objectscript.explorerRootCount", rootNodes.length);
    return rootNodes;
  }
}
