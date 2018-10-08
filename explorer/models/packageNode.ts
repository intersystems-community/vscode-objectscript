import * as vscode from 'vscode';
import { NodeBase } from './nodeBase';
import { ClassNode } from './classesNode';

export class PackageNode extends NodeBase {

    constructor(
        public readonly label: string,
        private readonly _items,
    ) {
        super(label)
    }

    getTreeItem(): vscode.TreeItem {
        let displayName: string = this.label;

        return {
            label: `${displayName}`,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            contextValue: "packageNode",
            // iconPath: {
            //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'package.svg'),
            //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'package.svg')
            // }
        }
    }

    async getChildren(element): Promise<NodeBase[]> {
      return this._items.map(({name, fullName, nodes}) => nodes.length ? new PackageNode(name, nodes) : new ClassNode(name, fullName));
    }

}
