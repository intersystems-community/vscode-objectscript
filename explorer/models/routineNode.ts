import * as vscode from 'vscode';
import { NodeBase } from './nodeBase';
import { OBJECTSCRIPT_FILE_SCHEMA } from '../../extension';

export class RoutineNode extends NodeBase {
  public static readonly contextValue: string = 'routineNode';
  constructor(public readonly label: string, public readonly fullName: string) {
    super(label);
  }

  getTreeItem(): vscode.TreeItem {
    let displayName: string = this.label;

    return {
      label: `${displayName}`,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'routineNode',
      command: {
        command: 'vscode-objectscript.explorer.openRoutine',
        arguments: [vscode.Uri.parse(encodeURI(`${OBJECTSCRIPT_FILE_SCHEMA}:///${this.fullName}`))],
        title: 'Open routine'
      }
      // iconPath: {
      //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'routine.svg'),
      //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'routine.svg')
      // }
    };
  }
}
