import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { documentContentProvider, OBJECTSCRIPT_FILE_SCHEMA, projectsExplorerProvider } from "../extension";
import { handleError, notIsfs } from "../utils";
import { StudioActions, OtherStudioAction } from "../commands/studio";
import { NodeBase, WorkspaceNode } from "./nodes";

/** Use for detecting doubleclick */
let lastOpened: { uri: vscode.Uri; date: Date };

/**
 * The vscode-objectscript.explorer.open command is not listed in settings.json as a contribution because it only gets invoked
 * from the user's click on an item in the `ObjectScriptExplorerProvider` or `ProjectsExplorerProvider` tree.
 * It serves as a proxy for `vscode.window.showTextDocument()`, detecting two opens of the same item in quick succession
 * and treating the second of these as a non-preview open.
 */
export function registerExplorerOpen(): vscode.Disposable {
  return vscode.commands.registerCommand(
    "vscode-objectscript.explorer.open",
    async function (uri: vscode.Uri, project?: string, fullName?: string) {
      let usePreview = <boolean>vscode.workspace.getConfiguration("workbench.editor").get("enablePreview");
      const double = wasDoubleClick(uri);
      if (usePreview) usePreview = !double;

      try {
        if (uri.scheme === OBJECTSCRIPT_FILE_SCHEMA) {
          const uriString = uri.toString();
          if (
            !double &&
            vscode.workspace.textDocuments.some((d) => d.uri.toString() == uriString) &&
            !vscode.window.tabGroups.all.some((tg) =>
              tg.tabs.some((t) => t.input instanceof vscode.TabInputText && t.input.uri.toString() == uriString)
            )
          ) {
            // Force an refresh from the server if the document was "closed", then "re-opened".
            // We define "closed" as "not in any tab", but still in VS Code's memory.
            // We don't need to do this if the document is not in VS Code's memory
            // because in that case the contents will be fetched from the server.
            documentContentProvider.update(uri);
          }
          // This scheme is implemented by our DocumentContentProvider, which always returns text.
          // If the server supplied binary data our provider substitutes a text explanation of how to work with binary content.
          await vscode.window.showTextDocument(uri, { preview: usePreview });
        } else {
          // This allows use of binary editors such as the Luna Paint extension.
          await vscode.workspace.fs.readFile(uri);
          await vscode.commands.executeCommand("vscode.open", uri, { preview: usePreview });
        }
      } catch (error) {
        if (Object.keys(error).length && project && fullName) {
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
              // Technically a project is a "document", so tell the server that we're editing it
              const studioActions = new StudioActions();
              await studioActions.fireProjectUserAction(api, project, OtherStudioAction.AttemptedEdit);
              if (studioActions.projectEditAnswer != "1") {
                // Don't perform the edit
                if (studioActions.projectEditAnswer == "-1") {
                  // Source control action failed
                  vscode.window.showErrorMessage(
                    `'AttemptedEdit' source control action failed for project '${project}'. Check the 'ObjectScript' Output channel for details.`,
                    "Dismiss"
                  );
                }
                return;
              }
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
              if (prjType == "OTH") {
                await api.actionQuery(
                  "DELETE FROM %Studio.ProjectItem WHERE Project = ? AND Name = ? AND Type NOT IN ('CLS','PKG','MAC','CSP','DIR','GBL')",
                  [project, prjFileName]
                );
              } else {
                await api.actionQuery("DELETE FROM %Studio.ProjectItem WHERE Project = ? AND LOWER(Name||Type) = ?", [
                  project,
                  `${prjFileName}${prjType}`.toLowerCase(),
                ]);
              }
              // Update the project's timestamp
              await api
                .actionQuery("UPDATE %Studio.Project SET LastModified = NOW() WHERE Name = ?", [project])
                .catch(() => {
                  // Swallow error because VS Code doesn't care about the timestamp
                });
            } catch (error) {
              handleError(error, `Failed to remove '${fullName}' from project '${project}'.`);
              return;
            }

            // Refresh the explorer
            projectsExplorerProvider.refresh();
          }
        } else {
          handleError(error);
        }
      }
    }
  );
}

// Return true if previously called with the same arguments within the past 0.5 seconds
function wasDoubleClick(uri: vscode.Uri): boolean {
  let result = false;
  if (lastOpened) {
    const isTheSameUri = lastOpened.uri === uri;
    const dateDiff = <number>(<any>new Date() - <any>lastOpened.date);
    result = isTheSameUri && dateDiff < 500;
  }

  lastOpened = {
    uri: uri,
    date: new Date(),
  };
  return result;
}

export class ObjectScriptExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  public onDidChange?: vscode.Event<vscode.Uri>;
  public onDidChangeTreeData: vscode.Event<NodeBase>;

  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase>;
  private _showExtraForWorkspace: { [key: string]: string[] }[] = [];

  public constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter<NodeBase>();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  public async showExtraForWorkspace(wsFolder: vscode.WorkspaceFolder): Promise<any> {
    try {
      const api = new AtelierAPI(wsFolder.uri);
      const extras = this._showExtraForWorkspace[wsFolder.name] ?? [];
      const namespaces = await api
        .serverInfo()
        .then((data) => data.result.content.namespaces.filter((ns) => ns != api.ns && !extras.includes(ns)));
      const server = api.connInfo.slice(0, api.connInfo.lastIndexOf("["));
      if (namespaces.length == 0) {
        vscode.window.showInformationMessage(
          `All accessible namespaces on server '${server}' are shown in the Explorer.`,
          "Dismiss"
        );
        return;
      }
      const ns = await vscode.window.showQuickPick(namespaces, {
        title: `Pick a namespace on '${server}' to show in the Explorer`,
      });
      if (ns) {
        extras.push(ns);
        this._showExtraForWorkspace[wsFolder.name] = extras;
        this._onDidChangeTreeData.fire(null);
      }
    } catch (error) {
      handleError(error, "Failed to fetch the list of accessible namespaces.");
    }
  }

  public closeExtraForWorkspace(workspaceFolder: string, ns: string): void {
    const extras = this._showExtraForWorkspace[workspaceFolder] || [];
    const pos = extras.indexOf(ns);
    if (pos >= 0) {
      extras.splice(pos, 1);
      this._showExtraForWorkspace[workspaceFolder] = extras;
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
    // Add a root for each client-side folder with an active server connection
    (vscode.workspace.workspaceFolders ?? []).forEach((wsFolder) => {
      if (notIsfs(wsFolder.uri) && new AtelierAPI(wsFolder.uri).active) {
        rootNodes.push(
          new WorkspaceNode(wsFolder.name, this._onDidChangeTreeData, {
            wsFolder: wsFolder,
          })
        );
        // Add a root for each extra node the user configured
        (this._showExtraForWorkspace[wsFolder.name] ?? []).forEach((ns: string) => {
          rootNodes.push(
            new WorkspaceNode(wsFolder.name, this._onDidChangeTreeData, {
              wsFolder: wsFolder,
              namespace: ns,
            })
          );
        });
      }
    });
    await vscode.commands.executeCommand("setContext", "vscode-objectscript.explorerRootCount", rootNodes.length);
    return rootNodes;
  }
}
