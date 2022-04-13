import * as vscode from "vscode";
import { NodeBase, NodeOptions } from "./nodeBase";
import { ProjectRootNode } from "./projectRootNode";

export class ProjectNode extends NodeBase {
  private description: string;
  public constructor(label: string, options: NodeOptions, description: string) {
    super(label, `${label}.PRJ`, options);
    this.description = description;
  }

  public async getChildren(_element: NodeBase): Promise<NodeBase[]> {
    const children = [];
    let node: ProjectRootNode;

    node = new ProjectRootNode(
      "Classes",
      "",
      "dataRootNode:classesRootNode",
      "CLS",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-class")
    );
    children.push(node);

    node = new ProjectRootNode(
      "Routines",
      "",
      "dataRootNode:routinesRootNode",
      "RTN",
      this.options,
      false,
      new vscode.ThemeIcon("note")
    );
    children.push(node);

    node = new ProjectRootNode(
      "Includes",
      "",
      "dataRootNode:routinesRootNode",
      "INC",
      this.options,
      false,
      new vscode.ThemeIcon("file-symlink-file")
    );
    children.push(node);

    node = new ProjectRootNode(
      "CSP Files",
      "",
      "dataRootNode:cspRootNode",
      "CSP",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-file")
    );
    children.push(node);

    node = new ProjectRootNode(
      "Other",
      "",
      "dataRootNode:otherRootNode",
      "OTH",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-misc")
    );
    children.push(node);

    return children;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: "dataNode:projectNode",
      label: this.label,
      tooltip: this.description,
      iconPath: new vscode.ThemeIcon("files"),
    };
  }

  public getItems4Export(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
