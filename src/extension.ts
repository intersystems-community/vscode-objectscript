export const extensionId = "daimor.vscode-objectscript";

import vscode = require("vscode");

import { AtelierJob } from "./api/atelier";
const { workspace, window } = vscode;
export const OBJECTSCRIPT_FILE_SCHEMA = "objectscript";
export const OBJECTSCRIPTXML_FILE_SCHEMA = "objectscriptxml";
export const FILESYSTEM_SCHEMA = "isfs";
export const schemas = [OBJECTSCRIPT_FILE_SCHEMA, OBJECTSCRIPTXML_FILE_SCHEMA, FILESYSTEM_SCHEMA];

import * as url from "url";
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
import {
  mainCommandMenu,
  contextCommandMenu,
  documentBeingProcessed,
  fireOtherStudioAction,
  OtherStudioAction,
  contextSourceControlMenu,
  mainSourceControlMenu,
} from "./commands/studio";

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
import { currentWorkspaceFolder, outputChannel, portFromDockerCompose, terminalWithDocker, notNull } from "./utils";
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
export let posPanel: vscode.StatusBarItem;
export const terminals: vscode.Terminal[] = [];
export let xmlContentProvider: XmlContentProvider;

import TelemetryReporter from "vscode-extension-telemetry";
import { CodeActionProvider } from "./providers/CodeActionProvider";

const packageJson = vscode.extensions.getExtension(extensionId).packageJSON;
const extensionVersion = packageJson.version;
const aiKey = packageJson.aiKey;

