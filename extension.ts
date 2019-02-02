import vscode = require('vscode');
const { workspace, window } = vscode;
export const OBJECTSCRIPT_FILE_SCHEMA = 'objectscript';
export const OBJECTSCRIPTXML_FILE_SCHEMA = 'objectscriptxml';

import { viewOthers } from './commands/viewOthers';
import { importAndCompile } from './commands/compile';
import { exportAll, exportExplorerItem } from './commands/export';
import { xml2doc } from './commands/xml2doc';
import { subclass } from './commands/subclass';

import { ObjectScriptClassSymbolProvider } from './providers/ObjectScriptClassSymbolProvider';
import { ObjectScriptRoutineSymbolProvider } from './providers/ObjectScriptRoutineSymbolProvider';
import { ObjectScriptClassFoldingRangeProvider } from './providers/ObjectScriptClassFoldingRangeProvider';
import { ObjectScriptFoldingRangeProvider } from './providers/ObjectScriptFoldingRangeProvider';
import { ObjectScriptDefinitionProvider } from './providers/ObjectScriptDefinitionProvider';
import { ObjectScriptCompletionItemProvider } from './providers/ObjectScriptCompletionItemProvider';
import { ObjectScriptHoverProvider } from './providers/ObjectScriptHoverProvider';
import { DocumentFormattingEditProvider } from './providers/DocumentFormattingEditProvider';
import { DocumentContentProvider } from './providers/DocumentContentProvider';
import { XmlContentProvider } from './providers/XmlContentProvider';

import { ObjectScriptExplorerProvider } from './explorer/explorer';
import { outputChannel, currentWorkspaceFolder } from './utils';
import { AtelierAPI } from './api';
import { WorkspaceNode } from './explorer/models/workspaceNode';
export var explorerProvider: ObjectScriptExplorerProvider;
export var documentContentProvider: DocumentContentProvider;
export var workspaceState: vscode.Memento;

export const config = (config?: string, workspaceFolderName?: string): any => {
  workspaceFolderName = workspaceFolderName || currentWorkspaceFolder();

  if (['conn'].includes(config)) {
    if (workspaceFolderName !== '') {
      const workspaceFolder = vscode.workspace.workspaceFolders.find(
        el => el.name.toLowerCase() === workspaceFolderName.toLowerCase()
      );
      return vscode.workspace.getConfiguration('objectscript', workspaceFolder.uri).get(config);
    } else {
      return vscode.workspace.getConfiguration('objectscript', null).get(config);
    }
  }
  if (config && config !== '') {
    return vscode.workspace.getConfiguration('objectscript').get(config);
  }
  return vscode.workspace.getConfiguration('objectscript');
};

