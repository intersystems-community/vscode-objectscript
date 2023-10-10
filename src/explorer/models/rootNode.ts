import * as vscode from "vscode";

import { NodeBase, NodeOptions } from "./nodeBase";
import { PackageNode } from "./packageNode";
import { RoutineNode } from "./routineNode";
import { AtelierAPI } from "../../api";
import { ClassNode } from "./classNode";
import { CSPFileNode } from "./cspFileNode";
import { cspApps } from "../../extension";

type IconPath =
  | string
  | vscode.Uri
  | {
      light: string | vscode.Uri;
      dark: string | vscode.Uri;
    }
  | vscode.ThemeIcon;

export class RootNode extends NodeBase {
  public readonly contextValue: string;
  private readonly _category: string;
  private readonly isCsp: boolean;
  private readonly iconPath: IconPath;

  public constructor(
    label: string,
    fullName: string,
    contextValue: string,
    category: string,
    options: NodeOptions,
    isCsp = false,
    iconPath?: IconPath
  ) {
    super(label, fullName, options);
    this.contextValue = contextValue;
    this._category = category;
    this.isCsp = isCsp;
    this.iconPath = iconPath;
  }

  public get category(): string {
    return this._category;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: this.label,
      tooltip: this.isCsp ? this.fullName : undefined,
      iconPath: this.iconPath,
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    const path = this instanceof PackageNode || this.isCsp ? this.fullName + "/" : "";
    return this.getItems(path, this._category);
  }

  public async getList(
    path: string,
    category: string,
    flat: boolean
  ): Promise<{ Name: string; Type: string; fullName: string }[]> {
    const sql = "SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)";
    let spec = "";
    switch (category) {
      case "CLS":
        spec = "*.cls";
        break;
      case "RTN":
        spec = "*.mac,*.int,*.bas";
        break;
      case "INC":
        spec = "*.inc";
        break;
      case "ALL":
        spec = "*.cls,*.mac,*.int,*.inc";
        break;
      case "CSP":
        spec = "*";
        break;
      case "OTH":
        spec = "*.other";
        break;
      default:
        return;
    }
    const direction = "1";
    const orderBy = "1"; // by Name
    const notStudio = "0";
    const generated = this.options.generated ? "1" : "0";

    spec = path + spec;

    const systemFiles = this.options.system || this.namespace === "%SYS" ? "1" : "0";

    const api = new AtelierAPI(this.workspaceFolder);
    api.setNamespace(this.namespace);
    if (category == "CSP" && path == "") {
      // Use the results from the getCSPApps() API
      const cspAppsKey = (
        api.config.serverName && api.config.serverName != ""
          ? `${api.config.serverName}:${api.config.ns}`
          : `${api.config.host}:${api.config.port}${api.config.pathPrefix}:${api.config.ns}`
      ).toLowerCase();
      let nsCspApps: string[] | undefined = cspApps.get(cspAppsKey);
      if (nsCspApps == undefined) {
        nsCspApps = await api.getCSPApps().then((data) => data.result.content || []);
        cspApps.set(cspAppsKey, nsCspApps);
      }
      return nsCspApps.map((cspApp) => {
        return { Name: cspApp.slice(1), fullName: cspApp.slice(1), Type: "10" };
      });
    } else {
      // Use StudioOpenDialog
      return api
        .actionQuery(sql, [spec, direction, orderBy, systemFiles, flat ? "1" : "0", notStudio, generated])
        .then((data) => {
          const content = data.result.content;
          return content;
        })
        .then((data) =>
          data.map((el: { Name: string; Type: number }) => {
            let fullName = el.Name;
            if (this instanceof PackageNode) {
              fullName = this.fullName + "." + el.Name;
            } else if (this.isCsp) {
              fullName = this.fullName + "/" + el.Name;
            }
            return {
              Name: el.Name,
              Type: String(el.Type),
              fullName,
            };
          })
        );
    }
  }

  public getItems(path: string, category: string): Promise<NodeBase[]> {
    return this.getList(path, category, false).then((data) =>
      data
        .filter((el) => {
          if (category === "OTH") {
            return el.Type === "100";
          } else if (category === "CSP") {
            return el.Type === "10" || el.Type === "5";
          } else {
            return true;
          }
        })
        .map((el) => {
          switch (el.Type) {
            case "9":
              return new PackageNode(el.Name, el.fullName, category, this.options);
            case "4":
            case "100":
              return new ClassNode(el.Name, el.fullName, this.options);
            case "5":
              return new CSPFileNode(el.Name, el.fullName, this.options);
            case "0":
            case "1":
            case "2":
            case "3":
            case "11":
              return new RoutineNode(el.Name, el.fullName, this.options);
            case "10":
              return new RootNode(el.Name, el.fullName, "dataNode:cspApplication", this._category, this.options, true);
            default:
              return null;
          }
        })
        .filter((el) => el !== null)
    );
  }

  public getItems4Export(): Promise<string[]> {
    const path = this instanceof PackageNode || this.isCsp ? this.fullName + "/" : "";
    const cat = this.isCsp ? "CSP" : "ALL";
    return this.getList(path, cat, true).then((data) => data.map((el) => el.Name));
  }
}
