import * as vscode from 'vscode';

import { NodeBase } from './nodeBase';
import { RootNode } from './rootNode';
import { AtelierAPI } from '../../api';
import { config } from '../../extension';

export class WorkspaceNode extends NodeBase {
  private _conn: any;
  private _extraNode: boolean;

  constructor(
    public readonly label: string,
    public eventEmitter: vscode.EventEmitter<NodeBase>,
    private _namespace?: string
  ) {
    super(label);
    this._conn = config('conn', this.label);
    this._namespace = _namespace || this._conn.ns;
    this._extraNode = (this._conn.ns !== this._namespace);
  }

  get ns(): string {
    return this._namespace;
  }

  getTreeItem(): vscode.TreeItem {
    return {
      label: `${this.label}${this._extraNode ? `[${this._namespace}]` : ''}`,
      contextValue: `serverNode${this._extraNode ? 'Extra:' + this._namespace : ''}`,
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded
    };
  }

  async getChildren(element): Promise<NodeBase[]> {
    let children = [];
    let node: RootNode;
    let data: any;
    let workspaceFolder = element.label;

    data = await this.getDocNames('CLS');
    node = new RootNode('Classes', 'dataRootNode:classesRootNode', this.eventEmitter, data, workspaceFolder, this._namespace);
    children.push(node);

    data = await this.getDocNames('RTN');
    node = new RootNode('Routines', 'dataRootNode:routinesRootNode', this.eventEmitter, data, workspaceFolder, this._namespace);
    children.push(node);

    return children;
  }

  getDocNames(category: string): Promise<any> {
    const excludeSystem =
      this._namespace === '%SYS'
        ? () => true
        : ({ db }) => !['IRISLIB', 'IRISSYS', 'CACHELIB', 'CACHESYS'].includes(db);

    let api = new AtelierAPI();
    api.setNamespace(this._namespace);
    api.setConnection(this.label);
    return api
      .getDocNames({
        category
      })
      .then(data => {
        let content = data.result.content;
        return content.filter(excludeSystem);
      });
  }
}
