import * as vscode from "vscode";

import { NodeBase, NodeOptions } from "./nodeBase";
import { PackageNode } from "./packageNode";
import { RoutineNode } from "./routineNode";
import { AtelierAPI } from "../../api";
import { ClassNode } from "./classesNode";

export class RootNode extends NodeBase {
  public readonly contextValue: string;
  private readonly _category: string;

  public constructor(label: string, fullName: string, contextValue: string, category: string, options: NodeOptions) {
    super(label, fullName, options);
    this.contextValue = contextValue;
    this._category = category;
  }

  public get category(): string {
    return this._category;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: this.label,
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    const path = this instanceof PackageNode ? this.fullName + "/" : "";
    return this.getItems(path, this._category);
  }

  public getList(path: string, category: string, flat: boolean) {
    const sql = "CALL %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)";
    // const sql = "CALL %Library.RoutineMgr_StudioOpenDialog(?,,,,,,?)";
    let spec = "";
    switch (category) {
      case "CLS":
        spec = "*.cls";
        break;
      case "RTN":
        spec = "*.mac,*.int";
        break;
      case "INC":
        spec = "*.inc";
        break;
      case "ALL":
        spec = "*.cls,*.mac,*.int,*.inc";
        break;
      default:
        return;
    }
    const direction = "1";
    const orderBy = "1"; // by Name
    const notStudio = "0";
    const generated = this.options.generated ? "1" : "0";

    spec = path + spec;

    const systemFiles = this.namespace === "%SYS" ? "1" : "0";

    const api = new AtelierAPI(this.workspaceFolder);
    api.setNamespace(this.namespace);
    return api
      .actionQuery(sql, [spec, direction, orderBy, systemFiles, flat ? "1" : "0", notStudio, generated])
      .then(data => {
        const content = data.result.content;
        return content;
      })
      .then(data =>
        data.map(el => {
          const fullName = (this instanceof PackageNode ? this.fullName + "." : "") + el.Name;
          return {
            ...el,
            fullName,
          };
        })
      );
  }

  public getItems(path: string, category: string): Promise<NodeBase[]> {
    return this.getList(path, category, false).then(data =>
      data
        .map(el => {
          switch (el.Type) {
            case "9":
              return new PackageNode(el.Name, el.fullName, category, this.options);
            case "4":
              return new ClassNode(el.Name, el.fullName, this.options);
            case "0":
            case "1":
            case "2":
              return new RoutineNode(el.Name, el.fullName, this.options);
            default:
              return null;
          }
        })
        .filter(el => el !== null)
    );
  }

  public getItems4Export(): Promise<string[]> {
    const path = this instanceof PackageNode ? this.fullName + "/" : "";
    return this.getList(path, "ALL", true).then(data => data.map(el => el.Name));
  }
}
