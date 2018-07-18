import * as vscode from "vscode";
import { NodeBase } from "./models/nodeBase";
import { RootNode } from "./models/rootNode";
import { resolve } from "url";

export class COSExplorerProvider implements vscode.TreeDataProvider<NodeBase>, vscode.TextDocumentContentProvider {
  onDidChange?: vscode.Event<vscode.Uri>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase> = new vscode.EventEmitter<NodeBase>();
  readonly onDidChangeTreeData: vscode.Event<NodeBase> = this._onDidChangeTreeData.event;
  private _classesNode: RootNode;
  private _routinesNode: RootNode;
  private _api;

  constructor() { }

  setAPI(api): void {
    this._api = api;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(this._classesNode);
    this._onDidChangeTreeData.fire(this._routinesNode);
  }

  getTreeItem(element: NodeBase): vscode.TreeItem {
    return element.getTreeItem();
  }

  async getChildren(element?: NodeBase): Promise<NodeBase[]> {
    if (!element) {
      return this.getRootNodes();
    }
    return element.getChildren(element);
  }

  private async getRootNodes(): Promise<RootNode[]> {
    const rootNodes: RootNode[] = [];
    let node: RootNode;
    let data: any;

    data = await this.getDocNames("CLS");
    node = new RootNode("Classes", "classesRootNode", this._onDidChangeTreeData, data);
    this._classesNode = node;
    rootNodes.push(node);

    data = await this.getDocNames("RTN");
    node = new RootNode("Routines", "routinesRootNode", this._onDidChangeTreeData, data);
    this._routinesNode = node;
    rootNodes.push(node);

    return rootNodes;
  }

  getDocNames(category: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this._api.getDocNames({
        category
      }, (error, data) => {
        if (error) {
          reject(error);
        } else {
          let content = data.result.content;
          resolve(content);
        }
      });
  });
  }

  provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    let fileName = uri.path.split('/')[1];
    return new Promise((resolve, reject) => {
      this._api.getDoc(fileName,
        (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data.result.content.join('\n'));
        }
      });
    });
  }
}