export function getXmlUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme === OBJECTSCRIPTXML_FILE_SCHEMA) {
    return uri;
  }
  return uri.with({
    scheme: OBJECTSCRIPTXML_FILE_SCHEMA,
    path: uri.path
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const languages = require(context.asAbsolutePath('./package.json'))['contributes']['languages'].map(lang => lang.id);
  workspaceState = context.workspaceState;
  workspaceState.update('workspaceFolder', '');

  explorerProvider = new ObjectScriptExplorerProvider();
  documentContentProvider = new DocumentContentProvider();
  const xmlContentProvider = new XmlContentProvider();
  context.workspaceState.update('xmlContentProvider', xmlContentProvider);

  vscode.window.registerTreeDataProvider('ObjectScriptExplorer', explorerProvider);

  const panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  panel.command = 'vscode-objectscript.output';
  panel.tooltip = 'Open output';
  panel.show();
  const checkConnection = () => {
    const conn = config('conn');
    vscode.commands.executeCommand('setContext', 'vscode-objectscript.connectActive', conn.active);
    if (!conn.active) {
      panel.text = '';
      return;
    }
    panel.text = `${conn.label}:${conn.ns}`;
    const api = new AtelierAPI();
    api
      .serverInfo()
      .then(info => {
        panel.text = `${conn.label}:${conn.ns} - Connected`;
        explorerProvider.refresh();
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
    if (!config('autoCompile') || !languages.includes(file.languageId)) {
      return;
    }
    vscode.commands.executeCommand('vscode-objectscript.compile');
  });

  vscode.window.onDidChangeActiveTextEditor((textEditor: vscode.TextEditor) => {
    if (config('autoPreviewXML')) {
      xml2doc(context, textEditor);
    }
  });

  context.subscriptions.push(
    window.onDidChangeActiveTextEditor(e => {
      if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
        let workspaceFolder = currentWorkspaceFolder();
        if (workspaceFolder && workspaceFolder !== workspaceState.get<string>('workspaceFolder')) {
          workspaceState.update('workspaceFolder', workspaceFolder);
          checkConnection();
        }
      }
    }),

    vscode.commands.registerCommand('vscode-objectscript.output', () => {
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand('vscode-objectscript.compile', () => importAndCompile(false)),
    vscode.commands.registerCommand('vscode-objectscript.touchBar.compile', () => importAndCompile(false)),
    vscode.commands.registerCommand('vscode-objectscript.compileWithFlags', () => importAndCompile(true)),
    vscode.commands.registerCommand('vscode-objectscript.export', exportAll),
    vscode.commands.registerCommand('vscode-objectscript.viewOthers', viewOthers),
    vscode.commands.registerCommand('vscode-objectscript.subclass', subclass),
    vscode.commands.registerCommand('vscode-objectscript.touchBar.viewOthers', viewOthers),
    vscode.commands.registerCommand('vscode-objectscript.explorer.refresh', () => explorerProvider.refresh()),
    vscode.commands.registerCommand('vscode-objectscript.explorer.openClass', vscode.window.showTextDocument),
    vscode.commands.registerCommand('vscode-objectscript.explorer.openRoutine', vscode.window.showTextDocument),
    vscode.commands.registerCommand('vscode-objectscript.explorer.export', exportExplorerItem),
    vscode.commands.registerCommand('vscode-objectscript.explorer.showSystem', (workspaceNode?: WorkspaceNode) => {
      if (workspaceNode) {
        explorerProvider.showSystem4Workspace(workspaceNode.label, true);
      } else {
        vscode.commands.executeCommand('setContext', 'vscode-objectscript.explorer.showSystem', true);
        explorerProvider.showSystem = true;
      }
    }),
    vscode.commands.registerCommand('vscode-objectscript.explorer.hideSystem', (workspaceNode?) => {
      if (workspaceNode) {
        explorerProvider.showSystem4Workspace(workspaceNode.label, false);
      } else {
        vscode.commands.executeCommand('setContext', 'vscode-objectscript.explorer.showSystem', false);
        explorerProvider.showSystem = false;
      }
    }),
    vscode.commands.registerCommand('vscode-objectscript.previewXml', (...args) => {
      xml2doc(context, window.activeTextEditor);
    }),

    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPT_FILE_SCHEMA, documentContentProvider),
    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPTXML_FILE_SCHEMA, xmlContentProvider),
    vscode.languages.registerDocumentSymbolProvider(['objectscript-class'], new ObjectScriptClassSymbolProvider()),
    vscode.languages.registerDocumentSymbolProvider(['objectscript'], new ObjectScriptRoutineSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(['objectscript-class'], new ObjectScriptClassFoldingRangeProvider()),
    vscode.languages.registerFoldingRangeProvider(['objectscript'], new ObjectScriptFoldingRangeProvider()),
    vscode.languages.registerDefinitionProvider(
      ['objectscript-class', 'objectscript', 'objectscript-macros'],
      new ObjectScriptDefinitionProvider()
    ),
    vscode.languages.registerCompletionItemProvider(
      ['objectscript-class', 'objectscript', 'objectscript-macros'],
      new ObjectScriptCompletionItemProvider(),
      '$',
      '^',
      '.',
      '#'
    ),
    vscode.languages.registerHoverProvider(
      ['objectscript-class', 'objectscript', 'objectscript-macros'],
      new ObjectScriptHoverProvider()
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      ['objectscript-class', 'objectscript', 'objectscript-macros'],
      new DocumentFormattingEditProvider()
    )
  );
}

export async function deactivate() {}
