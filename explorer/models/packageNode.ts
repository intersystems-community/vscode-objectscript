import * as vscode from "vscode";
import { ClassNode } from "./classesNode";
import { NodeBase } from "./nodeBase";

export class PackageNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:packageNode";
  constructor(
    public readonly label: string,
    private readonly _items,
    private readonly _workspaceFolder: string,
    private _namespace: string,
  ) {
    super(label);
  }

  get workspaceFolder(): string {
    return this._workspaceFolder;
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: "dataNode:packageNode",
      label: `${displayName}`,
      // iconPath: {
      //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'package.svg'),
      //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'package.svg')
      // }
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    return this._items.map(({ name, fullName, nodes }) =>
      nodes.length
        ? new PackageNode(name, nodes, this._workspaceFolder, this._namespace)
        : new ClassNode(name, fullName, this._workspaceFolder, this._namespace),
    );
  }

  public getClasses(): string[] {
    const getNodes = (list, el) => list.concat(el.nodes.length ? el.nodes.reduce(getNodes, []) : el);
    const nodes = this._items.reduce(getNodes, []);
    return nodes.map((el) => el.fullName);
  }
}
