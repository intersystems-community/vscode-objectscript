const extensionId = "daimor.vscode-objectscript";

import vscode = require("vscode");

import { AtelierJob } from "./atelier";
const { workspace, window } = vscode;
export const OBJECTSCRIPT_FILE_SCHEMA = "objectscript";
export const OBJECTSCRIPTXML_FILE_SCHEMA = "objectscriptxml";
export const FILESYSTEM_SCHEMA = "isfs";
export const schemas = [OBJECTSCRIPT_FILE_SCHEMA, OBJECTSCRIPTXML_FILE_SCHEMA, FILESYSTEM_SCHEMA];

import WebSocket = require("ws");
import {
  importAndCompile,
  importFolder as importFileOrFolder,
  namespaceCompile,
  compileExplorerItem,
} from "./commands/compile";
import { deleteItem } from "./commands/delete";
import { exportAll, exportExplorerItem } from "./commands/export";
import { serverActions } from "./commands/serverActions";
import { subclass } from "./commands/subclass";
import { superclass } from "./commands/superclass";
import { viewOthers } from "./commands/viewOthers";
import { xml2doc } from "./commands/xml2doc";
import { mainMenu } from "./commands/studio";

import { getLanguageConfiguration } from "./languageConfiguration";

import { DocumentContentProvider } from "./providers/DocumentContentProvider";
import { DocumentFormattingEditProvider } from "./providers/DocumentFormattingEditProvider";
import { ObjectScriptClassFoldingRangeProvider } from "./providers/ObjectScriptClassFoldingRangeProvider";
import { ObjectScriptClassSymbolProvider } from "./providers/ObjectScriptClassSymbolProvider";
import { ObjectScriptCompletionItemProvider } from "./providers/ObjectScriptCompletionItemProvider";
import { ObjectScriptDefinitionProvider } from "./providers/ObjectScriptDefinitionProvider";
import { ObjectScriptFoldingRangeProvider } from "./providers/ObjectScriptFoldingRangeProvider";
import { ObjectScriptHoverProvider } from "./providers/ObjectScriptHoverProvider";
import { ObjectScriptRoutineSymbolProvider } from "./providers/ObjectScriptRoutineSymbolProvider";
import { ObjectScriptClassCodeLensProvider } from "./providers/ObjectScriptClassCodeLensProvider";
import { XmlContentProvider } from "./providers/XmlContentProvider";

import { StatusCodeError } from "request-promise/errors";
import { AtelierAPI } from "./api";
import { ObjectScriptDebugAdapterDescriptorFactory } from "./debug/debugAdapterFactory";
import { ObjectScriptConfigurationProvider } from "./debug/debugConfProvider";
import { ObjectScriptExplorerProvider } from "./explorer/explorer";
import { WorkspaceNode } from "./explorer/models/workspaceNode";
import { FileSystemProvider } from "./providers/FileSystemPovider/FileSystemProvider";
import { WorkspaceSymbolProvider } from "./providers/WorkspaceSymbolProvider";
import { currentWorkspaceFolder, outputChannel, portFromDockerCompose, terminalWithDocker } from "./utils";
import { ObjectScriptDiagnosticProvider } from "./providers/ObjectScriptDiagnosticProvider";
import { DocumentRangeFormattingEditProvider } from "./providers/DocumentRangeFormattingEditProvider";

/* proposed */
import { FileSearchProvider } from "./providers/FileSystemPovider/FileSearchProvider";
import { TextSearchProvider } from "./providers/FileSystemPovider/TextSearchProvider";

export let fileSystemProvider: FileSystemProvider;
export let explorerProvider: ObjectScriptExplorerProvider;
export let documentContentProvider: DocumentContentProvider;
export let workspaceState: vscode.Memento;
export let extensionContext: vscode.ExtensionContext;
export let panel: vscode.StatusBarItem;
export let terminal: vscode.Terminal;

import TelemetryReporter from "vscode-extension-telemetry";
import { CodeActionProvider } from "./providers/CodeActionProvider";

const packageJson = vscode.extensions.getExtension(extensionId).packageJSON;
const extensionVersion = packageJson.version;
const aiKey = packageJson.aiKey;

