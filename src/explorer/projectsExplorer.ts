import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { notIsfs } from "../utils";
import { NodeBase, ProjectsServerNsNode } from "./nodes";

export class ProjectsExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  public onDidChangeTreeData: vscode.Event<NodeBase>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase>;

  /** The labels of all current root nodes */
  private _roots: string[] = [];

  /** The server:ns string for all extra root nodes */
  private readonly _extraRoots: string[] = [];

  public constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter<NodeBase>();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
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

  public openExtraServerNs(serverNs: { serverName: string; namespace: string }): void {
    // Check if this server namespace is already open
    if (this._roots.includes(`${serverNs.serverName}[${serverNs.namespace}]`)) {
      vscode.window.showWarningMessage(
        `Namespace '${serverNs.namespace}' on server '${serverNs.serverName}' is already open in the Projects Explorer`,
        "Dismiss"
      );
      return;
    }
    // Add the extra root node
    this._extraRoots.push(`${serverNs.serverName}:${serverNs.namespace}`);
    // Refresh the explorer
    this.refresh();
  }

  public closeExtraServerNs(node: ProjectsServerNsNode): void {
    const label = <string>node.getTreeItem().label;
    const serverName = label.slice(0, label.lastIndexOf("["));
    const namespace = label.slice(label.lastIndexOf("[") + 1, -1);
    const idx = this._extraRoots.findIndex((authority) => authority == `${serverName}:${namespace}`);
    if (idx != -1) {
      // Remove the extra root node
      this._extraRoots.splice(idx, 1);
      // Refresh the explorer
      this.refresh();
    }
  }

  private async getRootNodes(): Promise<NodeBase[]> {
    const rootNodes: NodeBase[] = [];
    let node: NodeBase;

    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const alreadyAdded: string[] = [];
    // Add the workspace root nodes
    workspaceFolders
      .filter((workspaceFolder) => workspaceFolder.uri && !notIsfs(workspaceFolder.uri))
      .forEach((workspaceFolder) => {
        const conn = new AtelierAPI(workspaceFolder.uri).config;
        if (conn.active && conn.ns) {
          node = new ProjectsServerNsNode(workspaceFolder.name, this._onDidChangeTreeData, workspaceFolder.uri);
          const label = <string>node.getTreeItem().label;
          if (!alreadyAdded.includes(label)) {
            alreadyAdded.push(label);
            rootNodes.push(node);
          }
        }
      });
    // Add the extra root nodes
    this._extraRoots.forEach((authority) => {
      node = new ProjectsServerNsNode(
        "",
        this._onDidChangeTreeData,
        vscode.Uri.parse(`isfs-readonly://${authority}/`),
        true
      );
      const label = <string>node.getTreeItem().label;
      if (!alreadyAdded.includes(label)) {
        alreadyAdded.push(label);
        rootNodes.push(node);
      }
    });
    this._roots = alreadyAdded;
    await vscode.commands.executeCommand(
      "setContext",
      "vscode-objectscript.projectsExplorerRootCount",
      rootNodes.length
    );
    return rootNodes;
  }
}
