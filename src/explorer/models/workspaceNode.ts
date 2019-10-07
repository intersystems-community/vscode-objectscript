import * as vscode from "vscode";

import { NodeBase } from "./nodeBase";
import { RootNode } from "./rootNode";

export class WorkspaceNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;
  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, namespace?: string) {
    super(label, label, label, namespace);
    this.eventEmitter = eventEmitter;
  }

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

    node = new RootNode("Classes", "", "dataRootNode:classesRootNode", "CLS", this.workspaceFolder, this.namespace);
    children.push(node);

    node = new RootNode("Routines", "", "dataRootNode:routinesRootNode", "RTN", this.workspaceFolder, this.namespace);
    children.push(node);

    node = new RootNode("Includes", "", "dataRootNode:routinesRootNode", "INC", this.workspaceFolder, this.namespace);
    children.push(node);

    return children;
  }
}
