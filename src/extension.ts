export const extensionId = "intersystems-community.vscode-objectscript";

import vscode = require("vscode");
import * as semver from "semver";

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
import path = require("path");
import {
  importAndCompile,
  importFolder as importFileOrFolder,
  namespaceCompile,
  compileExplorerItems,
  checkChangedOnServer,
  compileOnly,
} from "./commands/compile";
import { deleteExplorerItems } from "./commands/delete";
import { exportAll, exportCurrentFile, exportExplorerItems, getCategory } from "./commands/export";
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
import { addServerNamespaceToWorkspace, pickServerAndNamespace } from "./commands/addServerNamespaceToWorkspace";
import { jumpToTagAndOffset } from "./commands/jumpToTagAndOffset";
import { connectFolderToServerNamespace } from "./commands/connectFolderToServerNamespace";
import { DocumaticPreviewPanel } from "./commands/documaticPreviewPanel";

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

import { AtelierAPI } from "./api";
import { ObjectScriptDebugAdapterDescriptorFactory } from "./debug/debugAdapterFactory";
import { ObjectScriptConfigurationProvider } from "./debug/debugConfProvider";
import { ProjectsExplorerProvider } from "./explorer/projectsExplorer";
import { ObjectScriptExplorerProvider, registerExplorerOpen } from "./explorer/explorer";
import { WorkspaceNode } from "./explorer/models/workspaceNode";
import { FileSystemProvider, generateFileContent } from "./providers/FileSystemProvider/FileSystemProvider";
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
  isImportableLocalFile,
  workspaceFolderOfUri,
  uriOfWorkspaceFolder,
} from "./utils";
import { ObjectScriptDiagnosticProvider } from "./providers/ObjectScriptDiagnosticProvider";
import { DocumentRangeFormattingEditProvider } from "./providers/DocumentRangeFormattingEditProvider";
import { DocumentLinkProvider } from "./providers/DocumentLinkProvider";

/* proposed */
import { FileSearchProvider } from "./providers/FileSystemProvider/FileSearchProvider";
import { TextSearchProvider } from "./providers/FileSystemProvider/TextSearchProvider";

export let fileSystemProvider: FileSystemProvider;
export let explorerProvider: ObjectScriptExplorerProvider;
export let projectsExplorerProvider: ProjectsExplorerProvider;
export let documentContentProvider: DocumentContentProvider;
export let workspaceState: vscode.Memento;
export let extensionContext: vscode.ExtensionContext;
export let panel: vscode.StatusBarItem;
export let posPanel: vscode.StatusBarItem;
export const terminals: vscode.Terminal[] = [];
export let xmlContentProvider: XmlContentProvider;

import TelemetryReporter from "vscode-extension-telemetry";
import { CodeActionProvider } from "./providers/CodeActionProvider";
import {
  addWorkspaceFolderForProject,
  compileProjectContents,
  createProject,
  deleteProject,
  exportProjectContents,
  modifyProject,
} from "./commands/project";
import { NodeBase } from "./explorer/models/nodeBase";

const packageJson = vscode.extensions.getExtension(extensionId).packageJSON;
const extensionVersion = packageJson.version;
const aiKey = packageJson.aiKey;
const PANEL_LABEL = "ObjectScript";

const _onDidChangeConnection = new vscode.EventEmitter<void>();

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

export let checkingConnection = false;

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

/**
 * A map of all CSP web apps in a server-namespace.
 * The key is either `serverName:ns`, or `host:port/pathPrefix:ns`, lowercase.
 * The value is an array of CSP apps as returned by GET %25SYS/cspapps.
 */
export const cspApps: Map<string, string[]> = new Map();