export const config = (setting?: string, workspaceFolderName?: string): vscode.WorkspaceConfiguration | any => {
  workspaceFolderName = workspaceFolderName || currentWorkspaceFolder();
  if (
    workspaceFolderName &&
    workspaceFolderName !== "" &&
    vscode.workspace.getConfiguration("intersystems.servers", null).has(workspaceFolderName)
  ) {
    workspaceFolderName = vscode.workspace.workspaceFolders[0].name;
  }
  let prefix;
  const workspaceFolder = vscode.workspace.workspaceFolders.find(
    (el) => el.name.toLowerCase() === workspaceFolderName.toLowerCase()
  );
  if (setting && setting.startsWith("intersystems")) {
    return vscode.workspace.getConfiguration(setting, workspaceFolder);
  } else {
    prefix = "objectscript";
  }

  if (["conn", "export"].includes(setting)) {
    if (workspaceFolderName && workspaceFolderName !== "") {
      if (workspaceFolderName.match(/.+:\d+$/)) {
        const { port, hostname: host, auth, query } = url.parse("http://" + workspaceFolderName, true);
        const { ns = "USER", https = false } = query;
        const [username, password] = (auth || "_SYSTEM:SYS").split(":");
        if (setting == "conn") {
          return {
            active: true,
            https,
            ns,
            host,
            port,
            username,
            password,
          };
        } else if (setting == "export") {
          return {};
        }
      }
    }
  }
  const result = vscode.workspace.getConfiguration(prefix, workspaceFolder?.uri);
  return setting && setting.length ? result.get(setting) : result;
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
let reporter: TelemetryReporter = null;

let connectionSocket: WebSocket;

export const checkConnection = (clearCookies = false): void => {
  const workspaceFolder = currentWorkspaceFolder();
  if (clearCookies) {
    /// clean-up cached values
    workspaceState.update(workspaceFolder + ":host", undefined);
    workspaceState.update(workspaceFolder + ":port", undefined);
    workspaceState.update(workspaceFolder + ":password", undefined);
    workspaceState.update(workspaceFolder + ":apiVersion", undefined);
    workspaceState.update(workspaceFolder + ":docker", undefined);
  }
  let api = new AtelierAPI(workspaceFolder);
  const { active, host = "", port = 0, ns = "" } = api.config;
  let connInfo = `${host}:${port}[${ns}]`;
  if (!host.length || !port || !ns.length) {
    connInfo = packageJson.displayName;
  }
  panel.text = connInfo;
  panel.tooltip = "";
  vscode.commands.executeCommand("setContext", "vscode-objectscript.connectActive", active);
  if (!active) {
    panel.text = `${packageJson.displayName} - Disabled`;
    return;
  }
  if (!workspaceState.get(workspaceFolder + ":port") && !api.externalServer) {
    const { port: dockerPort, docker: withDocker } = portFromDockerCompose();
    workspaceState.update(workspaceFolder + ":docker", withDocker);
    if (withDocker) {
      if (!dockerPort) {
        outputChannel.appendLine(
          `Something is wrong with your docker-compose connection settings, or your service is not running.`
        );
        panel.text = `${packageJson.displayName} - ERROR`;
        return;
      }
      terminalWithDocker();
      if (dockerPort !== port) {
        workspaceState.update(workspaceFolder + ":host", "localhost");
        workspaceState.update(workspaceFolder + ":port", dockerPort);
      }
      connInfo = `localhost:${dockerPort}[${ns}]`;
    }
  }

  if (clearCookies) {
    api.clearCookies();
  } else if (connectionSocket && connectionSocket.url == api.xdebugUrl() && connectionSocket.OPEN) {
    panel.text = `${connInfo} - Connected`;
    return;
  }
  api = new AtelierAPI(workspaceFolder);
  if (!api.config.host || !api.config.port || !api.config.ns) {
    outputChannel.appendLine("host, port and ns must be specified.");
    panel.text = `${packageJson.displayName} - ERROR`;
    return;
  }
  api
    .serverInfo()
    .then((info) => {
      const hasHS = info.result.content.features.find((el) => el.name === "HEALTHSHARE" && el.enabled) !== undefined;
      reporter &&
        reporter.sendTelemetryEvent("connected", {
          serverVersion: info.result.content.version,
          healthshare: hasHS ? "yes" : "no",
        });
      /// Use xdebug's websocket, to catch when server disconnected
      connectionSocket = new WebSocket(api.xdebugUrl());
      connectionSocket.onopen = () => {
        fireOtherStudioAction(OtherStudioAction.ConnectedToNewNamespace);
        panel.text = `${connInfo} - Connected`;
      };
      connectionSocket.onclose = (event) => {
        panel.text = `${connInfo} - Disconnected`;
      };
    })
    .catch((error) => {
      let message = error.message;
      if (error instanceof StatusCodeError && error.statusCode === 401) {
        setTimeout(
          () =>
            vscode.window
              .showInputBox({
                password: true,
                placeHolder: "Not Authorized, please enter password to connect to: " + connInfo,
                ignoreFocusOut: true,
              })
              .then((password) => {
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
      console.error(error);
      panel.text = `${connInfo} - ERROR`;
      panel.tooltip = message;
      throw error;
    })
    .finally(() => {
      explorerProvider.refresh();
    });
};

async function serverManager(): Promise<void> {
  const extId = "intersystems-community.servermanager";
  const ignore =
    config("ignoreInstallServerManager") ||
    vscode.workspace.getConfiguration("intersystems.servers").get("/ignore", false);
  if (ignore || vscode.extensions.getExtension(extId)) {
    return;
  }
  return vscode.window
    .showInformationMessage(
      "The InterSystems® Server Manager extension is recommended to help you define connections.",
      "Install",
      "Skip",
      "Ignore"
    )
    .then(async (action) => {
      switch (action) {
        case "Install":
          await vscode.commands.executeCommand("workbench.extensions.search", `@tag:"intersystems"`);
          await vscode.commands.executeCommand("extension.open", extId);
          await vscode.commands.executeCommand("workbench.extensions.installExtension", extId);
          break;
        case "Ignore":
          config().update("ignoreInstallServerManager", true, vscode.ConfigurationTarget.Global);
          break;
        case "Skip":
        default:
      }
    });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  if (!packageJson.version.includes("SNAPSHOT")) {
    reporter = new TelemetryReporter(extensionId, extensionVersion, aiKey);
  }

  const languages = packageJson.contributes.languages.map((lang) => lang.id);
  workspaceState = context.workspaceState;
  extensionContext = context;
  workspaceState.update("workspaceFolder", "");

  documentContentProvider = new DocumentContentProvider();
  xmlContentProvider = new XmlContentProvider();
  fileSystemProvider = new FileSystemProvider();

  explorerProvider = new ObjectScriptExplorerProvider();
  // vscode.window.registerTreeDataProvider("ObjectScriptExplorer", explorerProvider);
  vscode.window.createTreeView("ObjectScriptExplorer", {
    treeDataProvider: explorerProvider,
    showCollapseAll: true,
    canSelectMany: true,
  });

  posPanel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  posPanel.show();

  panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);

  const debugAdapterFactory = new ObjectScriptDebugAdapterDescriptorFactory();

  panel.command = "vscode-objectscript.serverActions";
  panel.show();

  checkConnection(true);
  vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
    if (affectsConfiguration("objectscript.conn")) {
      checkConnection(true);
    }
  });
  vscode.window.onDidCloseTerminal((t) => {
    const terminalIndex = terminals.findIndex((terminal) => terminal.name == t.name);
    if (terminalIndex > -1) {
      terminals.splice(terminalIndex, 1);
    }
  });

  workspace.onDidSaveTextDocument((file) => {
    if (schemas.includes(file.uri.scheme) || languages.includes(file.languageId)) {
      if (documentBeingProcessed !== file) {
        // return vscode.commands.executeCommand("vscode-objectscript.compile");
        return importAndCompile(false, file);
      }
    }
  });

  vscode.window.onDidChangeActiveTextEditor((textEditor: vscode.TextEditor) => {
    checkConnection();
    posPanel.text = "";
    if (textEditor.document.fileName.endsWith(".xml") && config("autoPreviewXML")) {
      return xml2doc(context, textEditor);
    }
  });
  vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
    posPanel.text = "";
    const intMatch = event.textEditor.document.fileName.match(/\/?(.*)\.int$/i);
    if (!intMatch || event.selections.length > 1 || !event.selections[0].isEmpty) {
      return;
    }
    const line = event.selections[0].start.line;
    const [, routine] = intMatch;
    const { document } = event.textEditor;
    let label = "";
    let pos = 0;
    for (let i = line; i > 0; i--) {
      const labelMatch = document.lineAt(i).text.match(/^(%?\w+).*/);
      if (labelMatch) {
        [, label] = labelMatch;
        break;
      }
      pos++;
    }
    event.textEditor.document.getText;
    posPanel.text = `${label}${pos > 0 ? "+" + pos : ""}^${routine}`;
  });

  const documentSelector = (...list) =>
    ["file", ...schemas].reduce((acc, scheme) => acc.concat(list.map((language) => ({ scheme, language }))), []);

  const diagnosticProvider = new ObjectScriptDiagnosticProvider();
  if (vscode.window.activeTextEditor) {
    diagnosticProvider.updateDiagnostics(vscode.window.activeTextEditor.document);
  }

  const proposed = [
    packageJson.enableProposedApi && typeof vscode.workspace.registerFileSearchProvider === "function"
      ? vscode.workspace.registerFileSearchProvider(FILESYSTEM_SCHEMA, new FileSearchProvider())
      : null,
    packageJson.enableProposedApi && typeof vscode.workspace.registerTextSearchProvider === "function"
      ? vscode.workspace.registerTextSearchProvider(FILESYSTEM_SCHEMA, new TextSearchProvider())
      : null,
  ].filter(notNull);

  context.subscriptions.push(
    reporter,
    workspace.onDidChangeTextDocument((event) => {
      diagnosticProvider.updateDiagnostics(event.document);
      if (
        event.contentChanges.length !== 0 &&
        event.document.uri.scheme === FILESYSTEM_SCHEMA &&
        !event.document.isDirty
      ) {
        fireOtherStudioAction(OtherStudioAction.AttemptedEdit, event.document.uri);
      }
    }),
    window.onDidChangeActiveTextEditor((editor) => {
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
      const startDebugging = (args) => {
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
        .then((args) => {
          startDebugging(args);
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.pickProcess", async (config) => {
      const system = config.system;
      const api = new AtelierAPI();
      const convert = (data) =>
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
        .then((value) => {
          if (value) return value.label;
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.viewOthers", viewOthers),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.sourceControl", mainSourceControlMenu),
    vscode.commands.registerCommand(
      "vscode-objectscript.serverCommands.contextSourceControl",
      contextSourceControlMenu
    ),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.other", mainCommandMenu),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.contextOther", contextCommandMenu),
    vscode.commands.registerCommand("vscode-objectscript.subclass", subclass),
    vscode.commands.registerCommand("vscode-objectscript.superclass", superclass),
    vscode.commands.registerCommand("vscode-objectscript.serverActions", serverActions),
    vscode.commands.registerCommand("vscode-objectscript.touchBar.viewOthers", viewOthers),
    vscode.commands.registerCommand("vscode-objectscript.explorer.refresh", () => explorerProvider.refresh()),
    vscode.commands.registerCommand("vscode-objectscript.explorer.openClass", vscode.window.showTextDocument),
    vscode.commands.registerCommand("vscode-objectscript.explorer.openRoutine", vscode.window.showTextDocument),
    vscode.commands.registerCommand("vscode-objectscript.explorer.export", (item, items) =>
      exportExplorerItem(items && items.length ? items : [item])
    ),
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
    ...proposed
  );
  reporter && reporter.sendTelemetryEvent("extensionActivated");

  // offer to install servermanager extension
  await serverManager();
}

export function deactivate(): void {
  // This will ensure all pending events get flushed
  reporter && reporter.dispose();
  if (terminals) {
    terminals.forEach((t) => t.dispose());
  }
}
