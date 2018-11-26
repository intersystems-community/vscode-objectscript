import * as vscode from 'vscode';
import { NodeBase } from './nodeBase';
import { OBJECTSCRIPT_FILE_SCHEMA } from '../../extension';

export class ClassNode extends NodeBase {
  public static readonly contextValue: string = 'classNode';
  constructor(public readonly label: string, public readonly fullName: string) {
    super(label);
  }

  getTreeItem(): vscode.TreeItem {
    let displayName: string = this.label;

    return {
      label: `${displayName}`,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'classNode',
      command: {
        command: 'vscode-objectscript.explorer.openClass',
        arguments: [vscode.Uri.parse(encodeURI(`${OBJECTSCRIPT_FILE_SCHEMA}:///${this.fullName}`))],
        title: 'Open class'
      }
      // iconPath: {
      //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'class.svg'),
      //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'class.svg')
      // }
    };
  }
}
