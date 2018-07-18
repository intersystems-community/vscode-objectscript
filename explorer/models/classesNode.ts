import * as vscode from 'vscode';
import { NodeBase } from './nodeBase';

export class ClassNode extends NodeBase {

    constructor(
        public readonly label: string,
        public readonly fullName: string
    ) {
        super(label)
    }

    getTreeItem(): vscode.TreeItem {
        let displayName: string = this.label;

        return {
            label: `${displayName}`,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            contextValue: "classNode",
            command: {
              command: 'vscode-cos.explorer.openClass',
              arguments: [vscode.Uri.parse(encodeURI(`cos:///${this.fullName}`))],
              title: 'Open class'
            }
            // iconPath: {
            //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'class.svg'),
            //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'class.svg')
            // }
        }
    }
}
