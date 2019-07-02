import * as vscode from "vscode";

import { NodeBase } from "./nodeBase";
import { PackageNode } from "./packageNode";
import { RoutineNode } from "./routineNode";

export class RootNode extends NodeBase {
  constructor(
    public readonly label: string,
    public readonly contextValue: string,
    public eventEmitter: vscode.EventEmitter<NodeBase>,
    private _items: any[],
    workspaceFolder: string,
    namespace: string,
  ) {
    super(label, workspaceFolder, namespace);
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: this.label,
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    if (element.contextValue === "dataRootNode:classesRootNode") {
      return this.getClasses();
    }

    if (element.contextValue === "dataRootNode:routinesRootNode") {
      return this.getRoutines();
    }
  }

  private async getClasses(): Promise<PackageNode[]> {
    const items = this.makeTree(this._items);

    return items.map(({ name, nodes }) => new PackageNode(name, nodes, this.workspaceFolder, this.namespace));
  }

  private async getRoutines(): Promise<RoutineNode[]> {
    return this._items.map(({ name }) => new RoutineNode(name, name, this.workspaceFolder, this.namespace));
  }

  private makeTree(items: any[]): any[] {
    let tree;
    tree = items.map(({ name }) => ({ name }));
    tree.forEach((el) => {
      const parent = el.name.split(".").slice(0, -2);
      el.parent = parent.join(".");
      el.fullName = el.name;
      el.name = el.name
        .split(".")
        .slice(-2)
        .join(".");
      const parents = parent.map((name, i) => {
        return { name, fullName: parent.slice(0, i + 1).join("."), parent: parent.slice(0, i).join(".") };
      });
      tree = tree.concat(parents);
    });
    tree = tree.filter((value, index, self) => self.findIndex(({ fullName }) => fullName === value.fullName) === index);
    tree = tree.sort((el1, el2) => el1.fullName.localeCompare(el2.fullName));
    tree.forEach((el) => {
      el.nodes = tree.filter((ch) => el.fullName === ch.parent);
    });
    tree = tree.filter((el) => el.parent === "");

    return tree;
  }
}
