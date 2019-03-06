import * as vscode from 'vscode';
import { NodeBase } from './nodeBase';
import { DocumentContentProvider } from '../../providers/DocumentContentProvider';

export class RoutineNode extends NodeBase {
  public static readonly contextValue: string = 'routineNode';
  constructor(
    public readonly label: string,
    public readonly fullName: string,
    private _workspaceFolder: string,
    private _namespace: string
  ) {
    super(label);
  }

  get workspaceFolder(): string {
    return this._workspaceFolder;
  }

  getTreeItem(): vscode.TreeItem {
    let displayName: string = this.label;

    return {
      label: `${displayName}`,
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: 'routineNode',
      command: {
        command: 'vscode-objectscript.explorer.openRoutine',
        arguments: [DocumentContentProvider.getUri(this.fullName, this._workspaceFolder, this._namespace)],
        title: 'Open routine'
      }
      // iconPath: {
      //     light: path.join(__filename, '..', '..', '..', '..', 'images', 'light', 'routine.svg'),
      //     dark: path.join(__filename, '..', '..', '..', '..', 'images', 'dark', 'routine.svg')
      // }
    };
  }
}
