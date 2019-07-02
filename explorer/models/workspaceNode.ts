import * as vscode from "vscode";

import { AtelierAPI } from "../../api";
import { NodeBase } from "./nodeBase";
import { RootNode } from "./rootNode";

export class WorkspaceNode extends NodeBase {

  constructor(
    public readonly label: string,
    public eventEmitter: vscode.EventEmitter<NodeBase>,
    namespace?: string,
  ) {
    super(label, label, namespace);
  }

  // get ns(): string {
  //   return this._namespace;
  // }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `serverNode${this.extraNode ? "Extra:" + this.namespace : ""}`,
      label: `${this.label}${this.extraNode ? `[${this.namespace}]` : ""}`,
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    const children = [];
    let node: RootNode;
    let data: any;

    data = await this.getDocNames("CLS");
    node = new RootNode("Classes", "dataRootNode:classesRootNode",
      this.eventEmitter, data, this.workspaceFolder, this.namespace);
    children.push(node);

    data = await this.getDocNames("RTN");
    node = new RootNode("Routines", "dataRootNode:routinesRootNode",
      this.eventEmitter, data, this.workspaceFolder, this.namespace);
    children.push(node);

    return children;
  }

  public getDocNames(category: string): Promise<any> {
    const sql = `SELECT Name name
      FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?)
    `;
    let spec;
    const notStudio = 0;
    switch (category) {
      case "CLS":
        spec = "*.cls";
        break;
      case "RTN":
        spec = "*.mac,*.int,*.inc";
        break;
      default:
        return;
    }
    const direction = 1;
    const orderBy = 1; // by Name
    const flat = 1;
    const generated = 0;
    const filter = "";

    const systemFiles = (this.namespace === "%SYS") ? "1" : "0";

    const api = new AtelierAPI(this.label);
    api.setNamespace(this.namespace);
    return api
      .actionQuery(sql, [
        spec,
        direction,
        orderBy,
        systemFiles,
        flat,
        notStudio,
        generated,
        filter,
      ])
      .then((data) => {
        const content = data.result.content;
        return content;
      });
  }
}
