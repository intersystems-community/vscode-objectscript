export const extensionId = "intersystems-community.vscode-objectscript";

import vscode = require("vscode");
import * as semver from "semver";

import { AtelierJob, Content, Response, ServerInfo } from "./api/atelier";
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
  importLocalFilesToServerSideFolder,
  loadChanges,
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
import { jumpToTagAndOffset, openErrorLocation } from "./commands/jumpToTagAndOffset";
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
import { ObjectScriptCodeLensProvider } from "./providers/ObjectScriptCodeLensProvider";
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
import { loadStudioColors, loadStudioSnippets } from "./commands/studioMigration";
import { openCustomEditors, RuleEditorProvider } from "./providers/RuleEditorProvider";
import { newFile, NewFileType } from "./commands/newFile";
import { FileDecorationProvider } from "./providers/FileDecorationProvider";
import { RESTDebugPanel } from "./commands/restDebugPanel";
import { modifyWsFolder } from "./commands/addServerNamespaceToWorkspace";

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
        await resolvePassword(connSpec);
        resolvedConnSpecs.set(serverName, connSpec);
      }
    }
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export async function resolvePassword(serverSpec): Promise<void> {
  const AUTHENTICATION_PROVIDER = "intersystems-server-credentials";
  // This arises if setting says to use authentication provider
  if (typeof serverSpec.password === "undefined") {
    const scopes = [serverSpec.name, serverSpec.username || ""];
    let session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER, scopes, { silent: true });
    if (!session) {
      session = await vscode.authentication.getSession(AUTHENTICATION_PROVIDER, scopes, { createIfNone: true });
    }
    if (session) {
      // If original spec lacked username use the one obtained by the authprovider
      serverSpec.username = serverSpec.username || session.scopes[1];
      serverSpec.password = session.accessToken;
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

export async function checkConnection(
  clearCookies = false,
  uri?: vscode.Uri,
  triggerRefreshes?: boolean
): Promise<void> {
  // Do nothing if already checking the connection
  if (checkingConnection) {
    return;
  }

  const { apiTarget, configName } = connectionTarget(uri);
  const wsKey = configName.toLowerCase();
  if (clearCookies) {
    /// clean-up cached values
    await workspaceState.update(wsKey + ":host", undefined);
    await workspaceState.update(wsKey + ":port", undefined);
    await workspaceState.update(wsKey + ":password", undefined);
    await workspaceState.update(wsKey + ":apiVersion", undefined);
    await workspaceState.update(wsKey + ":docker", undefined);
    _onDidChangeConnection.fire();
  }
  let api = new AtelierAPI(apiTarget, false);
  const { active, host = "", port = 0, username, ns = "" } = api.config;
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
    panel.text = `${PANEL_LABEL} $(warning)`;
    panel.tooltip = new vscode.MarkdownString(
      `Connection to${
        !host.length || !port || !ns.length ? " incompletely specified server" : ""
      } \`${connInfo}\` is disabled`
    );
    return;
  }

  if (!workspaceState.get(wsKey + ":port") && !api.externalServer) {
    try {
      const { port: dockerPort, docker: withDocker, service } = await portFromDockerCompose();
      workspaceState.update(wsKey + ":docker", withDocker);
      workspaceState.update(wsKey + ":dockerService", service);
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
          workspaceState.update(wsKey + ":host", "localhost");
          workspaceState.update(wsKey + ":port", dockerPort);
        }
        connInfo = `localhost:${dockerPort}[${ns}]`;
        _onDidChangeConnection.fire();
      }
    } catch (error) {
      outputChannel.appendError(error);
      workspaceState.update(wsKey + ":docker", true);
      panel.text = `${PANEL_LABEL} $(error)`;
      panel.tooltip = error;
      return;
    }
  }

  if (clearCookies) {
    api.clearCookies();
  }

  // Why must this be recreated here? Maybe in case something has updated connection details since we last fetched them.
  api = new AtelierAPI(apiTarget, false);

  if (!api.config.host || !api.config.port || !api.config.ns) {
    const message = "'host', 'port' and 'ns' must be specified.";
    outputChannel.appendError(message);
    panel.text = `${PANEL_LABEL} $(error)`;
    panel.tooltip = `ERROR - ${message}`;
    if (!api.externalServer) {
      await setConnectionState(configName, false);
    }
    return;
  }
  checkingConnection = true;

  // What we do when api.serverInfo call succeeds
  const gotServerInfo = async (info: Response<Content<ServerInfo>>) => {
    panel.text = api.connInfo;
    if (api.config.serverName) {
      panel.tooltip = new vscode.MarkdownString(
        `Connected to \`${api.config.host}:${api.config.port}${api.config.pathPrefix}\` as \`${username}\``
      );
    } else {
      panel.tooltip = new vscode.MarkdownString(
        `Connected${api.config.pathPrefix ? ` to \`${api.config.pathPrefix}\`` : ""} as \`${username}\``
      );
    }
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
    if (!api.externalServer) {
      await setConnectionState(configName, true);
    }
    return;
  };

  // Do the check
  return api
    .serverInfo()
    .then(gotServerInfo)
    .catch(async (error) => {
      let message = error.message;
      let errorMessage;
      if (error.statusCode === 401) {
        let success = false;
        message = "Not Authorized.";
        errorMessage = `Authorization error: Check your credentials in Settings, and that you have sufficient privileges on the /api/atelier web application on ${connInfo}`;
        const username = api.config.username;
        if (username === "") {
          vscode.window.showErrorMessage(`Anonymous access rejected by ${connInfo}.`);
          if (!api.externalServer) {
            vscode.window.showErrorMessage("Connection has been disabled.");
            await setConnectionState(configName, false);
          }
        } else {
          success = await new Promise<boolean>((resolve) => {
            vscode.window
              .showInputBox({
                password: true,
                placeHolder: `Not Authorized. Enter password to connect as user '${username}' to ${connInfo}`,
                prompt: !api.externalServer ? "If no password is entered the connection will be disabled." : "",
                ignoreFocusOut: true,
              })
              .then(
                async (password) => {
                  if (password) {
                    await workspaceState.update(wsKey + ":password", password);
                    resolve(
                      api
                        .serverInfo()
                        .then(async (info): Promise<boolean> => {
                          await gotServerInfo(info);
                          _onDidChangeConnection.fire();
                          return true;
                        })
                        .catch(async (error) => {
                          console.log(`Second connect failed: ${error}`);
                          await setConnectionState(configName, false);
                          await workspaceState.update(wsKey + ":password", undefined);
                          return false;
                        })
                        .finally(() => {
                          checkingConnection = false;
                        })
                    );
                  } else if (!api.externalServer) {
                    await setConnectionState(configName, false);
                  }
                  console.log(`Finished prompting for password`);
                  resolve(false);
                },
                (reason) => {
                  console.log(`showInputBox for password dismissed: ${reason}`);
                }
              );
          });
          if (success) {
            return;
          }
        }
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
      if (triggerRefreshes) {
        setTimeout(() => {
          explorerProvider.refresh();
          projectsExplorerProvider.refresh();
          // Refreshing Files Explorer also switches to it, so only do this if the uri is part of the workspace,
          // otherwise files opened from ObjectScript Explorer (objectscript://) will cause an unwanted switch.
          if (uri && schemas.includes(uri.scheme) && vscode.workspace.getWorkspaceFolder(uri)) {
            vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
          }
        }, 20);
      }
    });
}

