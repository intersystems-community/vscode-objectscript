import * as vscode from "vscode";
import { NodeBase } from "./models/nodeBase";

import { AtelierAPI } from "../api";
import { config, projectsExplorerProvider } from "../extension";
import { WorkspaceNode } from "./models/workspaceNode";
import { outputChannel } from "../utils";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

/** Get the URI for this leaf node */
export function getLeafNodeUri(node: NodeBase, forceServerCopy = false): vscode.Uri {
  if (node.workspaceFolder == undefined) {
    // Should only be the case for leaf nodes in the projects explorer
    // that are children of an extra server namepsace node
    return DocumentContentProvider.getUri(
      node.fullName,
      undefined,
      undefined,
      true,
      node.workspaceFolderUri,
      forceServerCopy
    );
  } else {
    return DocumentContentProvider.getUri(
      node.fullName,
      node.workspaceFolder,
      node.namespace,
      undefined,
      undefined,
      forceServerCopy
    );
  }
}

/**
 * The vscode-objectscript.explorer.open command is not listed in settings.json as a contribution because it only gets invoked
 * from the user's click on an item in the `ObjectScriptExplorerProvider` or `ProjectsExplorerProvider` tree.
 * It serves as a proxy for `vscode.window.showTextDocument()`, detecting two opens of the same item in quick succession
 * and treating the second of these as a non-preview open.
 */
export function registerExplorerOpen(explorerProvider: ObjectScriptExplorerProvider): vscode.Disposable {
  return vscode.commands.registerCommand(
    "vscode-objectscript.explorer.open",
    async function (uri: vscode.Uri, project?: string, fullName?: string) {
      let usePreview = <boolean>vscode.workspace.getConfiguration("workbench.editor").get("enablePreview");

      if (usePreview) {
        usePreview = !wasDoubleClick(uri, explorerProvider);
      }

      try {
        await vscode.window.showTextDocument(uri, { preview: usePreview });
      } catch (error) {
        if (project && fullName) {
          // This project item no longer exists on the server
          // Ask the user if they would like to remove it from the project
          const remove = await vscode.window.showErrorMessage(
            `Document '${fullName}' does not exist on the server. Remove it from project '${project}'?`,
            { modal: true },
            "Yes",
            "No"
          );
          if (remove == "Yes") {
            const api = new AtelierAPI(uri);
            try {
              // Remove the item from the project
              let prjFileName = fullName.startsWith("/") ? fullName.slice(1) : fullName;
              const ext = prjFileName.split(".").pop().toLowerCase();
              prjFileName = ext == "cls" ? prjFileName.slice(0, -4) : prjFileName;
              const prjType = prjFileName.includes("/")
                ? "CSP"
                : ext == "cls"
                ? "CLS"
                : ["mac", "int", "inc"].includes(ext)
                ? "MAC"
                : "OTH";
              await api.actionQuery("DELETE FROM %Studio.ProjectItem WHERE Project = ? AND LOWER(Name||Type) = ?", [
                project,
                `${prjFileName}${prjType}`.toLowerCase(),
              ]);
            } catch (error) {
              let message = `Failed to remove '${fullName}' from project '${project}'.`;
              if (error && error.errorText && error.errorText !== "") {
                outputChannel.appendLine("\n" + error.errorText);
                outputChannel.show(true);
                message += " Check 'ObjectScript' output channel for details.";
              }
              return vscode.window.showErrorMessage(message, "Dismiss");
            }

            // Refresh the explorer
            projectsExplorerProvider.refresh();
          }
        } else {
          throw error;
        }
      }
    }
  );
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
      .then((ns) => this.showExtra4Workspace(workspaceFolder, ns.label))
      .catch(() => null);
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