export const config = (setting?: string, workspaceFolderName?: string): any => {
  workspaceFolderName = workspaceFolderName || currentWorkspaceFolder();

  if (["conn", "export"].includes(setting)) {
    if (workspaceFolderName && workspaceFolderName !== "") {
      const workspaceFolder = vscode.workspace.workspaceFolders.find(
        el => el.name.toLowerCase() === workspaceFolderName.toLowerCase()
      );
      return vscode.workspace.getConfiguration("objectscript", workspaceFolder.uri).get(setting);
    } else {
      return vscode.workspace.getConfiguration("objectscript", null).get(setting);
    }
  }
  if (setting && setting !== "") {
    return vscode.workspace.getConfiguration("objectscript").get(setting);
  }
  return vscode.workspace.getConfiguration("objectscript");
};

export function getXmlUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme === OBJECTSCRIPTXML_FILE_SCHEMA) {
    return uri;
  }
  return uri.with({
    path: uri.path,
    scheme: OBJECTSCRIPTXML_FILE_SCHEMA,
  });
}
let reporter: TelemetryReporter;

export const checkConnection = (clearCookies = false): void => {
  const conn = config("conn");
  let connInfo = `${conn.host}:${conn.port}[${conn.ns}]`;
  panel.text = connInfo;
  panel.tooltip = "";
  vscode.commands.executeCommand("setContext", "vscode-objectscript.connectActive", conn.active);
  if (!conn.active) {
    panel.text = `${connInfo} - Disabled`;
    return;
  }
  workspaceState.update(currentWorkspaceFolder() + ":port", undefined);
  const { port: dockerPort, docker: withDocker } = portFromDockerCompose(config("conn.docker-compose"), conn.port);
  workspaceState.update(currentWorkspaceFolder() + ":docker", withDocker);
  if (withDocker) {
    terminalWithDocker();
    if (dockerPort !== conn.port) {
      workspaceState.update(currentWorkspaceFolder() + ":port", dockerPort);
    }
    connInfo = `${conn.host}:${dockerPort}[${conn.ns}]`;
  }

  const api = new AtelierAPI(currentWorkspaceFolder());
  if (clearCookies) {
    api.clearCookies();
  }
  api
    .serverInfo()
    .then(info => {
      const hasHS = info.result.content.features.find(el => el.name === "HEALTHSHARE" && el.enabled) !== undefined;
      reporter.sendTelemetryEvent("connected", {
        serverVersion: info.result.content.version,
        healthshare: hasHS ? "yes" : "no",
      });
      /// Use xdebug's websocket, to catch when server disconnected
      const socket = new WebSocket(api.xdebugUrl());
      socket.onopen = () => {
        panel.text = `${connInfo} - Connected`;
      };
      socket.onclose = event => {
        panel.text = `${connInfo} - Disconnected`;
      };
    })
    .catch(error => {
      let message = error.message;
      if (error instanceof StatusCodeError && error.statusCode === 401) {
        setTimeout(
          () =>
            vscode.window
              .showInputBox({
                password: true,
                placeHolder: "Not Authorized, please enter password to connect",
                ignoreFocusOut: true,
              })
              .then(password => {
                if (password) {
                  workspaceState.update(currentWorkspaceFolder() + ":password", password);
                  checkConnection();
                } else {
                  vscode.workspace.getConfiguration().update("objectscript.conn.active", false);
                }
              }),
          1000
        );
        message = "Not Authorized";
        outputChannel.appendLine(
          `Authorization error: please check your username/password in the settings,
          and if you have sufficient privileges on the server.`
        );
      } else {
        outputChannel.appendLine("Error: " + message);
        outputChannel.appendLine("Please check your network settings in the settings.");
      }
      panel.text = `${connInfo} - ERROR`;
      panel.tooltip = message;
    })
    .finally(() => {
      explorerProvider.refresh();
    });
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  reporter = new TelemetryReporter(extensionId, extensionVersion, aiKey);

  const languages = packageJson.contributes.languages.map(lang => lang.id);
  workspaceState = context.workspaceState;
  extensionContext = context;
  workspaceState.update("workspaceFolder", "");

  explorerProvider = new ObjectScriptExplorerProvider();
  documentContentProvider = new DocumentContentProvider();
  const xmlContentProvider = new XmlContentProvider();
  context.workspaceState.update("xmlContentProvider", xmlContentProvider);
  fileSystemProvider = new FileSystemProvider();

  vscode.window.registerTreeDataProvider("ObjectScriptExplorer", explorerProvider);

  panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  const debugAdapterFactory = new ObjectScriptDebugAdapterDescriptorFactory();

  panel.command = "vscode-objectscript.serverActions";
  panel.show();

  checkConnection(true);
  vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
    if (affectsConfiguration("objectscript.conn")) {
      checkConnection(true);
    }
  });

  workspace.onDidSaveTextDocument(file => {
    if (schemas.includes(file.uri.scheme) || languages.includes(file.languageId)) {
      return vscode.commands.executeCommand("vscode-objectscript.compile");
    }
  });

  vscode.window.onDidChangeActiveTextEditor((textEditor: vscode.TextEditor) => {
    if (config("autoPreviewXML")) {
      return xml2doc(context, textEditor);
    }
  });

  const documentSelector = (...list) =>
    ["file", ...schemas].reduce((acc, scheme) => acc.concat(list.map(language => ({ scheme, language }))), []);

  const diagnosticProvider = new ObjectScriptDiagnosticProvider();
  if (vscode.window.activeTextEditor) {
    diagnosticProvider.updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  context.subscriptions.push(
    reporter,
    workspace.onDidChangeTextDocument(event => {
      diagnosticProvider.updateDiagnostics(event.document);
    }),
    window.onDidChangeActiveTextEditor(editor => {
      if (editor) {
        diagnosticProvider.updateDiagnostics(editor.document);
      }
      if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
        const workspaceFolder = currentWorkspaceFolder();
        if (workspaceFolder && workspaceFolder !== workspaceState.get<string>("workspaceFolder")) {
          workspaceState.update("workspaceFolder", workspaceFolder);
          checkConnection();
        }
      }
    }),

    vscode.commands.registerCommand("vscode-objectscript.output", () => {
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand("vscode-objectscript.compile", () => importAndCompile(false)),
    vscode.commands.registerCommand("vscode-objectscript.touchBar.compile", () => importAndCompile(false)),
    vscode.commands.registerCommand("vscode-objectscript.compileWithFlags", () => importAndCompile(true)),
    vscode.commands.registerCommand("vscode-objectscript.compileAll", () => namespaceCompile(false)),
    vscode.commands.registerCommand("vscode-objectscript.compileAllWithFlags", () => namespaceCompile(true)),
    vscode.commands.registerCommand("vscode-objectscript.compileFolder", importFileOrFolder),
    vscode.commands.registerCommand("vscode-objectscript.export", exportAll),
    vscode.commands.registerCommand("vscode-objectscript.debug", (program: string, askArgs: boolean) => {
      const startDebugging = args => {
        const programWithArgs = program + `(${args})`;
        vscode.debug.startDebugging(undefined, {
          type: "objectscript",
          request: "launch",
          name: `Debug ${program}`,
          program: programWithArgs,
        });
      };
      if (!askArgs) {
        startDebugging("");
        return;
      }
      return vscode.window
        .showInputBox({
          placeHolder: "Please enter comma delimited arguments list",
        })
        .then(args => {
          startDebugging(args);
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.pickProcess", async config => {
      const system = config.system;
      const api = new AtelierAPI();
      const convert = data =>
        data.result.content.map(
          (process: AtelierJob): vscode.QuickPickItem => ({
            label: process.pid.toString(),
            description: `Namespace: ${process.namespace}, Routine: ${process.routine}`,
          })
        );
      const list = await api.getJobs(system).then(convert);
      if (!list.length) {
        vscode.window.showInformationMessage("No process found to attach to", {
          modal: true,
        });
        return;
      }
      return vscode.window
        .showQuickPick<vscode.QuickPickItem>(list, {
          placeHolder: "Pick the process to attach to",
        })
        .then(value => {
          if (value) return value.label;
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.viewOthers", viewOthers),
    vscode.commands.registerCommand("vscode-objectscript.studio.actions", mainMenu),
    vscode.commands.registerCommand("vscode-objectscript.subclass", subclass),
    vscode.commands.registerCommand("vscode-objectscript.superclass", superclass),
    vscode.commands.registerCommand("vscode-objectscript.serverActions", serverActions),
    vscode.commands.registerCommand("vscode-objectscript.touchBar.viewOthers", viewOthers),
    vscode.commands.registerCommand("vscode-objectscript.explorer.refresh", () => explorerProvider.refresh()),
    vscode.commands.registerCommand("vscode-objectscript.explorer.openClass", vscode.window.showTextDocument),
    vscode.commands.registerCommand("vscode-objectscript.explorer.openRoutine", vscode.window.showTextDocument),
    vscode.commands.registerCommand("vscode-objectscript.explorer.export", exportExplorerItem),
    vscode.commands.registerCommand("vscode-objectscript.explorer.delete", deleteItem),
    vscode.commands.registerCommand("vscode-objectscript.explorer.compile", compileExplorerItem),
    vscode.commands.registerCommand("vscode-objectscript.explorer.showGenerated", (workspaceNode: WorkspaceNode) => {
      workspaceState.update(`ExplorerGenerated:${workspaceNode.uniqueId}`, true);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.hideGenerated", (workspaceNode: WorkspaceNode) => {
      workspaceState.update(`ExplorerGenerated:${workspaceNode.uniqueId}`, false);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.otherNamespace", (workspaceNode: WorkspaceNode) => {
      return explorerProvider.selectNamespace(workspaceNode.label);
    }),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.otherNamespaceClose",
      (workspaceNode: WorkspaceNode) => {
        return explorerProvider.closeExtra4Workspace(workspaceNode.label, workspaceNode.namespace);
      }
    ),
    vscode.commands.registerCommand("vscode-objectscript.previewXml", (...args) => {
      xml2doc(context, window.activeTextEditor);
    }),

    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPT_FILE_SCHEMA, documentContentProvider),
    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPTXML_FILE_SCHEMA, xmlContentProvider),
    vscode.workspace.registerFileSystemProvider(FILESYSTEM_SCHEMA, fileSystemProvider, { isCaseSensitive: true }),
    vscode.languages.setLanguageConfiguration("objectscript-class", getLanguageConfiguration("class")),
    vscode.languages.setLanguageConfiguration("objectscript", getLanguageConfiguration("routine")),
    vscode.languages.setLanguageConfiguration("objectscript-macros", getLanguageConfiguration("routine")),
    vscode.languages.registerCodeActionsProvider(
      documentSelector("objectscript-class", "objectscript"),
      new CodeActionProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      documentSelector("objectscript"),
      new ObjectScriptRoutineSymbolProvider()
    ),
    vscode.languages.registerFoldingRangeProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassFoldingRangeProvider()
    ),
    vscode.languages.registerFoldingRangeProvider(
      documentSelector("objectscript"),
      new ObjectScriptFoldingRangeProvider()
    ),
    vscode.languages.registerDefinitionProvider(
      documentSelector("objectscript-class", "objectscript", "objectscript-macros"),
      new ObjectScriptDefinitionProvider()
    ),
    vscode.languages.registerCompletionItemProvider(
      documentSelector("objectscript-class", "objectscript", "objectscript-macros"),
      new ObjectScriptCompletionItemProvider(),
      "$",
      "^",
      ".",
      "#"
    ),
    vscode.languages.registerHoverProvider(
      documentSelector("objectscript-class", "objectscript", "objectscript-macros"),
      new ObjectScriptHoverProvider()
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      documentSelector("objectscript-class", "objectscript", "objectscript-macros"),
      new DocumentFormattingEditProvider()
    ),
    vscode.languages.registerDocumentRangeFormattingEditProvider(
      documentSelector("objectscript-class", "objectscript", "objectscript-macros"),
      new DocumentRangeFormattingEditProvider()
    ),
    vscode.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider()),
    vscode.debug.registerDebugConfigurationProvider("objectscript", new ObjectScriptConfigurationProvider()),
    vscode.debug.registerDebugAdapterDescriptorFactory("objectscript", debugAdapterFactory),
    debugAdapterFactory,
    vscode.languages.registerCodeLensProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassCodeLensProvider()
    ),

    /* from proposed api */
    vscode.workspace.registerFileSearchProvider(FILESYSTEM_SCHEMA, new FileSearchProvider()),
    vscode.workspace.registerTextSearchProvider(FILESYSTEM_SCHEMA, new TextSearchProvider())
  );
  reporter.sendTelemetryEvent("extensionActivated");
}

export function deactivate() {
  // This will ensure all pending events get flushed
  reporter.dispose();
  terminal.dispose();
}