export async function checkConnection(clearCookies = false, uri?: vscode.Uri): Promise<void> {
  // Do nothing if already checking the connection
  if (checkingConnection) {
    return;
  }

  const { apiTarget, configName } = connectionTarget(uri);
  if (clearCookies) {
    /// clean-up cached values
    workspaceState.update(configName + ":host", undefined);
    workspaceState.update(configName + ":port", undefined);
    workspaceState.update(configName + ":password", undefined);
    workspaceState.update(configName + ":apiVersion", undefined);
    workspaceState.update(configName + ":docker", undefined);
    _onDidChangeConnection.fire();
  }
  let api = new AtelierAPI(apiTarget, false);
  const { active, host = "", port = 0, pathPrefix, username, ns = "" } = api.config;
  vscode.commands.executeCommand("setContext", "vscode-objectscript.connectActive", active);
  if (!panel.text) {
    panel.text = `${PANEL_LABEL}`;
  }
  if (!host.length && !port && !ns.length) {
    panel.text = `${PANEL_LABEL}`;
    panel.tooltip = `No connection configured`;
    return;
  }
  let connInfo = api.connInfo;
  if (!active) {
    if (!host.length || !port || !ns.length) {
      connInfo = `incompletely specified server ${connInfo}`;
    }
    panel.text = `${PANEL_LABEL} $(warning)`;
    panel.tooltip = `Connection to ${connInfo} is disabled`;
    return;
  }

  if (!workspaceState.get(configName + ":port") && !api.externalServer) {
    try {
      const { port: dockerPort, docker: withDocker, service } = await portFromDockerCompose();
      workspaceState.update(configName + ":docker", withDocker);
      workspaceState.update(configName + ":dockerService", service);
      if (withDocker) {
        if (!dockerPort) {
          const errorMessage = `Something is wrong with your docker-compose connection settings, or your service is not running.`;
          outputChannel.appendError(errorMessage);
          panel.text = `${PANEL_LABEL} $(error)`;
          panel.tooltip = `ERROR - ${errorMessage}`;
          return;
        }
        const { autoShowTerminal } = config();
        autoShowTerminal && terminalWithDocker();
        if (dockerPort !== port) {
          workspaceState.update(configName + ":host", "localhost");
          workspaceState.update(configName + ":port", dockerPort);
        }
        connInfo = `localhost:${dockerPort}[${ns}]`;
        _onDidChangeConnection.fire();
      }
    } catch (error) {
      outputChannel.appendError(error);
      workspaceState.update(configName + ":docker", true);
      panel.text = `${PANEL_LABEL} $(error)`;
      panel.tooltip = error;
      return;
    }
  }

  if (clearCookies) {
    api.clearCookies();
  }

  // Why must this be recreated here?
  api = new AtelierAPI(apiTarget, false);

  if (!api.config.host || !api.config.port || !api.config.ns) {
    const message = "'host', 'port' and 'ns' must be specified.";
    outputChannel.appendError(message);
    panel.text = `${PANEL_LABEL} $(error)`;
    panel.tooltip = `ERROR - ${message}`;
    disableConnection(configName);
    return;
  }
  checkingConnection = true;
  return api
    .serverInfo()
    .then(async (info) => {
      panel.text = api.connInfo;
      panel.tooltip = `Connected${pathPrefix ? " to " + pathPrefix : ""} as ${username}`;
      const hasHS = info.result.content.features.find((el) => el.name === "HEALTHSHARE" && el.enabled) !== undefined;
      reporter &&
        reporter.sendTelemetryEvent("connected", {
          serverVersion: info.result.content.version,
          healthshare: hasHS ? "yes" : "no",
        });
      // Update CSP web app cache if required
      const key = (
        api.config.serverName && api.config.serverName != ""
          ? `${api.config.serverName}:${api.config.ns}`
          : `${api.config.host}:${api.config.port}${api.config.pathPrefix}:${api.config.ns}`
      ).toLowerCase();
      if (!cspApps.has(key)) {
        cspApps.set(key, await api.getCSPApps().then((data) => data.result.content || []));
      }
      return;
    })
    .catch((error) => {
      let message = error.message;
      let errorMessage;
      if (error.statusCode === 401) {
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
              async (password) => {
                if (password) {
                  workspaceState.update(configName + ":password", password);
                  _onDidChangeConnection.fire();
                  await checkConnection(false, uri);
                } else if (!api.externalServer) {
                  disableConnection(configName);
                }
              },
              connInfo
            );
          }
        }, 1000);
        message = "Not Authorized.";
        errorMessage = `Authorization error: Check your credentials in Settings, and that you have sufficient privileges on the /api/atelier web application on ${connInfo}`;
      } else {
        errorMessage = `${message}\nCheck your server details in Settings (${connInfo}).`;
      }
      outputChannel.appendError(errorMessage);
      panel.text = `${connInfo} $(error)`;
      panel.tooltip = `ERROR - ${message}`;
      throw error;
    })
    .finally(() => {
      checkingConnection = false;
      setTimeout(() => {
        explorerProvider.refresh();
        projectsExplorerProvider.refresh();
        // Refreshing Files Explorer also switches to it, so only do this if the uri is part of the workspace,
        // otherwise files opened from ObjectScript Explorer (objectscript:// or isfs:// depending on the "objectscript.serverSideEditing" setting)
        // will cause an unwanted switch.
        if (uri && schemas.includes(uri.scheme) && vscode.workspace.getWorkspaceFolder(uri)) {
          vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
        }
      }, 20);
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
        `The [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=${extId}) is recommended to help you [define connections and store passwords securely](https://intersystems-community.github.io/vscode-objectscript/configuration/#configuring-a-server) in your keychain.`,
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

function languageServer(install = true): vscode.Extension<any> {
  const extId = "intersystems.language-server";
  let extension = vscode.extensions.getExtension(extId);

  async function languageServerInstall() {
    if (config("ignoreInstallLanguageServer")) {
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
        `Install the [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=${extId}) for best handling of ObjectScript code.`,
        "Install",
        "Later"
      )
      .then(async (action) => {
        switch (action) {
          case "Install":
            await vscode.commands.executeCommand("workbench.extensions.search", `@tag:"intersystems"`).then(null, null);
            await vscode.commands.executeCommand("workbench.extensions.installExtension", extId);
            extension = vscode.extensions.getExtension(extId);
            break;
          case "Later":
          default:
        }
      });
  }

  if (!extension && install) {
    languageServerInstall();
  }

  return extension;
}

// The URIs of all classes that have been opened. Used when objectscript.openClassContracted is true.
let openedClasses: string[];

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
    keys: context.workspaceState.keys,
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

  projectsExplorerProvider = new ProjectsExplorerProvider();
  vscode.window.createTreeView("ObjectScriptProjectsExplorer", {
    treeDataProvider: projectsExplorerProvider,
    showCollapseAll: true,
    canSelectMany: false,
  });

  posPanel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  posPanel.command = "vscode-objectscript.jumpToTagAndOffset";
  posPanel.show();

  panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  panel.text = `${PANEL_LABEL}`;
  panel.command = "vscode-objectscript.serverActions";
  panel.show();

  const debugAdapterFactory = new ObjectScriptDebugAdapterDescriptorFactory();

  // Check one time (flushing cookies) each connection that is used by the workspace.
  // This gets any prompting for missing credentials done upfront, for simplicity.
  const toCheck = new Map<string, vscode.Uri>();
  vscode.workspace.workspaceFolders?.map((workspaceFolder) => {
    const uri = workspaceFolder.uri;
    const { configName } = connectionTarget(uri);
    toCheck.set(configName, uri);
  });
  for await (const oneToCheck of toCheck) {
    const configName = oneToCheck[0];
    const uri = oneToCheck[1];
    const serverName = uri.scheme === "file" ? config("conn", configName).server : configName;
    await resolveConnectionSpec(serverName);
    // Ignore any failure
    checkConnection(true, uri).finally();
  }

  vscode.workspace.onDidChangeWorkspaceFolders(async ({ added, removed }) => {
    const folders = vscode.workspace.workspaceFolders;

    // Make sure we have a resolved connection spec for the targets of all added folders
    const toCheck = new Map<string, vscode.Uri>();
    added.map((workspaceFolder) => {
      const uri = workspaceFolder.uri;
      const { configName } = connectionTarget(uri);
      toCheck.set(configName, uri);
    });
    for await (const oneToCheck of toCheck) {
      const configName = oneToCheck[0];
      const uri = oneToCheck[1];
      const serverName = uri.scheme === "file" ? config("conn", configName).server : configName;
      await resolveConnectionSpec(serverName);
    }

    // If it was just the addition of the first folder, and this is one of the isfs types, hide the ObjectScript Explorer for this workspace
    if (
      folders?.length === 1 &&
      added?.length === 1 &&
      removed?.length === 0 &&
      filesystemSchemas.includes(added[0].uri.scheme)
    ) {
      vscode.workspace
        .getConfiguration("objectscript")
        .update("showExplorer", false, vscode.ConfigurationTarget.Workspace);
    }
  });

  vscode.workspace.onDidChangeConfiguration(async ({ affectsConfiguration }) => {
    if (affectsConfiguration("objectscript.conn") || affectsConfiguration("intersystems.servers")) {
      if (affectsConfiguration("intersystems.servers")) {
        // Gather the server names previously resolved
        const resolvedServers: string[] = [];
        resolvedConnSpecs.forEach((v, k) => resolvedServers.push(k));
        // Clear the cache
        resolvedConnSpecs.clear();
        // Resolve them again, sequentially in case user needs to be prompted for credentials
        for await (const serverName of resolvedServers) {
          await resolveConnectionSpec(serverName);
        }
      }
      // Check connections sequentially for each workspace folder
      let refreshFilesExplorer = false;
      for await (const folder of vscode.workspace.workspaceFolders) {
        if (schemas.includes(folder.uri.scheme)) {
          refreshFilesExplorer = true;
        }
        try {
          await checkConnection(true, folder.uri);
        } catch (_) {
          continue;
        }
      }
      explorerProvider.refresh();
      projectsExplorerProvider.refresh();
      if (refreshFilesExplorer) {
        // This unavoidably switches to the File Explorer view, so only do it if isfs folders were found
        vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
      }
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
        return importAndCompile(false, file, config("compileOnSave"));
      }
    } else if (file.uri.scheme === "file") {
      if (isImportableLocalFile(file)) {
        // This local file is in the exported file tree, so it's a non-InterSystems file that's
        // part of a CSP application, so import it on save
        return importFileOrFolder(file.uri, true);
      }
    }
  });

  vscode.window.onDidChangeActiveTextEditor(async (textEditor: vscode.TextEditor) => {
    await checkConnection(false, textEditor?.document.uri);
    posPanel.text = "";
    if (textEditor?.document.fileName.endsWith(".xml") && config("autoPreviewXML")) {
      return xml2doc(context, textEditor);
    }
  });
  vscode.window.onDidChangeTextEditorSelection((event: vscode.TextEditorSelectionChangeEvent) => {
    posPanel.text = "";
    const document = event.textEditor.document;
    if (!["objectscript", "objectscript-int"].includes(document.languageId)) {
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

  // Gather the proposed APIs we will register to use when building with enabledApiProposals != []
  const proposed = [
    typeof packageJson.enabledApiProposals === "object" &&
    packageJson.enabledApiProposals.includes("fileSearchProvider") &&
    typeof vscode.workspace.registerFileSearchProvider === "function"
      ? vscode.workspace.registerFileSearchProvider(FILESYSTEM_SCHEMA, new FileSearchProvider())
      : null,
    typeof packageJson.enabledApiProposals === "object" &&
    packageJson.enabledApiProposals.includes("fileSearchProvider") &&
    typeof vscode.workspace.registerFileSearchProvider === "function"
      ? vscode.workspace.registerFileSearchProvider(FILESYSTEM_READONLY_SCHEMA, new FileSearchProvider())
      : null,
    typeof packageJson.enabledApiProposals === "object" &&
    packageJson.enabledApiProposals.includes("textSearchProvider") &&
    typeof vscode.workspace.registerTextSearchProvider === "function"
      ? vscode.workspace.registerTextSearchProvider(FILESYSTEM_SCHEMA, new TextSearchProvider())
      : null,
    typeof packageJson.enabledApiProposals === "object" &&
    packageJson.enabledApiProposals.includes("textSearchProvider") &&
    typeof vscode.workspace.registerTextSearchProvider === "function"
      ? vscode.workspace.registerTextSearchProvider(FILESYSTEM_READONLY_SCHEMA, new TextSearchProvider())
      : null,
  ].filter(notNull);

  if (proposed.length > 0) {
    outputChannel.appendLine(`${extensionId} version ${extensionVersion} activating with proposed APIs available.\n`);
    outputChannel.show(true);
  }

  const languageServerExt =
    context.extensionMode && context.extensionMode !== vscode.ExtensionMode.Test ? languageServer() : null;
  const noLSsubscriptions: { dispose(): any }[] = [];
  if (!languageServerExt) {
    if (!config("ignoreInstallLanguageServer")) {
      outputChannel.appendLine(`The intersystems.language-server extension is not installed or has been disabled.\n`);
      outputChannel.show(true);
    }

    if (vscode.window.activeTextEditor) {
      diagnosticProvider.updateDiagnostics(vscode.window.activeTextEditor.document);
    }
    noLSsubscriptions.push(
      workspace.onDidChangeTextDocument((event) => {
        diagnosticProvider.updateDiagnostics(event.document);
      }),
      window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
          diagnosticProvider.updateDiagnostics(editor.document);
        }
      }),
      vscode.languages.registerHoverProvider(
        documentSelector("objectscript-class", "objectscript", "objectscript-int", "objectscript-macros"),
        new ObjectScriptHoverProvider()
      ),
      vscode.languages.registerDocumentFormattingEditProvider(
        documentSelector("objectscript-class", "objectscript", "objectscript-int", "objectscript-macros"),
        new DocumentFormattingEditProvider()
      ),
      vscode.languages.registerDocumentRangeFormattingEditProvider(
        documentSelector("objectscript-class", "objectscript", "objectscript-int", "objectscript-macros"),
        new DocumentRangeFormattingEditProvider()
      ),
      vscode.languages.registerDefinitionProvider(
        documentSelector("objectscript-class", "objectscript", "objectscript-int", "objectscript-macros"),
        new ObjectScriptDefinitionProvider()
      ),
      vscode.languages.registerCompletionItemProvider(
        documentSelector("objectscript-class", "objectscript", "objectscript-int", "objectscript-macros"),
        new ObjectScriptCompletionItemProvider(),
        "$",
        "^",
        ".",
        "#"
      ),
      vscode.languages.registerDocumentSymbolProvider(
        documentSelector("objectscript-class"),
        new ObjectScriptClassSymbolProvider()
      ),
      vscode.languages.registerDocumentSymbolProvider(
        documentSelector("objectscript", "objectscript-int"),
        new ObjectScriptRoutineSymbolProvider()
      )
    );
    context.subscriptions.push(...noLSsubscriptions);
  } else {
    const lsVersion = languageServerExt.packageJSON.version;
    // Language Server implements FoldingRangeProvider starting from 1.0.5
    if (semver.lt(lsVersion, "1.0.5")) {
      context.subscriptions.push(
        vscode.languages.registerFoldingRangeProvider(
          documentSelector("objectscript-class"),
          new ObjectScriptClassFoldingRangeProvider()
        ),
        vscode.languages.registerFoldingRangeProvider(
          documentSelector("objectscript", "objectscript-int"),
          new ObjectScriptFoldingRangeProvider()
        )
      );
    }
  }

  openedClasses = workspaceState.get("openedClasses") ?? [];

  context.subscriptions.push(
    reporter,
    panel,
    posPanel,
    vscode.extensions.onDidChange(async () => {
      const languageServerExt2 = languageServer(false);
      if (typeof languageServerExt !== typeof languageServerExt2) {
        noLSsubscriptions.forEach((event) => {
          event.dispose();
        });
      }
    }),
    workspace.onDidChangeTextDocument((event) => {
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
    window.onDidChangeActiveTextEditor(async (editor) => {
      if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
        const workspaceFolder = currentWorkspaceFolder();
        if (workspaceFolder && workspaceFolder !== workspaceState.get<string>("workspaceFolder")) {
          workspaceState.update("workspaceFolder", workspaceFolder);
          await checkConnection(false, editor?.document.uri);
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
          if (args != undefined && args != null) {
            startDebugging(args);
          }
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
        vscode.window.showInformationMessage(`No attachable processes are running in ${api.ns}.`, {
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
    vscode.commands.registerCommand("vscode-objectscript.jumpToTagAndOffset", jumpToTagAndOffset),
    vscode.commands.registerCommand("vscode-objectscript.viewOthers", () => viewOthers(false)),
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
    vscode.commands.registerCommand("vscode-objectscript.touchBar.viewOthers", () => viewOthers(false)),
    vscode.commands.registerCommand("vscode-objectscript.explorer.refresh", () => explorerProvider.refresh()),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.refresh", () =>
      projectsExplorerProvider.refresh()
    ),
    // Register the vscode-objectscript.explorer.open command elsewhere
    registerExplorerOpen(),
    vscode.commands.registerCommand("vscode-objectscript.explorer.export", (item, items) =>
      exportExplorerItems(items && items.length ? items : [item])
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.delete", (item, items) =>
      deleteExplorerItems(items && items.length ? items : [item])
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.compile", (item, items) =>
      compileExplorerItems(items && items.length ? items : [item])
    ),
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
    vscode.commands.registerCommand("vscode-objectscript.connectFolderToServerNamespace", () => {
      connectFolderToServerNamespace();
    }),
    vscode.commands.registerCommand("vscode-objectscript.hideExplorerForWorkspace", () => {
      vscode.workspace
        .getConfiguration("objectscript")
        .update("showExplorer", false, vscode.ConfigurationTarget.Workspace);
    }),
    vscode.commands.registerCommand("vscode-objectscript.showExplorerForWorkspace", () => {
      vscode.workspace
        .getConfiguration("objectscript")
        .update("showExplorer", true, vscode.ConfigurationTarget.Workspace);
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
    vscode.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider()),
    vscode.debug.registerDebugConfigurationProvider("objectscript", new ObjectScriptConfigurationProvider()),
    vscode.debug.registerDebugAdapterDescriptorFactory("objectscript", debugAdapterFactory),
    debugAdapterFactory,
    vscode.languages.registerCodeLensProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassCodeLensProvider()
    ),
    vscode.commands.registerCommand("vscode-objectscript.compileOnly", () => compileOnly(false)),
    vscode.commands.registerCommand("vscode-objectscript.compileOnlyWithFlags", () => compileOnly(true)),
    vscode.languages.registerDocumentLinkProvider(
      { language: "vscode-objectscript-output" },
      new DocumentLinkProvider()
    ),
    vscode.commands.registerCommand("vscode-objectscript.editOthers", () => viewOthers(true)),
    vscode.commands.registerCommand("vscode-objectscript.showClassDocumentationPreview", () =>
      DocumaticPreviewPanel.create(context.extensionUri)
    ),
    vscode.commands.registerCommand("vscode-objectscript.exportCurrentFile", exportCurrentFile),
    vscode.workspace.onDidCreateFiles((e: vscode.FileCreateEvent) =>
      Promise.all(
        e.files
          .filter((f) => !filesystemSchemas.includes(f.scheme))
          .filter((f) => ["cls", "inc", "int", "mac"].includes(f.path.split(".").pop().toLowerCase()))
          .map(async (f) => {
            // Determine the file name
            const workspace = workspaceFolderOfUri(f);
            const workspacePath = uriOfWorkspaceFolder(workspace).fsPath;
            const filePathNoWorkspaceArr = f.fsPath.replace(workspacePath + path.sep, "").split(path.sep);
            const { folder, addCategory } = config("export", workspace);
            const expectedFolder = typeof folder === "string" && folder.length ? folder : null;
            if (expectedFolder !== null && filePathNoWorkspaceArr[0] === expectedFolder) {
              filePathNoWorkspaceArr.shift();
            }
            const expectedCat = addCategory ? getCategory(f.fsPath, addCategory) : null;
            if (expectedCat !== null && filePathNoWorkspaceArr[0] === expectedCat) {
              filePathNoWorkspaceArr.shift();
            }
            const fileName = filePathNoWorkspaceArr.join(".");
            // Generate the new content
            const newContent = generateFileContent(fileName, Buffer.from(await vscode.workspace.fs.readFile(f)));
            // Write the new content to the file
            return vscode.workspace.fs.writeFile(f, new TextEncoder().encode(newContent.content.join("\n")));
          })
      )
    ),
    vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => {
      if (config("openClassContracted") && editor && editor.document.languageId === "objectscript-class") {
        const uri: string = editor.document.uri.toString();
        if (!openedClasses.includes(uri)) {
          vscode.commands.executeCommand("editor.foldLevel1");
          openedClasses.push(uri);
        }
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
      const uri: string = doc.uri.toString();
      const idx: number = openedClasses.indexOf(uri);
      if (idx > -1) {
        openedClasses.splice(idx, 1);
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.addItemsToProject", (item) => {
      if (item instanceof NodeBase || item instanceof vscode.Uri) {
        return modifyProject(item, "add");
      } else {
        return modifyProject(undefined, "add");
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.removeFromProject", (item) => {
      if (item instanceof NodeBase || item instanceof vscode.Uri) {
        return modifyProject(item, "remove");
      } else {
        return modifyProject(undefined, "remove");
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.removeItemsFromProject", (item) => {
      if (item instanceof NodeBase || item instanceof vscode.Uri) {
        return modifyProject(item, "remove");
      } else {
        return modifyProject(undefined, "remove");
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.createProject", (node) => createProject(node)),
    vscode.commands.registerCommand("vscode-objectscript.deleteProject", (node) => deleteProject(node)),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.exportProjectContents", (node) =>
      exportProjectContents(node)
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.compileProjectContents", (node) =>
      compileProjectContents(node)
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.openOtherServerNs", () => {
      pickServerAndNamespace().then((pick) => {
        if (pick != undefined) {
          projectsExplorerProvider.openExtraServerNs(pick);
        }
      });
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.closeOtherServerNs", (node) =>
      projectsExplorerProvider.closeExtraServerNs(node)
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.addWorkspaceFolderForProject", (node) =>
      addWorkspaceFolderForProject(node)
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
        const docs = vscode.workspace.textDocuments.filter((doc) => doc.uri.toString() === uri.toString());
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
    onDidChangeConnection(): vscode.Event<void> {
      return _onDidChangeConnection.event;
    },
    getUriForDocument(document: string): vscode.Uri {
      return DocumentContentProvider.getUri(document);
    },
  };

  // 'export' our public API
  return api;
}

export function deactivate(): void {
  if (workspaceState) {
    workspaceState.update("openedClasses", openedClasses);
  }
  // This will ensure all pending events get flushed
  reporter && reporter.dispose();
  if (terminals) {
    terminals.forEach((t) => t.dispose());
  }
}
