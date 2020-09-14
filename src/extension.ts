export const extensionId = "intersystems-community.vscode-objectscript";

import vscode = require("vscode");

import { AtelierJob } from "./api/atelier";
const { workspace, window } = vscode;
export const OBJECTSCRIPT_FILE_SCHEMA = "objectscript";
export const OBJECTSCRIPTXML_FILE_SCHEMA = "objectscriptxml";
export const FILESYSTEM_SCHEMA = "isfs";
export const FILESYSTEM_READONLY_SCHEMA = "isfs-readonly";
export const schemas = [
  OBJECTSCRIPT_FILE_SCHEMA,
  OBJECTSCRIPTXML_FILE_SCHEMA,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
];
export const filesystemSchemas = [FILESYSTEM_SCHEMA, FILESYSTEM_READONLY_SCHEMA];

import * as url from "url";
import WebSocket = require("ws");
import {
  importAndCompile,
  importFolder as importFileOrFolder,
  namespaceCompile,
  compileExplorerItem,
  checkChangedOnServer,
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
import { addServerNamespaceToWorkspace } from "./commands/addServerNamespaceToWorkspace";

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
import { ObjectScriptExplorerProvider, registerExplorerOpen } from "./explorer/explorer";
import { WorkspaceNode } from "./explorer/models/workspaceNode";
import { FileSystemProvider } from "./providers/FileSystemPovider/FileSystemProvider";
import { WorkspaceSymbolProvider } from "./providers/WorkspaceSymbolProvider";
import {
  connectionTarget,
  currentWorkspaceFolder,
  outputChannel,
  portFromDockerCompose,
  terminalWithDocker,
  notNull,
  currentFile,
  InputBoxManager,
} from "./utils";
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
    vscode.workspace.workspaceFolders?.length &&
    workspaceFolderName &&
    workspaceFolderName !== "" &&
    vscode.workspace.getConfiguration("intersystems.servers", null).has(workspaceFolderName)
  ) {
    workspaceFolderName = vscode.workspace.workspaceFolders[0].name;
  }
  let prefix: string;
  const workspaceFolder = vscode.workspace.workspaceFolders?.find(
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

let serverManagerApi: any;

// Map of the intersystems.server connection specs we have resolved via the API to that extension
const resolvedConnSpecs = new Map<string, any>();

/**
 * If servermanager extension is available, fetch the connection spec unless already cached.
 * Prompt for credentials if necessary.
 * @param serverName authority element of an isfs uri, or `objectscript.conn.server` property
 */
export async function resolveConnectionSpec(serverName: string): Promise<void> {
  if (serverManagerApi && serverManagerApi.getServerSpec) {
    if (serverName && serverName !== "" && !resolvedConnSpecs.has(serverName)) {
      const connSpec = await serverManagerApi.getServerSpec(serverName);
      if (connSpec) {
        resolvedConnSpecs.set(serverName, connSpec);
      }
    }
  }
}

// Accessor for the cache of resolved connection specs
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function getResolvedConnectionSpec(key: string, dflt: any): any {
  return resolvedConnSpecs.has(key) ? resolvedConnSpecs.get(key) : dflt;
}

export function checkConnection(clearCookies = false, uri?: vscode.Uri): void {
  const { apiTarget, configName } = connectionTarget(uri);
  if (clearCookies) {
    /// clean-up cached values
    workspaceState.update(configName + ":host", undefined);
    workspaceState.update(configName + ":port", undefined);
    workspaceState.update(configName + ":password", undefined);
    workspaceState.update(configName + ":apiVersion", undefined);
    workspaceState.update(configName + ":docker", undefined);
  }
  let api = new AtelierAPI(apiTarget, false);
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
  if (!workspaceState.get(configName + ":port") && !api.externalServer) {
    const { port: dockerPort, docker: withDocker } = portFromDockerCompose();
    workspaceState.update(configName + ":docker", withDocker);
    if (withDocker) {
      if (!dockerPort) {
        outputChannel.appendLine(
          `Something is wrong with your docker-compose connection settings, or your service is not running.`
        );
        outputChannel.show(true);
        panel.text = `${packageJson.displayName} - ERROR`;
        return;
      }
      const { autoShowTerminal } = config();
      autoShowTerminal && terminalWithDocker();
      if (dockerPort !== port) {
        workspaceState.update(configName + ":host", "localhost");
        workspaceState.update(configName + ":port", dockerPort);
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

  // Why must this be recreated here?
  api = new AtelierAPI(apiTarget, false);

  if (!api.config.host || !api.config.port || !api.config.ns) {
    const message = "host, port and ns must be specified.";
    outputChannel.appendLine(message);
    outputChannel.show(true);
    panel.text = `${packageJson.displayName} - ERROR`;
    panel.tooltip = message;
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
        fireOtherStudioAction(
          OtherStudioAction.ConnectedToNewNamespace,
          typeof apiTarget === "string" ? undefined : apiTarget
        );
        panel.text = `${connInfo} - Connected`;
      };
      connectionSocket.onclose = (event) => {
        panel.text = `${connInfo} - Disconnected`;
      };
    })
    .catch((error) => {
      let message = error.message;
      if (error instanceof StatusCodeError && error.statusCode === 401) {
        setTimeout(() => {
          const username = api.config.username;
          if (username === "") {
            vscode.window.showErrorMessage(`Anonymous access rejected by ${connInfo}.`);
            if (!api.externalServer) {
              vscode.window.showErrorMessage("Connection has been disabled.");
              disableConnection(configName);
            }
          } else {
            InputBoxManager.showInputBox(
              {
                password: true,
                placeHolder: `Not Authorized. Enter password to connect as user '${username}' to ${connInfo}`,
                prompt: !api.externalServer ? "If no password is entered the connection will be disabled." : "",
                ignoreFocusOut: true,
              },
              (password) => {
                if (password) {
                  workspaceState.update(configName + ":password", password);
                  checkConnection(false, uri);
                } else if (!api.externalServer) {
                  disableConnection(configName);
                }
              },
              connInfo
            );
          }
        }, 1000);
        message = "Not Authorized";
        outputChannel.appendLine(
          `Authorization error: Check your credentials in Settings, and that you have sufficient privileges on the /api/atelier web application on ${connInfo}`
        );
        outputChannel.show(true);
      } else {
        outputChannel.appendLine(message);
        outputChannel.appendLine(`Check your server details in Settings (${connInfo}).`);
        outputChannel.show(true);
      }
      console.error(error);
      panel.text = `${connInfo} - ERROR`;
      panel.tooltip = message;
      throw error;
    })
    .finally(() => {
      explorerProvider.refresh();
      if (uri && schemas.includes(uri.scheme)) {
        vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
      }
    });
}

// Set objectscript.conn.active = false at WorkspaceFolder level if objectscript.conn is defined there,
//  else set it false at Workspace level
function disableConnection(configName: string) {
  const connConfig: vscode.WorkspaceConfiguration = config("", configName);
  const target: vscode.ConfigurationTarget = connConfig.inspect("conn").workspaceFolderValue
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;
  const targetConfig: any =
    connConfig.inspect("conn").workspaceFolderValue || connConfig.inspect("conn").workspaceValue;
  return connConfig.update("conn", { ...targetConfig, active: false }, target);
}

// Promise to return the API of the servermanager
async function serverManager(): Promise<any> {
  const extId = "intersystems-community.servermanager";
  let extension = vscode.extensions.getExtension(extId);
  const ignore =
    config("ignoreInstallServerManager") ||
    vscode.workspace.getConfiguration("intersystems.servers").get("/ignore", false);
  if (!extension) {
    if (ignore) {
      return;
    }
    try {
      await vscode.commands.executeCommand("extension.open", extId);
    } catch (ex) {
      // Such command do not exists, suppose we are under Theia, it's not possible to install this extension this way
      return;
    }
    await vscode.window
      .showInformationMessage(
        "The [InterSystems® Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) is recommended to help you [define connections and store passwords securely](https://intersystems-community.github.io/vscode-objectscript/configuration/#configuring-a-server) in your keychain.",
        "Install",
        "Later",
        "Never"
      )
      .then(async (action) => {
        switch (action) {
          case "Install":
            await vscode.commands.executeCommand("workbench.extensions.search", `@tag:"intersystems"`).then(null, null);
            await vscode.commands.executeCommand("workbench.extensions.installExtension", extId);
            extension = vscode.extensions.getExtension(extId);
            break;
          case "Never":
            config().update("ignoreInstallServerManager", true, vscode.ConfigurationTarget.Global);
            break;
          case "Later":
          default:
        }
      });
  }
  if (extension) {
    if (!extension.isActive) {
      await extension.activate();
    }
    return extension.exports;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<any> {
  if (!packageJson.version.includes("SNAPSHOT")) {
    try {
      reporter = new TelemetryReporter(extensionId, extensionVersion, aiKey);
    } catch (_error) {
      reporter = null;
    }
  }

  const languages = packageJson.contributes.languages.map((lang) => lang.id);
  // workaround for Theia, issue https://github.com/eclipse-theia/theia/issues/8435
  workspaceState = {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      context.workspaceState.get(key, defaultValue) || defaultValue,
    update: (key: string, value: any): Thenable<void> => context.workspaceState.update(key, value),
  };
  extensionContext = context;
  workspaceState.update("workspaceFolder", undefined);

  // Get api for servermanager extension, perhaps offering to install it
  serverManagerApi = await serverManager();

  documentContentProvider = new DocumentContentProvider();
  xmlContentProvider = new XmlContentProvider();
  fileSystemProvider = new FileSystemProvider();

  explorerProvider = new ObjectScriptExplorerProvider();
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

  // Check once (flushing cookies) each connection used by the workspace(s)
  const toCheck = new Map<string, vscode.Uri>();
  vscode.workspace.workspaceFolders?.map((workspaceFolder) => {
    const uri = workspaceFolder.uri;
    const { configName } = connectionTarget(uri);
    toCheck.set(configName, uri);
  });
  toCheck.forEach(async function (uri, configName) {
    const serverName = uri.scheme === "file" ? config("conn", configName).server : configName;
    await resolveConnectionSpec(serverName);
    checkConnection(true, uri);
  });

  vscode.workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
    const folders = vscode.workspace.workspaceFolders;
    if (
      folders?.length === 1 &&
      added?.length === 1 &&
      removed?.length === 0 &&
      filesystemSchemas.includes(added[0].uri.scheme)
    ) {
      // First folder has been added and is one of the isfs types, so hide the ObjectScript Explorer for this workspace
      vscode.workspace
        .getConfiguration("objectscript")
        .update("showExplorer", false, vscode.ConfigurationTarget.Workspace);
    }
  });

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
        return importAndCompile(false, file);
      }
    }
  });

  vscode.window.onDidChangeActiveTextEditor((textEditor: vscode.TextEditor) => {
    checkConnection();
    posPanel.text = "";
    if (textEditor?.document.fileName.endsWith(".xml") && config("autoPreviewXML")) {
      return xml2doc(context, textEditor);
    }
  });
  vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
    posPanel.text = "";
    const document = event.textEditor.document;
    if (document.languageId !== "objectscript") {
      return;
    }
    if (event.selections.length > 1 || !event.selections[0].isEmpty) {
      return;
    }

    const file = currentFile(document);
    const nameMatch = file.name.match(/(.*)\.(int|mac)$/i);
    if (!nameMatch) {
      return;
    }
    const [, routine] = nameMatch;
    const line = event.selections[0].start.line;
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

  // Gather the proposed APIs we will register to use when building with enableProposedApi = true
  const proposed = [
    packageJson.enableProposedApi && typeof vscode.workspace.registerFileSearchProvider === "function"
      ? vscode.workspace.registerFileSearchProvider(FILESYSTEM_SCHEMA, new FileSearchProvider())
      : null,
    packageJson.enableProposedApi && typeof vscode.workspace.registerFileSearchProvider === "function"
      ? vscode.workspace.registerFileSearchProvider(FILESYSTEM_READONLY_SCHEMA, new FileSearchProvider())
      : null,
    packageJson.enableProposedApi && typeof vscode.workspace.registerTextSearchProvider === "function"
      ? vscode.workspace.registerTextSearchProvider(FILESYSTEM_SCHEMA, new TextSearchProvider())
      : null,
    packageJson.enableProposedApi && typeof vscode.workspace.registerTextSearchProvider === "function"
      ? vscode.workspace.registerTextSearchProvider(FILESYSTEM_READONLY_SCHEMA, new TextSearchProvider())
      : null,
  ].filter(notNull);

  if (proposed.length > 0) {
    outputChannel.appendLine(`${extensionId} version ${extensionVersion} activating with proposed APIs available.\n`);
    outputChannel.show(true);
  }

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
      if (!event.document.isDirty) {
        checkChangedOnServer(currentFile(event.document));
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
    vscode.commands.registerCommand("vscode-objectscript.compileFolder", (_file, files) =>
      Promise.all(files.map((file) => importFileOrFolder(file, false)))
    ),
    vscode.commands.registerCommand("vscode-objectscript.importFolder", (_file, files) =>
      Promise.all(files.map((file) => importFileOrFolder(file, true)))
    ),
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
    // Register the vscode-objectscript.explorer.open command elsewhere
    registerExplorerOpen(explorerProvider),
    vscode.commands.registerCommand("vscode-objectscript.explorer.export", (item, items) =>
      exportExplorerItem(items && items.length ? items : [item])
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.delete", deleteItem),
    vscode.commands.registerCommand("vscode-objectscript.explorer.compile", compileExplorerItem),
    vscode.commands.registerCommand("vscode-objectscript.explorer.showGenerated", (workspaceNode: WorkspaceNode) => {
      workspaceState.update(`ExplorerGenerated:${workspaceNode.uniqueId}`, true);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.showSystem", (workspaceNode: WorkspaceNode) => {
      workspaceState.update(`ExplorerSystem:${workspaceNode.uniqueId}`, true);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.hideGenerated", (workspaceNode: WorkspaceNode) => {
      workspaceState.update(`ExplorerGenerated:${workspaceNode.uniqueId}`, false);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.hideSystem", (workspaceNode: WorkspaceNode) => {
      workspaceState.update(`ExplorerSystem:${workspaceNode.uniqueId}`, false);
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
    vscode.commands.registerCommand("vscode-objectscript.previewXml", () => {
      xml2doc(context, window.activeTextEditor);
    }),
    vscode.commands.registerCommand("vscode-objectscript.addServerNamespaceToWorkspace", () => {
      addServerNamespaceToWorkspace();
    }),

    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPT_FILE_SCHEMA, documentContentProvider),
    vscode.workspace.registerTextDocumentContentProvider(OBJECTSCRIPTXML_FILE_SCHEMA, xmlContentProvider),
    vscode.workspace.registerFileSystemProvider(FILESYSTEM_SCHEMA, fileSystemProvider, {
      isCaseSensitive: true,
    }),
    vscode.workspace.registerFileSystemProvider(FILESYSTEM_READONLY_SCHEMA, fileSystemProvider, {
      isCaseSensitive: true,
      isReadonly: true,
    }),
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

    /* Anything we use from the VS Code proposed API */
    ...proposed
  );
  reporter && reporter.sendTelemetryEvent("extensionActivated");

  // The API we export
  const api = {
    serverForUri(uri: vscode.Uri): any {
      const { apiTarget } = connectionTarget(uri);
      const api = new AtelierAPI(apiTarget);
      const {
        serverName,
        active,
        host = "",
        https,
        port,
        pathPrefix,
        username,
        password,
        ns = "",
        apiVersion,
      } = api.config;
      return {
        serverName,
        active,
        scheme: https ? "https" : "http",
        host,
        port,
        pathPrefix,
        username,
        password,
        namespace: ns,
        apiVersion: active ? apiVersion : undefined,
      };
    },
    serverDocumentUriForUri(uri: vscode.Uri): vscode.Uri {
      const { apiTarget } = connectionTarget(uri);
      if (typeof apiTarget === "string") {
        // It was a file-type uri, so find its document (we hope it is open)
        const docs = vscode.workspace.textDocuments.filter((doc) => doc.uri === uri);
        let fileName = "";
        if (docs.length === 1) {
          // Found it, so work out the corresponding server-side name
          const file = currentFile(docs[0]);
          // For some local documents there is no server-side equivalent
          if (file) {
            fileName = file.name;
          }
        }
        // uri.path will be "/" if no mapping exists to a server-side equivalent
        uri = vscode.Uri.file(fileName).with({ scheme: OBJECTSCRIPT_FILE_SCHEMA, authority: apiTarget });
      }
      return uri;
    },
  };

  // 'export' our public API
  return api;
}

export function deactivate(): void {
  // This will ensure all pending events get flushed
  reporter && reporter.dispose();
  if (terminals) {
    terminals.forEach((t) => t.dispose());
  }
}
