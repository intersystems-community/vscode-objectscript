import vscode = require('vscode');
const { workspace, window } = vscode;
export const OBJECTSCRIPT_FILE_SCHEMA = 'objectscript';

const panel = require('./status-bar-panel');

import { viewOthers } from './commands/viewOthers';
import { importAndCompile } from './commands/compile';
import { exportAll } from './commands/export';

import { ObjectScriptClassSymbolProvider } from './providers/ObjectScriptClassSymbolProvider';
import { ObjectScriptRoutineSymbolProvider } from './providers/ObjectScriptRoutineSymbolProvider';

import { ObjectScriptExplorerProvider } from './explorer/explorer';
import { outputChannel } from './utils';
import { AtelierAPI } from './api';
export var explorerProvider: ObjectScriptExplorerProvider;

export const config = () => {
  return vscode.workspace.getConfiguration('objectscript');
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const languages = require(context.asAbsolutePath('./package.json'))['contributes']['languages'].map(lang => lang.id);
  const api = new AtelierAPI();

  explorerProvider = new ObjectScriptExplorerProvider();
  vscode.window.registerTreeDataProvider('ObjectScriptExplorer', explorerProvider);

  const panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  panel.command = 'vscode-objectscript.output';
  panel.tooltip = 'Open output';
  panel.show();
  const checkConnection = () => {
    const conn = config().conn;
    panel.text = `${conn.label}:${conn.ns}`;
    api
      .serverInfo()
      .then(info => {
        panel.text = `${conn.label}:${conn.ns} - Connected`;
      })
      .catch(error => {
        panel.text = `${conn.label}:${conn.ns} - ERROR`;
      });
  };
  checkConnection();
  vscode.workspace.onDidChangeConfiguration(() => {
    checkConnection();
  });

  workspace.onDidSaveTextDocument(file => {
    if (!config().get('autoCompile') || !languages.includes(file.languageId)) {
      return;
    }
    vscode.commands.executeCommand('vscode-objectscript.compile');
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('vscode-objectscript.output', () => {
      outputChannel.show();
    }),
    vscode.commands.registerCommand('vscode-objectscript.compile', importAndCompile),
    vscode.commands.registerCommand('vscode-objectscript.compileWithFlags', () => importAndCompile(true)),
    vscode.commands.registerCommand('vscode-objectscript.export', exportAll),
    vscode.commands.registerCommand('vscode-objectscript.viewOthers', viewOthers),
    vscode.commands.registerCommand('vscode-objectscript.explorer.refresh', () => explorerProvider.refresh()),
    vscode.commands.registerCommand('vscode-objectscript.explorer.openClass', vscode.window.showTextDocument),
    vscode.commands.registerCommand('vscode-objectscript.explorer.openRoutine', vscode.window.showTextDocument),
    vscode.commands.registerCommand('vscode-objectscript.explorer.showSystem', () => {
      vscode.commands.executeCommand('setContext', 'vscode-objectscript.explorer.showSystem', true);
      explorerProvider.showSystem = true;
    }),
    vscode.commands.registerCommand('vscode-objectscript.explorer.hideSystem', () => {
      vscode.commands.executeCommand('setContext', 'vscode-objectscript.explorer.showSystem', false);
      explorerProvider.showSystem = false;
    }),
    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPT_FILE_SCHEMA, explorerProvider),
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'objectscript-class' },
      new ObjectScriptClassSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      { language: 'objectscript-routine' },
      new ObjectScriptRoutineSymbolProvider()
    )
  );
}

export async function deactivate() {}
