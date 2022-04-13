import * as vscode from "vscode";
import { AtelierAPI } from "../../api";
import { NodeBase } from "./nodeBase";
import { ProjectNode } from "./projectNode";

export class ProjectsServerNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;
  public uniqueId: string;
  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, wsUri: vscode.Uri) {
    super(label, label, { workspaceFolderUri: wsUri });
    this.uniqueId = `projectsServerNode:${this.workspaceFolder}`;
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    const { host, port, pathPrefix, serverName } = this.conn;
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: this.uniqueId,
      label: `${
        serverName && serverName.length ? serverName : `${host}:${port}${pathPrefix}`
      }:${this.namespace.toUpperCase()}`,
      iconPath: new vscode.ThemeIcon("server-environment"),
      tooltip: "Explore projects in this server namespace",
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    const api = new AtelierAPI(this.workspaceFolderUri);
    api.setNamespace(this.namespace);
    return api
      .actionQuery("SELECT Name, Description FROM %Studio.Project", [])
      .then((data) =>
        data.result.content.map(
          (project) => new ProjectNode(project.Name, { project: project.Name, ...this.options }, project.Description)
        )
      );
  }
}
