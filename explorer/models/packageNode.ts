import * as vscode from "vscode";
import { ClassNode } from "./classesNode";
import { NodeBase } from "./nodeBase";

export class PackageNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:packageNode";
  constructor(
    public readonly label: string,
    private readonly _items,
    workspaceFolder: string,
    namespace: string,
  ) {
    super(label, workspaceFolder, namespace);
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
        ? new PackageNode(name, nodes, this.workspaceFolder, this.namespace)
        : new ClassNode(name, fullName, this.workspaceFolder, this.namespace),
    );
  }

  public getClasses(): string[] {
    const getNodes = (list, el) => list.concat(el.nodes.length ? el.nodes.reduce(getNodes, []) : el);
    const nodes = this._items.reduce(getNodes, []);
    return nodes.map((el) => el.fullName);
  }
}
