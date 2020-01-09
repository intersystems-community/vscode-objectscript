import * as vscode from "vscode";

import { NodeBase, NodeOptions } from "./nodeBase";
import { RootNode } from "./rootNode";
import { workspaceState } from "../../extension";

export class WorkspaceNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;
  public uniqueId: string;
  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, options: NodeOptions) {
    super(label, label, options);
    this.uniqueId = `serverNode${this.extraNode ? ":extra:" + this.namespace : ""}`;
    this.options.generated = workspaceState.get(`ExplorerGenerated:${this.uniqueId}`);
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `${this.uniqueId}${this.options.generated ? ":generated:" : ""}`,
      label: `${this.label}(${this.connInfo})`,
    };
  }

  public async getChildren(element): Promise<NodeBase[]> {
    const children = [];
    let node: RootNode;

    node = new RootNode("Classes", "", "dataRootNode:classesRootNode", "CLS", this.options);
    children.push(node);

    node = new RootNode("Routines", "", "dataRootNode:routinesRootNode", "RTN", this.options);
    children.push(node);

    node = new RootNode("Includes", "", "dataRootNode:routinesRootNode", "INC", this.options);
    children.push(node);

    return children;
  }
}
