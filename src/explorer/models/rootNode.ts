import * as vscode from "vscode";

import { NodeBase } from "./nodeBase";
import { PackageNode } from "./packageNode";
import { RoutineNode } from "./routineNode";
import { AtelierAPI } from "../../api";
import { ClassNode } from "./classesNode";

export class RootNode extends NodeBase {
  public readonly contextValue: string;
  private readonly _category: string;

  public constructor(
    label: string,
    fullName: string,
    contextValue: string,
    category: string,
    workspaceFolder: string,
    namespace: string
  ) {
    super(label, fullName, workspaceFolder, namespace);
    this.contextValue = contextValue;
    this._category = category;
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
  public getItems(path: string, category: string): Promise<NodeBase[]> {
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
      default:
        return;
    }
    const direction = "1";
    const orderBy = "1"; // by Name
    const flat = "0";
    const notStudio = "0";
    const generated = "0";

    spec = path + spec;

    const systemFiles = this.namespace === "%SYS" ? "1" : "0";

    const api = new AtelierAPI(this.workspaceFolder);
    api.setNamespace(this.namespace);
    return api
      .actionQuery(sql, [spec, direction, orderBy, systemFiles, flat, notStudio, generated])
      .then(data => {
        const content = data.result.content;
        return content;
      })
      .then(data =>
        data
          .map(el => {
            const fullName = (this instanceof PackageNode ? this.fullName + "." : "") + el.Name;
            switch (el.Type) {
              case "9":
                return new PackageNode(el.Name, fullName, category, this.workspaceFolder, this.namespace);
              case "4":
                return new ClassNode(el.Name, fullName, this.workspaceFolder, this.namespace);
              case "0":
              case "1":
              case "2":
                return new RoutineNode(el.Name, fullName, this.workspaceFolder, this.namespace);
              default:
                return null;
            }
          })
          .filter(el => el !== null)
      );
  }
}
