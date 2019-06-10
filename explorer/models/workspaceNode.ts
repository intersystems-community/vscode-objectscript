import * as vscode from "vscode";

import { AtelierAPI } from "../../api";
import { config } from "../../extension";
import { NodeBase } from "./nodeBase";
import { RootNode } from "./rootNode";

export class WorkspaceNode extends NodeBase {
  private _conn: any;
  private _extraNode: boolean;

  constructor(
    public readonly label: string,
    public eventEmitter: vscode.EventEmitter<NodeBase>,
    private _namespace?: string,
  ) {
    super(label);
    this._conn = config("conn", this.label);
    this._namespace = _namespace || this._conn.ns;
    this._extraNode = (this._conn.ns !== this._namespace);
  }

  get ns(): string {
    return this._namespace;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `serverNode${this._extraNode ? "Extra:" + this._namespace : ""}`,
      label: `${this.label}${this._extraNode ? `[${this._namespace}]` : ""}`,
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    const children = [];
    let node: RootNode;
    let data: any;
    const workspaceFolder = element.label;

    data = await this.getDocNames("CLS");
    node = new RootNode("Classes", "dataRootNode:classesRootNode",
      this.eventEmitter, data, workspaceFolder, this._namespace);
    children.push(node);

    data = await this.getDocNames("RTN");
    node = new RootNode("Routines", "dataRootNode:routinesRootNode",
      this.eventEmitter, data, workspaceFolder, this._namespace);
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

    const systemFiles = (this._namespace === "%SYS") ? "1" : "0";

    const api = new AtelierAPI(this.label);
    api.setNamespace(this._namespace);
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