// Set objectscript.conn.active at WorkspaceFolder level if objectscript.conn is defined there,
//  else set it at Workspace level
function setConnectionState(configName: string, active: boolean) {
  const connConfig: vscode.WorkspaceConfiguration = config("", configName);
  const target: vscode.ConfigurationTarget = connConfig.inspect("conn").workspaceFolderValue
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;
  const targetConfig: any =
    connConfig.inspect("conn").workspaceFolderValue || connConfig.inspect("conn").workspaceValue;
  return connConfig.update("conn", { ...targetConfig, active }, target);
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
    const serverName = uri.scheme === "file" ? config("conn", configName).server : configName;
    toCheck.set(serverName, uri);
  });
  for await (const oneToCheck of toCheck) {
    const serverName = oneToCheck[0];
    const uri = oneToCheck[1];
    try {
      try {
        await resolveConnectionSpec(serverName);
      } finally {
        await checkConnection(true, uri, true);
      }
    } catch (_) {
      // Ignore any failure
      continue;
    }
  }

  // This constructor instantiates an AtelierAPI object, so needs to happen after resolving and checking connections above
  xmlContentProvider = new XmlContentProvider();

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
      vscode.workspace.onDidChangeTextDocument((event) => {
        diagnosticProvider.updateDiagnostics(event.document);
      }),
      vscode.window.onDidChangeActiveTextEditor(async (editor) => {
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

  // Create this here so we can fire its event
  const fileDecorationProvider = new FileDecorationProvider();

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
    vscode.workspace.onDidChangeTextDocument((event) => {
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
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
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
    vscode.commands.registerCommand("vscode-objectscript.refreshLocalFile", async (_file, files) => {
      const file = currentFile();
      if (!file) {
        return;
      }

      try {
        await loadChanges([file]);
      } catch (error) {
        let message = `Failed to overwrite file from server '${file.fileName}'.`;
        if (error && error.errorText && error.errorText !== "") {
          outputChannel.appendLine("\n" + error.errorText);
          outputChannel.show(true);
          message += " Check 'ObjectScript' output channel for details.";
        }
        vscode.window.showErrorMessage(message, "Dismiss");
        return;
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.compileFolder", (_file, files) =>
      Promise.all(files.map((file) => importFileOrFolder(file, false)))
    ),
    vscode.commands.registerCommand("vscode-objectscript.importFolder", (_file, files) =>
      Promise.all(files.map((file) => importFileOrFolder(file, true)))
    ),
    vscode.commands.registerCommand("vscode-objectscript.export", exportAll),
    vscode.commands.registerCommand("vscode-objectscript.copyToClipboard", (command: string) => {
      vscode.env.clipboard.writeText(command);
    }),
    vscode.commands.registerCommand("vscode-objectscript.debug", (program: string, askArgs: boolean) => {
      const startDebugging = (args) => {
        const programWithArgs = program + (program.includes("##class") || args.length ? `(${args})` : "");
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
      const api = new AtelierAPI(vscode.window.activeTextEditor?.document.uri);

      const list = await api.getJobs(system).then(async (jobData) => {
        // NOTE: We do not know if the current user has permissions to other namespaces
        // so lets only fetch the job info for the current namespace
        const currNamespaceJobs: { [k: string]: string } = await api
          .actionQuery("SELECT Job, ConfigName FROM Ens.Job_Enumerate() WHERE State = 'Alive'", [])
          .then((data) => Object.fromEntries(data.result.content.map((x) => [x.Job, x.ConfigName])))
          .catch((error) => {
            if (
              error &&
              error.errorText &&
              !error.errorText.includes("'ENS.JOB_ENUMERATE'(...)") &&
              error.errorText != ""
            ) {
              // Hide errors about Ens.Job_Enumerate procedure not existing because
              // the current namespace may not be Interoperability-enabled
              outputChannel.appendLine("\n" + error.errorText);
              outputChannel.show(true);
            }
            return {};
          });

        return jobData.result.content.map((process: AtelierJob): vscode.QuickPickItem => {
          if (!currNamespaceJobs[process.pid.toString()]) {
            return {
              label: process.pid.toString(),
              description: `Namespace: ${process.namespace}, Routine: ${process.routine}`,
            };
          } else {
            return {
              label: process.pid.toString(),
              description: `Namespace: ${process.namespace}, Routine: ${process.routine}, Config Name: ${
                currNamespaceJobs[process.pid.toString()]
              }`,
            };
          }
        });
      });
      if (!list.length) {
        vscode.window.showInformationMessage(`No attachable processes are running in ${api.ns}.`, {
          modal: true,
        });
        return;
      }
      return vscode.window
        .showQuickPick<vscode.QuickPickItem>(list, {
          placeHolder: "Pick the process to attach to",
          matchOnDescription: true,
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
      xml2doc(context, vscode.window.activeTextEditor);
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
      documentSelector("objectscript-class", "objectscript"),
      new ObjectScriptCodeLensProvider()
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
    vscode.commands.registerCommand("vscode-objectscript.showRESTDebugWebview", () =>
      RESTDebugPanel.create(context.extensionUri)
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
            if (!workspace) {
              // No workspace folders are open
              return null;
            }
            const workspacePath = uriOfWorkspaceFolder(workspace).fsPath;
            const filePathNoWorkspaceArr = f.fsPath.replace(workspacePath + path.sep, "").split(path.sep);
            const { folder, addCategory } = config("export", workspace);
            const expectedFolder = typeof folder === "string" && folder.length ? folder : null;
            const expectedFolderArr = expectedFolder.split(path.sep);
            if (
              expectedFolder !== null &&
              filePathNoWorkspaceArr.slice(0, expectedFolderArr.length).join(path.sep) === expectedFolder
            ) {
              filePathNoWorkspaceArr.splice(0, expectedFolderArr.length);
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
    vscode.window.registerCustomEditorProvider("vscode-objectscript.rule", new RuleEditorProvider(), {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
    }),
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
    }),
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
            await checkConnection(true, folder.uri, true);
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
    }),
    vscode.window.onDidCloseTerminal((t) => {
      const terminalIndex = terminals.findIndex((terminal) => terminal.name == t.name);
      if (terminalIndex > -1) {
        terminals.splice(terminalIndex, 1);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((file) => {
      if (openCustomEditors.includes(file.uri.toString())) {
        // Saving is handled by a different event listener
        return;
      }
      if (!schemas.includes(file.uri.scheme) && !config("importOnSave")) {
        // Don't save this local file on the server
        return;
      }
      if (schemas.includes(file.uri.scheme) || languages.includes(file.languageId)) {
        if (documentBeingProcessed !== file) {
          return importAndCompile(false, file, config("compileOnSave"));
        }
      } else if (file.uri.scheme === "file") {
        if (isImportableLocalFile(file) && new AtelierAPI(file.uri).active) {
          // This local file is part of a CSP application
          // or matches our export settings, so import it on save
          return importFileOrFolder(file.uri, true);
        }
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (textEditor: vscode.TextEditor) => {
      await checkConnection(false, textEditor?.document.uri);
      posPanel.text = "";
      if (textEditor?.document.fileName.endsWith(".xml") && config("autoPreviewXML")) {
        return xml2doc(context, textEditor);
      }
    }),
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
      let label = "";
      let pos = 0;
      vscode.commands
        .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", document.uri)
        .then((symbols) => {
          if (symbols != undefined) {
            const cursor = event.selections[0].active;
            if (symbols.length == 0 || cursor.isBefore(symbols[0].range.start)) {
              pos = cursor.line - 1;
            } else {
              for (const symbol of symbols) {
                if (symbol.range.contains(cursor)) {
                  label = symbol.name;
                  pos = cursor.line - symbol.range.start.line;
                  break;
                }
              }
            }
            posPanel.text = `${label}${pos > 0 ? "+" + pos : ""}^${routine}`;
          }
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.loadStudioSnippets", loadStudioSnippets),
    vscode.commands.registerCommand("vscode-objectscript.loadStudioColors", () => {
      loadStudioColors(languageServerExt);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.businessOperation", () =>
      newFile(NewFileType.BusinessOperation)
    ),
    vscode.commands.registerCommand("vscode-objectscript.newFile.bpl", () => newFile(NewFileType.BPL)),
    vscode.commands.registerCommand("vscode-objectscript.newFile.rule", () => newFile(NewFileType.Rule)),
    vscode.commands.registerCommand("vscode-objectscript.newFile.businessService", () =>
      newFile(NewFileType.BusinessService)
    ),
    vscode.commands.registerCommand("vscode-objectscript.newFile.dtl", () => newFile(NewFileType.DTL)),
    vscode.window.registerFileDecorationProvider(fileDecorationProvider),
    vscode.workspace.onDidOpenTextDocument((doc) => !doc.isUntitled && fileDecorationProvider.emitter.fire(doc.uri)),
    vscode.commands.registerCommand("vscode-objectscript.importLocalFilesServerSide", (wsFolderUri) => {
      if (
        wsFolderUri instanceof vscode.Uri &&
        wsFolderUri.scheme == FILESYSTEM_SCHEMA &&
        (vscode.workspace.workspaceFolders != undefined
          ? vscode.workspace.workspaceFolders.findIndex(
              (wsFolder) => wsFolder.uri.toString() == wsFolderUri.toString()
            ) != -1
          : false)
      ) {
        // wsFolderUri is an isfs workspace folder URI
        return importLocalFilesToServerSideFolder(wsFolderUri);
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.modifyWsFolder", modifyWsFolder),
    vscode.commands.registerCommand("vscode-objectscript.openErrorLocation", openErrorLocation),

    /* Anything we use from the VS Code proposed API */
    ...proposed
  );
  reporter && reporter.sendTelemetryEvent("extensionActivated");

  // The API we export
  const extensionApi = {
    serverForUri(uri: vscode.Uri): any {
      const { apiTarget } = connectionTarget(uri);
      const api = new AtelierAPI(apiTarget);

      // This function intentionally no longer exposes the password for a named server UNLESS it is already exposed as plaintext in settings.
      // API client extensions should use Server Manager 3's authentication provider to request a missing password themselves,
      // which will require explicit user consent to divulge the password to the requesting extension.

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
        password:
          serverName === ""
            ? password
            : vscode.workspace
                .getConfiguration(`intersystems.servers.${serverName.toLowerCase()}`, uri)
                .get("password"),
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
  return extensionApi;
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
