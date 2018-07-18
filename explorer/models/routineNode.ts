import * as vscode from 'vscode';
import { NodeBase } from './nodeBase';

export class RoutineNode extends NodeBase {

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
            contextValue: "routineNode",
            command: {
              command: 'cosExplorer.openRoutine',
              arguments: [vscode.Uri.parse(encodeURI(`cos:///${this.fullName}`))],
              title: 'Open routine'
            }
            // iconPath: {
            //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'routine.svg'),
            //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'routine.svg')
            // }
        }
    }
}
