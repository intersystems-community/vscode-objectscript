import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { handleError, notIsfs, notNull } from "../utils";
import { NodeBase, ProjectsServerNsNode } from "./nodes";

export class ProjectsExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  public onDidChangeTreeData: vscode.Event<NodeBase>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase>;

  /** Connection info for all workspace folder roots */
  private readonly _roots: string[] = [];
  /** Info for all extra root nodes */
  private readonly _extraRoots: { wsFolder: vscode.WorkspaceFolder; ns: string; server: string }[] = [];

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

  public async openExtraServerNs(wsFolder: vscode.WorkspaceFolder): Promise<void> {
    try {
      const api = new AtelierAPI(wsFolder.uri);
      const connInfo = api.connInfo;
      const server = connInfo.split("[").shift();
      // Don't allow the user to pick a namespace that's already shown
      const alreadyShown = this._extraRoots
        .map((root) => (root.server == server ? root.ns : null))
        .concat(
          this._roots.map((root) => {
            const [rootServer, rootNs] = root.split("[");
            return rootServer == server ? rootNs.slice(0, -1) : null;
          })
        )
        .filter(notNull);
      const namespaces = await api
        .serverInfo()
        .then((data) => data.result.content.namespaces.filter((ns) => !alreadyShown.includes(ns)));
      if (namespaces.length == 0) {
        vscode.window.showInformationMessage(
          `All accessible namespaces on server '${server}' are shown in the Projects Explorer.`,
          "Dismiss"
        );
        return;
      }
      const ns = await vscode.window.showQuickPick(namespaces, {
        title: `Pick a namespace on '${server}' to show in the Projects Explorer`,
      });
      if (ns) {
        this._extraRoots.push({ wsFolder, ns, server });
        this.refresh();
      }
    } catch (error) {
      handleError(error, "Failed to fetch the list of accessible namespaces.");
    }
  }

  public closeExtraServerNs(node: ProjectsServerNsNode): void {
    const idx = this._extraRoots.findIndex(
      (root) => root.wsFolder.uri.toString() == node.wsFolder.uri.toString() && root.ns == node?.namespace
    );
    if (idx != -1) {
      this._extraRoots.splice(idx, 1);
      this.refresh();
    }
  }

  private async getRootNodes(): Promise<NodeBase[]> {
    const rootNodes: NodeBase[] = [];
    // Add a root for each unique server-side server-namespace
    for (const wsFolder of vscode.workspace.workspaceFolders ?? []) {
      if (notIsfs(wsFolder.uri)) continue;
      const api = new AtelierAPI(wsFolder.uri);
      if (!api.active) continue;
      const connInfo = api.connInfo;
      rootNodes.push(new ProjectsServerNsNode(connInfo, this._onDidChangeTreeData, wsFolder));
      this._roots.push(connInfo);
    }
    // Add the extra root nodes
    this._extraRoots.forEach((root) => {
      const api = new AtelierAPI(root.wsFolder.uri);
      api.setNamespace(root.ns);
      rootNodes.push(new ProjectsServerNsNode(api.connInfo, this._onDidChangeTreeData, root.wsFolder, root.ns));
    });
    await vscode.commands.executeCommand(
      "setContext",
      "vscode-objectscript.projectsExplorerRootCount",
      rootNodes.length
    );
    return rootNodes;
  }
}
