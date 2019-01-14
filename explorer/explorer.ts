import * as vscode from 'vscode';
import { NodeBase } from './models/nodeBase';
import { RootNode } from './models/rootNode';
import { AtelierAPI } from './../api';

import { config } from '../extension';

export class ObjectScriptExplorerProvider implements vscode.TreeDataProvider<NodeBase> {
  onDidChange?: vscode.Event<vscode.Uri>;
  private _onDidChangeTreeData: vscode.EventEmitter<NodeBase> = new vscode.EventEmitter<NodeBase>();
  readonly onDidChangeTreeData: vscode.Event<NodeBase> = this._onDidChangeTreeData.event;
  private _classesNode: RootNode;
  private _routinesNode: RootNode;
  private _api: AtelierAPI;
  private _showSystem = false;

  private get _namespace(): string {
    return config().conn.ns;
  }

  constructor() {
    this._api = new AtelierAPI();
  }

  get showSystem(): boolean {
    return this._showSystem;
  }

  set showSystem(value) {
    this._showSystem = value;
    this._onDidChangeTreeData.fire(null);
  }

  refresh(): void {
    this._api = new AtelierAPI();
    this._onDidChangeTreeData.fire(null);
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

    data = await this.getDocNames('CLS');
    node = new RootNode('Classes', 'classesRootNode', this._onDidChangeTreeData, data);
    this._classesNode = node;
    rootNodes.push(node);

    data = await this.getDocNames('RTN');
    node = new RootNode('Routines', 'routinesRootNode', this._onDidChangeTreeData, data);
    this._routinesNode = node;
    rootNodes.push(node);

    return rootNodes;
  }

  getDocNames(category: string): Promise<any> {
    const excludeSystem =
      this._showSystem || this._namespace === '%SYS'
        ? () => true
        : ({ db }) => !['IRISLIB', 'IRISSYS', 'CACHELIB', 'CACHESYS'].includes(db);

    return this._api
      .getDocNames({
        category
      })
      .then(data => {
        let content = data.result.content;
        return content.filter(excludeSystem);
      });
  }
}
