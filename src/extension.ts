export const extensionId = "intersystems-community.vscode-objectscript";
export const lsExtensionId = "intersystems.language-server";
export const smExtensionId = "intersystems-community.servermanager";

import vscode = require("vscode");
import * as semver from "semver";
import * as serverManager from "@intersystems-community/intersystems-servermanager";
import { TelemetryReporter } from "@vscode/extension-telemetry";

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

export const clsLangId = "objectscript-class";
export const macLangId = "objectscript";
export const intLangId = "objectscript-int";
export const incLangId = "objectscript-macros";
export const cspLangId = "objectscript-csp";
export const outputLangId = "vscode-objectscript-output";

import * as url from "url";
import {
  importAndCompile,
  importFolder as importFileOrFolder,
  namespaceCompile,
  compileExplorerItems,
  checkChangedOnServer,
  compileOnly,
  importLocalFilesToServerSideFolder,
  loadChanges,
  importXMLFiles,
} from "./commands/compile";
import { deleteExplorerItems } from "./commands/delete";
import { exportAll, exportCurrentFile, exportDocumentsToXMLFile, exportExplorerItems } from "./commands/export";
import { serverActions } from "./commands/serverActions";
import { subclass } from "./commands/subclass";
import { superclass } from "./commands/superclass";
import { viewOthers } from "./commands/viewOthers";
import { extractXMLFileContents, previewXMLAsUDL } from "./commands/xmlToUdl";
import {
  mainCommandMenu,
  contextCommandMenu,
  fireOtherStudioAction,
  OtherStudioAction,
  contextSourceControlMenu,
  mainSourceControlMenu,
  StudioActions,
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
import { FileSystemProvider } from "./providers/FileSystemProvider/FileSystemProvider";
import { WorkspaceSymbolProvider } from "./providers/WorkspaceSymbolProvider";
import {
  connectionTarget,
  currentWorkspaceFolder,
  outputChannel,
  portFromDockerCompose,
  notNull,
  currentFile,
  isUnauthenticated,
  notIsfs,
  handleError,
  cspApps,
  otherDocExts,
  getWsServerConnection,
  isClassOrRtn,
  isImportableLocalFile,
  addWsServerRootFolderData,
  getWsFolder,
  exportedUris,
  displayableUri,
} from "./utils";
import { ObjectScriptDiagnosticProvider } from "./providers/ObjectScriptDiagnosticProvider";
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
export let iscIcon: vscode.Uri;

import { CodeActionProvider } from "./providers/CodeActionProvider";
import {
  addWorkspaceFolderForProject,
  compileProjectContents,
  createProject,
  deleteProject,
  exportProjectContents,
  modifyProject,
  modifyProjectMetadata,
} from "./commands/project";
import { loadStudioColors, loadStudioSnippets } from "./commands/studioMigration";
import { LowCodeEditorProvider } from "./providers/LowCodeEditorProvider";
import { newFile, NewFileType } from "./commands/newFile";
import { FileDecorationProvider } from "./providers/FileDecorationProvider";
import { RESTDebugPanel } from "./commands/restDebugPanel";
import { modifyWsFolder } from "./commands/addServerNamespaceToWorkspace";
import { WebSocketTerminalProfileProvider, launchWebSocketTerminal } from "./commands/webSocketTerminal";
import { setUpTestController } from "./commands/unitTest";
import { pickDocument } from "./utils/documentPicker";
import {
  disposeDocumentIndex,
  indexWorkspaceFolder,
  removeIndexOfWorkspaceFolder,
  storeTouchedByVSCode,
  updateIndex,
} from "./utils/documentIndex";
import { WorkspaceNode, NodeBase } from "./explorer/nodes";
import { showPlanWebview } from "./commands/showPlanPanel";
import { isfsConfig } from "./utils/FileProviderUtil";
import { showAllClassMembers } from "./commands/showAllClassMembers";

const packageJson = vscode.extensions.getExtension(extensionId).packageJSON;
const extensionVersion = packageJson.version;
const aiKey = packageJson.aiKey;
const PANEL_LABEL = "ObjectScript";
const lowCodeEditorViewType = packageJson.contributes.customEditors[0].viewType;

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

let reporter: TelemetryReporter;

export let checkingConnection = false;

export let serverManagerApi: serverManager.ServerManagerAPI;

/** Map of the intersystems.server connection specs we have resolved via the API to that extension */
const resolvedConnSpecs = new Map<string, any>();

/**
 * If servermanager extension is available, fetch the connection spec unless already cached.
 * Prompt for credentials if necessary.
 * @param serverName authority element of an isfs uri, or `objectscript.conn.server` property, or the name of a root folder with an `objectscript.conn.docker-compose` property object
 * @param uri if passed, re-check the `objectscript.conn.docker-compose` case in case servermanager API couldn't do that because we're still running our own `activate` method.
 */
export async function resolveConnectionSpec(
  serverName: string,
  uri?: vscode.Uri,
  scope?: vscode.ConfigurationScope
): Promise<void> {
  if (!serverManagerApi || !serverManagerApi.getServerSpec || !serverName) {
    return;
  }
  if (resolvedConnSpecs.has(serverName)) {
    // Already resolved
    return;
  }
  if (!vscode.workspace.getConfiguration("intersystems.servers", scope).has(serverName)) {
    // When not a defined server see it already resolved as a foldername that matches case-insensitively
    if (getResolvedConnectionSpec(serverName, undefined)) {
      return;
    }
  }

  let connSpec = await serverManagerApi.getServerSpec(serverName, scope);

  if (!connSpec && uri) {
    // Caller passed uri as a signal to process any docker-compose settings
    const { configName } = connectionTarget(uri);
    if (config("conn", configName)["docker-compose"]) {
      const serverForUri = await asyncServerForUri(uri);
      if (serverForUri) {
        connSpec = {
          name: serverForUri.serverName,
          webServer: {
            scheme: serverForUri.scheme,
            host: serverForUri.host,
            port: serverForUri.port,
            pathPrefix: serverForUri.pathPrefix,
          },
          superServer: {
            port: serverForUri.superserverPort,
          },
          username: serverForUri.username,
          password: serverForUri.password ? serverForUri.password : undefined,
          description: `Server for workspace folder '${serverName}'`,
        };
      }
    }
  }

  if (connSpec) {
    await resolvePassword(connSpec);
    resolvedConnSpecs.set(serverName, connSpec);
  }
}

async function resolvePassword(serverSpec, ignoreUnauthenticated = false): Promise<void> {
  if (
    // Connection isn't unauthenticated
    (!isUnauthenticated(serverSpec.username) || ignoreUnauthenticated) &&
    // A password is missing
    typeof serverSpec.password == "undefined"
  ) {
    const scopes = [serverSpec.name, serverSpec.username || ""];

    // Handle Server Manager extension version < 3.8.0
    const account = serverManagerApi.getAccount ? serverManagerApi.getAccount(serverSpec) : undefined;

    let session = await vscode.authentication.getSession(serverManager.AUTHENTICATION_PROVIDER, scopes, {
      silent: true,
      account,
    });
    if (!session) {
      session = await vscode.authentication.getSession(serverManager.AUTHENTICATION_PROVIDER, scopes, {
        createIfNone: true,
        account,
      });
    }
    if (session) {
      // If original spec lacked username use the one obtained from the user by the authprovider (exact case)
      serverSpec.username = serverSpec.username || session.scopes[1];
      serverSpec.password = session.accessToken;
    }
  }
}

/** Resolve credentials for `serverName` and returned the complete connection spec if successful */
export async function resolveUsernameAndPassword(serverName: string, oldSpec: any): Promise<any> {
  const newSpec: { name: string; username?: string; password?: string } = {
    name: serverName,
    username: oldSpec?.username,
  };
  await resolvePassword(newSpec, true);
  if (newSpec.password) {
    // Update the connection spec
    resolvedConnSpecs.set(serverName, {
      ...oldSpec,
      username: newSpec.username,
      password: newSpec.password,
    });
    return resolvedConnSpecs.get(serverName);
  }
}

/** Accessor for the cache of resolved connection specs */
export function getResolvedConnectionSpec(key: string, dflt: any): any {
  let spec = resolvedConnSpecs.get(key);
  if (spec) {
    return spec;
  }

  // Try a case-insensitive match
  key = resolvedConnSpecs.keys().find((oneKey) => oneKey.toLowerCase() === key.toLowerCase());
  if (key) {
    spec = resolvedConnSpecs.get(key);
    if (spec) {
      return spec;
    }
  }

  // Return the default if not found
  return dflt;
}

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
    await workspaceState.update(wsKey + ":superserverPort", undefined);
    await workspaceState.update(wsKey + ":password", undefined);
    await workspaceState.update(wsKey + ":apiVersion", undefined);
    await workspaceState.update(wsKey + ":serverVersion", undefined);
    await workspaceState.update(wsKey + ":docker", undefined);
    _onDidChangeConnection.fire();
  }
  let api = new AtelierAPI(apiTarget, false);
  const { active, host = "", port = 0, superserverPort = 0, username, ns = "" } = api.config;
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
      const {
        port: dockerPort,
        superserverPort: dockerSuperserverPort,
        docker: withDocker,
        service,
      } = await portFromDockerCompose(configName);
      workspaceState.update(wsKey + ":docker", withDocker);
      workspaceState.update(wsKey + ":dockerService", service);
      if (withDocker) {
        if (!dockerPort) {
          const errorMessage = `Something is wrong with your docker-compose connection settings, or your service is not running.`;
          handleError(errorMessage);
          panel.text = `${PANEL_LABEL} $(error)`;
          panel.tooltip = `ERROR - ${errorMessage}`;
          return;
        }
        if (dockerPort !== port) {
          workspaceState.update(wsKey + ":host", "localhost");
          workspaceState.update(wsKey + ":port", dockerPort);
        }
        if (dockerSuperserverPort && dockerSuperserverPort !== superserverPort) {
          workspaceState.update(wsKey + ":superserverPort", dockerSuperserverPort);
        }
        connInfo = `localhost:${dockerPort}[${ns}]`;
        _onDidChangeConnection.fire();
      }
    } catch (error) {
      handleError(error);
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
    handleError(message);
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
    if (!api.externalServer) {
      await setConnectionState(configName, true);
    }
    return;
  };

  // Do the check
  const serverInfoTimeout = 5000;
  return api
    .serverInfo(true, serverInfoTimeout)
    .then(gotServerInfo)
    .catch(async (error) => {
      let message = error.message;
      let errorMessage;
      if (error.statusCode === 401) {
        let success = false;
        message = "Not Authorized.";
        errorMessage = `Authorization error: Check your credentials in Settings, and that you have sufficient privileges on the /api/atelier web application on ${connInfo}`;
        const username = api.config.username;
        if (isUnauthenticated(username)) {
          vscode.window.showErrorMessage(
            `Unauthenticated access rejected by '${api.serverId}'.${
              !api.config.serverName ? " Connection has been disabled." : ""
            }`,
            "Dismiss"
          );
          if (api.config.serverName) {
            // Attempt to resolve a username and password
            const oldSpec = getResolvedConnectionSpec(
              api.config.serverName,
              vscode.workspace.getConfiguration("intersystems.servers", uri).get(api.config.serverName)
            );
            const newSpec = await resolveUsernameAndPassword(api.config.serverName, oldSpec);
            if (newSpec) {
              // We were able to resolve credentials, so try again
              await workspaceState.update(wsKey + ":password", newSpec.password);
              api = new AtelierAPI(apiTarget, false);
              await api
                .serverInfo(true, serverInfoTimeout)
                .then(async (info) => {
                  await gotServerInfo(info);
                  _onDidChangeConnection.fire();
                  success = true;
                })
                .catch(async (err) => {
                  error = err;
                  if (error?.statusCode != 401) errorMessage = undefined;
                  await workspaceState.update(wsKey + ":password", undefined);
                  success = false;
                })
                .finally(() => {
                  checkingConnection = false;
                });
            }
          } else {
            await setConnectionState(configName, false);
          }
        } else {
          success = await new Promise<boolean>((resolve) => {
            vscode.window
              .showInputBox({
                password: true,
                title: `Not Authorized. Enter password to connect as user '${username}' to ${connInfo}`,
                prompt: !api.externalServer ? "If no password is entered the connection will be disabled." : "",
                ignoreFocusOut: true,
              })
              .then(async (password) => {
                if (password) {
                  await workspaceState.update(wsKey + ":password", password);
                  resolve(
                    api
                      .serverInfo(true, serverInfoTimeout)
                      .then(async (info): Promise<boolean> => {
                        await gotServerInfo(info);
                        _onDidChangeConnection.fire();
                        return true;
                      })
                      .catch(async (err) => {
                        error = err;
                        if (error?.statusCode != 401) errorMessage = undefined;
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
                resolve(false);
              });
          });
        }
        if (success) return;
      }
      if (["ECONNABORTED", "ERR_CANCELED"].includes(error?.code)) {
        error = `Request timed out; server took longer than ${serverInfoTimeout} ms to respond.`;
        message = `Request timed out after ${serverInfoTimeout} ms`;
      }
      handleError(
        errorMessage ?? error,
        `Failed to connect to server '${api.serverId}'. Check your server configuration.`
      );
      panel.text = `${connInfo} $(error)`;
      panel.tooltip = `ERROR - ${message}`;
      await setConnectionState(configName, false);
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

/**
 * Set objectscript.conn.active at WorkspaceFolder level if objectscript.conn
 * is defined there, else set it at Workspace level.
 */
function setConnectionState(configName: string, active: boolean) {
  const connConfig: vscode.WorkspaceConfiguration = config("", configName);
  const target: vscode.ConfigurationTarget = connConfig.inspect("conn").workspaceFolderValue
    ? vscode.ConfigurationTarget.WorkspaceFolder
    : vscode.ConfigurationTarget.Workspace;
  const targetConfig: any =
    connConfig.inspect("conn").workspaceFolderValue || connConfig.inspect("conn").workspaceValue;
  return connConfig.update("conn", { ...targetConfig, active }, target);
}

function languageServer(install = true): vscode.Extension<any> {
  let extension = vscode.extensions.getExtension(lsExtensionId);

  async function languageServerInstall() {
    if (config("ignoreInstallLanguageServer")) {
      return;
    }
    try {
      await vscode.commands.executeCommand("extension.open", lsExtensionId);
    } catch (ex) {
      // Such command do not exists, suppose we are under Theia, it's not possible to install this extension this way
      return;
    }
    await vscode.window
      .showInformationMessage(
        `Install the [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=${lsExtensionId}) for improved intellisense and syntax coloring for ObjectScript code.`,
        "Install",
        "Later"
      )
      .then(async (action) => {
        if (action == "Install") {
          await vscode.commands.executeCommand("workbench.extensions.search", `@tag:"intersystems"`).then(null, null);
          await vscode.commands.executeCommand("workbench.extensions.installExtension", lsExtensionId);
          extension = vscode.extensions.getExtension(lsExtensionId);
        }
      });
  }

  if (!extension && install) {
    languageServerInstall();
  }

  return extension;
}

/** Show the proposed API prompt if required */
function proposedApiPrompt(active: boolean, added?: readonly vscode.WorkspaceFolder[]): void {
  if (
    (added || vscode.workspace.workspaceFolders || []).some((e) => filesystemSchemas.includes(e.uri.scheme)) &&
    !active &&
    config("showProposedApiPrompt")
  ) {
    // Prompt the user with the proposed api install instructions
    vscode.window
      .showInformationMessage(
        "[Searching across](https://code.visualstudio.com/docs/editor/codebasics#_search-across-files) and [quick opening](https://code.visualstudio.com/docs/getstarted/tips-and-tricks#_quick-open) server-side files requires [VS Code proposed APIs](https://code.visualstudio.com/api/advanced-topics/using-proposed-api). Show the instructions?",
        "Yes",
        "Later",
        "Never"
      )
      .then(async (action) => {
        switch (action) {
          case "Yes":
            vscode.commands.executeCommand(
              "workbench.action.browser.open",
              "https://github.com/intersystems-community/vscode-objectscript#enable-proposed-apis"
            );
            break;
          case "Never":
            config().update("showProposedApiPrompt", false, vscode.ConfigurationTarget.Global);
            break;
          case "Later":
          default:
        }
      });
  }
}

/**
 * A map of SystemModes for known servers.
 * The key is either `serverName`, or `host:port/pathPrefix`, lowercase.
 * The value is the value of `^%SYS("SystemMode")`, uppercase.
 */
const systemModes: Map<string, string> = new Map();

/** Output a message notifying the user of the SystemMode of any servers they are connected to. */
async function systemModeWarning(wsFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
  if (!wsFolders || wsFolders.length == 0) return;
  for (const wsFolder of wsFolders) {
    const api = new AtelierAPI(wsFolder.uri),
      mapKey = api.serverId.toLowerCase(),
      serverUrl = `${api.config.host}:${api.config.port}${api.config.pathPrefix}`,
      serverStr = ![undefined, ""].includes(api.config.serverName)
        ? `'${api.config.serverName}' (${serverUrl})`
        : serverUrl;
    if (!api.active) continue; // Skip inactive connections
    let systemMode = systemModes.get(mapKey);
    if (systemMode == undefined) {
      systemMode = await api
        .actionQuery("SELECT UPPER(Value) AS SystemMode FROM %Library.Global_Get(?,'^%SYS(\"SystemMode\")')", [api.ns])
        .then((data) => data.result.content[0]?.SystemMode ?? "")
        .catch(() => ""); // Swallow any errors, which will likely be SQL permissions errors
    }
    switch (systemMode) {
      case "LIVE":
        outputChannel.appendLine(
          `WARNING: Workspace folder '${wsFolder.name}' is connected to Live System ${serverStr}`
        );
        outputChannel.show(); // Steal focus because this is an important message
        break;
      case "TEST":
      case "FAILOVER":
        outputChannel.appendLine(
          `NOTE: Workspace folder '${wsFolder.name}' is connected to ${
            systemMode == "TEST" ? "Test" : "Failover"
          } System ${serverStr}`
        );
        outputChannel.show(true);
    }
    systemModes.set(mapKey, systemMode);
  }
}

/**
 * Fire the `OpenedDocument` UserAction for any workspace folders
 * that are showing the contents of a server-side project.
 * This must be done because technically a project is a "document".
 */
async function fireOpenProjectUserAction(wsFolders: readonly vscode.WorkspaceFolder[]): Promise<void> {
  if (!wsFolders || wsFolders.length == 0) return;
  for (const wsFolder of wsFolders) {
    if (notIsfs(wsFolder.uri)) return;
    const { project } = isfsConfig(wsFolder.uri);
    if (!project) return;
    const api = new AtelierAPI(wsFolder.uri);
    if (!api.active) return;
    new StudioActions().fireProjectUserAction(api, project, OtherStudioAction.OpenedDocument).catch(() => {
      // Swallow error because showing it is more disruptive than using a potentially outdated project definition
    });
  }
}

/**
 * Set when clause context keys so the ObjectScript Explorer and
 * Projects Explorer views are correctly shown or hidden depending
 * on the folders in this workspace
 */
function setExplorerContextKeys(): void {
  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  // Need to show both views if there are no folders in
  // this workspace so the "viewsWelcome" messages are shown
  vscode.commands.executeCommand(
    "setContext",
    "vscode-objectscript.hideExplorer",
    !(wsFolders.length == 0 || wsFolders.some((wf) => notIsfs(wf.uri)))
  );
  vscode.commands.executeCommand(
    "setContext",
    "vscode-objectscript.hideProjectsExplorer",
    !(wsFolders.length == 0 || wsFolders.some((wf) => filesystemSchemas.includes(wf.uri.scheme)))
  );
}

/** Cache the lists of web apps and abstract document types for all server-namespaces in `wsFolders` */
async function updateWebAndAbstractDocsCaches(wsFolders: readonly vscode.WorkspaceFolder[]): Promise<any> {
  if (!wsFolders?.length) return;
  const keys: Set<string> = new Set();
  const connections: { key: string; api: AtelierAPI }[] = [];
  // Filter out any duplicate connections
  for (const wsFolder of wsFolders) {
    const api = new AtelierAPI(wsFolder.uri);
    if (!api.active) continue;
    const { host, port, pathPrefix, ns } = api.config;
    const key = `${host}:${port}${pathPrefix}[${ns}]`.toLowerCase();
    if (keys.has(key)) continue;
    keys.add(key);
    connections.push({ key, api });
  }
  return Promise.allSettled(
    connections.map(async (connection) => {
      if (!cspApps.has(connection.key)) {
        const apps = await connection.api
          .getCSPApps()
          .then((data) => data?.result?.content)
          .catch(() => undefined);
        if (apps) cspApps.set(connection.key, apps);
      }
      if (!otherDocExts.has(connection.key)) {
        const exts = await connection.api
          .actionQuery("SELECT Extention FROM %Library.RoutineMgr_DocumentTypes()", [])
          .then((data) => data.result?.content?.map((e) => e.Extention))
          .catch(() => undefined);
        if (exts) otherDocExts.set(connection.key, exts);
      }
    })
  );
}

/** Send a telemetry event that `commandId` was executed */
function sendCommandTelemetryEvent(commandId: string): void {
  reporter?.sendTelemetryEvent("commandExecuted", { commandId });
}

/** Send a telemetry event that Studio Add-In `addIn` was opened */
export function sendStudioAddinTelemetryEvent(addInName: string): void {
  reporter?.sendTelemetryEvent("studioAddInOpened", { addInName });
}

/** Send a telemetry event with details of each folder in `wsFolders` */
function sendWsFolderTelemetryEvent(wsFolders: readonly vscode.WorkspaceFolder[], added = false): void {
  if (!reporter || !wsFolders?.length) return;
  wsFolders.forEach((wsFolder) => {
    const api = new AtelierAPI(wsFolder.uri);
    const { csp, project, ns } = isfsConfig(wsFolder.uri);
    const serverSide = filesystemSchemas.includes(wsFolder.uri.scheme);
    const conf = vscode.workspace.getConfiguration("objectscript", wsFolder);
    reporter.sendTelemetryEvent("workspaceFolder", {
      scheme: wsFolder.uri.scheme,
      added: String(added),
      isWeb: serverSide ? String(csp) : undefined,
      isProject: serverSide ? String(project.length > 0) : undefined,
      hasNs: serverSide ? String(typeof ns == "string") : undefined,
      serverVersion: api.active ? api.config.serverVersion : undefined,
      "config.syncLocalChanges": !serverSide ? conf.get("syncLocalChanges") : undefined,
      dockerCompose: !serverSide ? String(typeof conf.get("conn.docker-compose") == "object") : undefined,
      "config.conn.links": String(Object.keys(conf.get("conn.links", {})).length),
    });
  });
}

/** Send a telemetry event that a unit test run was started */
export function sendUnitTestTelemetryEvent(root: vscode.Uri, debug: boolean): void {
  reporter?.sendTelemetryEvent("unitTestRun", { scheme: root.scheme, debug: String(debug) });
}

/** Send a telemetry event that a non-class or routine client-side file was saved */
export function sendClientSideSyncTelemetryEvent(fileExt: string): void {
  reporter?.sendTelemetryEvent("clientSideFileSynced", { fileExt });
}

/** Send a telemetry event that a low-code editor was opened */
export function sendLowCodeTelemetryEvent(editorType: string, scheme: string): void {
  reporter?.sendTelemetryEvent("lowCodeEditorOpened", { editorType, scheme });
}

/** Send a telemetry event that the debugger was started */
export function sendDebuggerTelemetryEvent(debugType: string): void {
  reporter?.sendTelemetryEvent("debuggerStarted", { debugType });
}

/** Send a telemetry event that a Lite Terminal was started */
export function sendLiteTerminalTelemetryEvent(terminalOrigin: string): void {
  reporter?.sendTelemetryEvent("liteTerminalStarted", {
    terminalOrigin,
  });
}

/** The URIs of all classes that have been opened. Used when `objectscript.openClassContracted` is true */
let openedClasses: string[];

// Disposables for language configurations that can be modifed by settings
let macLangConf: vscode.Disposable;
let incLangConf: vscode.Disposable;
let intLangConf: vscode.Disposable;

export async function activate(context: vscode.ExtensionContext): Promise<any> {
  if (!packageJson.version.includes("-") || packageJson.version.includes("-beta.")) {
    // Don't send telemetry for development builds
    try {
      reporter = new TelemetryReporter(aiKey);
    } catch {
      // Run without telemetry
      reporter = undefined;
    }
  }

  // workaround for Theia, issue https://github.com/eclipse-theia/theia/issues/8435
  workspaceState = {
    keys: context.workspaceState.keys,
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      context.workspaceState.get(key, defaultValue) || defaultValue,
    update: (key: string, value: any): Thenable<void> => context.workspaceState.update(key, value),
  };
  extensionContext = context;
  workspaceState.update("workspaceFolder", undefined);

  // Get api for servermanager extension
  const smExt = vscode.extensions.getExtension(smExtensionId);
  if (!smExt.isActive) await smExt.activate();
  serverManagerApi = smExt.exports;

  documentContentProvider = new DocumentContentProvider();
  fileSystemProvider = new FileSystemProvider();
  explorerProvider = new ObjectScriptExplorerProvider();
  projectsExplorerProvider = new ProjectsExplorerProvider();
  posPanel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  posPanel.command = "vscode-objectscript.jumpToTagAndOffset";
  posPanel.show();

  panel = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
  panel.text = `${PANEL_LABEL}`;
  panel.command = "vscode-objectscript.serverActions";
  panel.show();

  const debugAdapterFactory = new ObjectScriptDebugAdapterDescriptorFactory();

  // Show or hide explorer views as needed
  setExplorerContextKeys();

  // Check one time (flushing cookies) each connection that is used by the workspace.
  // This gets any prompting for missing credentials done upfront, for simplicity.
  const toCheck = new Map<string, vscode.Uri>();
  vscode.workspace.workspaceFolders?.map((workspaceFolder) => {
    const uri = workspaceFolder.uri;
    const { configName } = connectionTarget(uri);
    const conn = config("conn", configName);

    // When docker-compose object is defined don't fall back to server name, which may have come from user-level settings
    const serverName = notIsfs(uri) && !conn["docker-compose"] ? conn.server : configName;
    toCheck.set(serverName, uri);
  });
  for await (const oneToCheck of toCheck) {
    const serverName = oneToCheck[0];
    const uri = oneToCheck[1];
    try {
      try {
        // Pass the uri to resolveConnectionSpec so it will fall back to docker-compose logic if required.
        // Necessary because we are in our activate method, so its call to the Server Manager API cannot call back to our API to do that.
        await resolveConnectionSpec(serverName, uri);
      } finally {
        await checkConnection(true, uri, true);
      }
    } catch (_) {
      // Ignore any failure
      continue;
    }
  }

  await updateWebAndAbstractDocsCaches(vscode.workspace.workspaceFolders);
  await addWsServerRootFolderData(vscode.workspace.workspaceFolders);

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
      outputChannel.appendLine("The intersystems.language-server extension is not installed or has been disabled.");
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
        documentSelector(clsLangId, macLangId, intLangId, incLangId),
        new ObjectScriptHoverProvider()
      ),
      vscode.languages.registerDocumentFormattingEditProvider(
        documentSelector(clsLangId, macLangId, intLangId, incLangId),
        new DocumentFormattingEditProvider()
      ),
      vscode.languages.registerDefinitionProvider(
        documentSelector(clsLangId, macLangId, intLangId, incLangId),
        new ObjectScriptDefinitionProvider()
      ),
      vscode.languages.registerCompletionItemProvider(
        documentSelector(clsLangId, macLangId, intLangId, incLangId),
        new ObjectScriptCompletionItemProvider(),
        "$",
        "^",
        ".",
        "#"
      ),
      vscode.languages.registerDocumentSymbolProvider(
        documentSelector(clsLangId),
        new ObjectScriptClassSymbolProvider()
      ),
      vscode.languages.registerDocumentSymbolProvider(
        documentSelector(macLangId, intLangId),
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
          documentSelector(clsLangId),
          new ObjectScriptClassFoldingRangeProvider()
        ),
        vscode.languages.registerFoldingRangeProvider(
          documentSelector(macLangId, intLangId),
          new ObjectScriptFoldingRangeProvider()
        )
      );
    }
  }

  openedClasses = workspaceState.get("openedClasses") ?? [];

  /** The stringified URIs of all `isfs` documents that are currently open in a UI tab */
  const isfsTabs: string[] = [];

  // Create this here so we can fire its event
  const fileDecorationProvider = new FileDecorationProvider();

  // Show the proposed API prompt if required
  proposedApiPrompt(proposed.length > 0);

  // Warn about SystemMode
  systemModeWarning(vscode.workspace.workspaceFolders);

  // Fire OpenedDocument UserAction for folders showing the contents of a server-side project
  fireOpenProjectUserAction(vscode.workspace.workspaceFolders);

  iscIcon = vscode.Uri.joinPath(context.extensionUri, "images", "fileIcon.svg");

  // Index documents in all local workspace folders
  for (const wf of vscode.workspace.workspaceFolders ?? []) indexWorkspaceFolder(wf);

  macLangConf = vscode.languages.setLanguageConfiguration(macLangId, getLanguageConfiguration(macLangId));
  incLangConf = vscode.languages.setLanguageConfiguration(incLangId, getLanguageConfiguration(incLangId));
  intLangConf = vscode.languages.setLanguageConfiguration(intLangId, getLanguageConfiguration(intLangId));

  // Migrate removed importOnSave setting to new, more generic syncLocalChanges
  const conf = vscode.workspace.getConfiguration("objectscript");
  const importOnSave = conf.inspect("importOnSave");
  if (typeof importOnSave.globalValue == "boolean") {
    if (!importOnSave.globalValue) {
      conf.update("syncLocalChanges", "off", vscode.ConfigurationTarget.Global);
    }
    conf.update("importOnSave", undefined, vscode.ConfigurationTarget.Global);
  }
  if (typeof importOnSave.workspaceValue == "boolean") {
    if (!importOnSave.workspaceValue) {
      conf.update("syncLocalChanges", "off", vscode.ConfigurationTarget.Workspace);
    }
    conf.update("importOnSave", undefined, vscode.ConfigurationTarget.Workspace);
  }

  context.subscriptions.push(
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
        event.document.uri.scheme == FILESYSTEM_SCHEMA &&
        // These two expressions will both be true only for
        // the edit that makes a document go from clean to dirty
        event.contentChanges.length == 0 &&
        event.document.isDirty
      ) {
        fireOtherStudioAction(OtherStudioAction.AttemptedEdit, event.document.uri);
      }
      if (!event.document.isDirty) {
        checkChangedOnServer(currentFile(event.document));
      }
      if (
        notIsfs(event.document.uri) &&
        ([clsLangId, macLangId, intLangId, incLangId].includes(event.document.languageId) ||
          isClassOrRtn(event.document.uri.path) ||
          isImportableLocalFile(event.document.uri))
      ) {
        // Update the local workspace folder index to incorporate this change
        updateIndex(event.document.uri);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (vscode.workspace.workspaceFolders?.length > 1) {
        const workspaceFolder = currentWorkspaceFolder();
        if (workspaceFolder && workspaceFolder != workspaceState.get<string>("workspaceFolder")) {
          await workspaceState.update("workspaceFolder", workspaceFolder);
          // Only need to check when editor is undefined because
          // we will always check when editor is defined below
          if (!editor) await checkConnection(false);
        }
      }
      if (editor) {
        const conf = vscode.workspace.getConfiguration("objectscript");
        const uriString = editor.document.uri.toString();
        await checkConnection(false, editor.document.uri);
        if (
          conf.get("openClassContracted") &&
          editor.document.languageId == clsLangId &&
          !openedClasses.includes(uriString)
        ) {
          vscode.commands.executeCommand("editor.foldLevel1");
          openedClasses.push(uriString);
        }
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.compile", () => {
      sendCommandTelemetryEvent("compile");
      importAndCompile(false);
    }),
    vscode.commands.registerCommand("vscode-objectscript.touchBar.compile", () => {
      sendCommandTelemetryEvent("touchBar.compile");
      importAndCompile(false);
    }),
    vscode.commands.registerCommand("vscode-objectscript.compileWithFlags", () => {
      sendCommandTelemetryEvent("compileWithFlags");
      importAndCompile(true);
    }),
    vscode.commands.registerCommand("vscode-objectscript.compileAll", () => {
      sendCommandTelemetryEvent("compileAll");
      namespaceCompile(false);
    }),
    vscode.commands.registerCommand("vscode-objectscript.compileAllWithFlags", () => {
      sendCommandTelemetryEvent("compileAllWithFlags");
      namespaceCompile(true);
    }),
    vscode.commands.registerCommand("vscode-objectscript.refreshLocalFile", async () => {
      sendCommandTelemetryEvent("refreshLocalFile");
      const file = currentFile();
      if (!file) return;
      try {
        await loadChanges([file]);
      } catch (error) {
        handleError(
          error,
          `Failed to overwrite contents of file '${displayableUri(file.uri)}' with server copy of '${file.fileName}'.`
        );
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.compileFolder", (_file, files) => {
      sendCommandTelemetryEvent("compileFolder");
      if (!_file && !files?.length) return;
      files = files ?? [_file];
      Promise.all(files.map((file) => importFileOrFolder(file, false)));
    }),
    vscode.commands.registerCommand("vscode-objectscript.importFolder", (_file, files) => {
      sendCommandTelemetryEvent("importFolder");
      if (!_file && !files?.length) return;
      files = files ?? [_file];
      Promise.all(files.map((file) => importFileOrFolder(file, true)));
    }),
    vscode.commands.registerCommand("vscode-objectscript.export", () => {
      sendCommandTelemetryEvent("export");
      exportAll();
    }),
    vscode.commands.registerCommand("vscode-objectscript.copyToClipboard", (command: string) => {
      sendCommandTelemetryEvent("copyToClipboard");
      vscode.env.clipboard.writeText(command);
    }),
    vscode.commands.registerCommand("vscode-objectscript.debug", (program: string, askArgs: boolean) => {
      sendCommandTelemetryEvent("debug");
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
          title: "Enter comma delimited arguments list",
        })
        .then((args) => {
          if (args != undefined && args != null) {
            startDebugging(args);
          }
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.pickProcess", async (config) => {
      sendCommandTelemetryEvent("pickProcess");
      const system = config.system;
      let connectionUri = vscode.window.activeTextEditor?.document.uri;
      if (connectionUri) {
        // Ignore active editor if its document is outside the workspace (e.g. user settings.json)
        connectionUri = vscode.workspace.getWorkspaceFolder(connectionUri)?.uri;
      }
      if (!connectionUri) {
        // May need to ask the user
        connectionUri = await getWsServerConnection();
      }
      if (!connectionUri) {
        return;
      }
      const api = new AtelierAPI(connectionUri);
      if (!api.active) {
        vscode.window.showErrorMessage(`Server connection is inactive.`, {
          modal: true,
        });
        return;
      }

      const list = await api.getJobs(system).then(async (jobData) => {
        // We do not know if the current user has permissions in other namespaces,
        // so only fetch the job info for the current namespace
        const currNamespaceJobs: { [k: string]: string } = await api
          .actionQuery("SELECT Job, ConfigName FROM Ens.Job_Enumerate() WHERE State = 'Alive'", [])
          .then((data) => Object.fromEntries(data.result.content.map((x) => [x.Job, x.ConfigName])))
          .catch((error) => {
            if (error?.errorText && error.errorText != "" && !error.errorText.includes("ENS.JOB_ENUMERATE")) {
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
        vscode.window.showInformationMessage(`No attachable processes are running in ${api.ns} on '${api.serverId}'.`, {
          modal: true,
        });
        return;
      }
      return vscode.window
        .showQuickPick<vscode.QuickPickItem>(list, {
          title: `Pick the process to attach to in ${api.ns} on '${api.serverId}'`,
          matchOnDescription: true,
        })
        .then((value) => {
          if (value) {
            const workspaceFolderIndex = vscode.workspace.workspaceFolders.findIndex(
              (folder) => folder.uri.toString() === connectionUri.toString()
            );
            return workspaceFolderIndex < 0 ? value.label : `${value.label}@${workspaceFolderIndex}`;
          }
        });
    }),
    vscode.commands.registerCommand("vscode-objectscript.jumpToTagAndOffset", () => {
      sendCommandTelemetryEvent("jumpToTagAndOffset");
      jumpToTagAndOffset();
    }),
    vscode.commands.registerCommand("vscode-objectscript.viewOthers", () => {
      sendCommandTelemetryEvent("viewOthers");
      viewOthers(false);
    }),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.sourceControl", (uri?: vscode.Uri) => {
      sendCommandTelemetryEvent("serverCommands.sourceControl");
      mainSourceControlMenu(uri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.contextSourceControl", (uri?: vscode.Uri) => {
      sendCommandTelemetryEvent("serverCommands.contextSourceControl");
      contextSourceControlMenu(uri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.other", (uri?: vscode.Uri) => {
      sendCommandTelemetryEvent("serverCommands.other");
      mainCommandMenu(uri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.serverCommands.contextOther", (uri?: vscode.Uri) => {
      sendCommandTelemetryEvent("serverCommands.contextOther");
      contextCommandMenu(uri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.subclass", () => {
      sendCommandTelemetryEvent("subclass");
      subclass();
    }),
    vscode.commands.registerCommand("vscode-objectscript.superclass", () => {
      sendCommandTelemetryEvent("superclass");
      superclass();
    }),
    vscode.commands.registerCommand("vscode-objectscript.serverActions", () => {
      sendCommandTelemetryEvent("serverActions");
      serverActions();
    }),
    vscode.commands.registerCommand("vscode-objectscript.touchBar.viewOthers", () => {
      sendCommandTelemetryEvent("touchBar.viewOthers");
      viewOthers(false);
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.refresh", () => {
      sendCommandTelemetryEvent("explorer.refresh");
      explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.refresh", () => {
      sendCommandTelemetryEvent("explorer.project.refresh");
      projectsExplorerProvider.refresh();
    }),
    // Register the vscode-objectscript.explorer.open command elsewhere
    registerExplorerOpen(),
    vscode.commands.registerCommand("vscode-objectscript.explorer.export", (item, items) => {
      sendCommandTelemetryEvent("explorer.export");
      exportExplorerItems(items && items.length ? items : [item]);
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.delete", (item, items) => {
      sendCommandTelemetryEvent("explorer.delete");
      deleteExplorerItems(items && items.length ? items : [item]);
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.compile", (item, items) => {
      sendCommandTelemetryEvent("explorer.compile");
      compileExplorerItems(items && items.length ? items : [item]);
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.showGenerated", (workspaceNode: WorkspaceNode) => {
      sendCommandTelemetryEvent("explorer.showGenerated");
      workspaceState.update(`ExplorerGenerated:${workspaceNode.uniqueId}`, true);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.showSystem", (workspaceNode: WorkspaceNode) => {
      sendCommandTelemetryEvent("explorer.showSystem");
      workspaceState.update(`ExplorerSystem:${workspaceNode.uniqueId}`, true);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.hideGenerated", (workspaceNode: WorkspaceNode) => {
      sendCommandTelemetryEvent("explorer.hideGenerated");
      workspaceState.update(`ExplorerGenerated:${workspaceNode.uniqueId}`, false);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.hideSystem", (workspaceNode: WorkspaceNode) => {
      sendCommandTelemetryEvent("explorer.hideSystem");
      workspaceState.update(`ExplorerSystem:${workspaceNode.uniqueId}`, false);
      return explorerProvider.refresh();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.otherNamespace", (workspaceNode: WorkspaceNode) => {
      sendCommandTelemetryEvent("explorer.otherNamespace");
      return explorerProvider.selectNamespace(workspaceNode.label);
    }),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.otherNamespaceClose",
      (workspaceNode: WorkspaceNode) => {
        return explorerProvider.closeExtra4Workspace(workspaceNode.label, workspaceNode.namespace);
      }
    ),
    vscode.commands.registerCommand("vscode-objectscript.previewXml", () => {
      sendCommandTelemetryEvent("previewXml");
      previewXMLAsUDL(vscode.window.activeTextEditor);
    }),
    vscode.commands.registerCommand("vscode-objectscript.addServerNamespaceToWorkspace", (resource?: vscode.Uri) => {
      sendCommandTelemetryEvent("addServerNamespaceToWorkspace");
      addServerNamespaceToWorkspace(resource);
    }),
    vscode.commands.registerCommand("vscode-objectscript.connectFolderToServerNamespace", () => {
      sendCommandTelemetryEvent("connectFolderToServerNamespace");
      connectFolderToServerNamespace();
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
    vscode.languages.setLanguageConfiguration(clsLangId, getLanguageConfiguration(clsLangId)),
    vscode.languages.registerCodeActionsProvider(documentSelector(clsLangId, macLangId), new CodeActionProvider()),
    vscode.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider()),
    vscode.debug.registerDebugConfigurationProvider("objectscript", new ObjectScriptConfigurationProvider()),
    vscode.debug.registerDebugAdapterDescriptorFactory("objectscript", debugAdapterFactory),
    debugAdapterFactory,
    vscode.languages.registerCodeLensProvider(
      documentSelector(clsLangId, macLangId, intLangId),
      new ObjectScriptCodeLensProvider()
    ),
    vscode.commands.registerCommand("vscode-objectscript.compileOnly", () => {
      sendCommandTelemetryEvent("compileOnly");
      compileOnly(false);
    }),
    vscode.commands.registerCommand("vscode-objectscript.compileOnlyWithFlags", () => {
      sendCommandTelemetryEvent("compileOnlyWithFlags");
      compileOnly(true);
    }),
    vscode.languages.registerDocumentLinkProvider({ language: outputLangId }, new DocumentLinkProvider()),
    vscode.commands.registerCommand("vscode-objectscript.editOthers", () => {
      sendCommandTelemetryEvent("editOthers");
      viewOthers(true);
    }),
    vscode.commands.registerCommand("vscode-objectscript.showClassDocumentationPreview", (uri: vscode.Uri) => {
      sendCommandTelemetryEvent("showClassDocumentationPreview");
      if (uri instanceof vscode.Uri) DocumaticPreviewPanel.create(uri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.showRESTDebugWebview", () => {
      sendCommandTelemetryEvent("showRESTDebugWebview");
      RESTDebugPanel.create();
    }),
    vscode.commands.registerCommand("vscode-objectscript.exportCurrentFile", () => {
      sendCommandTelemetryEvent("exportCurrentFile");
      exportCurrentFile();
    }),
    vscode.workspace.onDidCreateFiles((e: vscode.FileCreateEvent) =>
      e.files
        // Attempt to fill in stub content for classes and routines that
        // are not server-side files and were not created due to an export
        .filter((f) => notIsfs(f) && isClassOrRtn(f.path) && !exportedUris.has(f.toString()))
        .forEach(async (uri) => {
          // Need to wait in case file was created using "Save As..."
          // because in that case the file gets created without
          // content, and then the content is written in after that
          await new Promise((resolve) => setTimeout(resolve, 100));
          const sourceContent = await vscode.workspace.fs.readFile(uri);
          if (sourceContent.length) {
            // Don't modify a file with content
            return;
          }
          // Generate the new content
          const fileExt = uri.path.split(".").pop().toLowerCase();
          const newContent =
            fileExt == "cls"
              ? ["Class $1 Extends %RegisteredObject", "{", "// $0", "}", ""]
              : [
                  `ROUTINE $1${fileExt == "int" ? " [Type=INT]" : fileExt == "inc" ? " [Type=INC]" : ""}`,
                  `${fileExt == "int" ? ";" : "#;"} $0`,
                  "",
                ];
          // Make the edit
          const wsEdit = new vscode.WorkspaceEdit();
          wsEdit.set(uri, [
            [
              vscode.SnippetTextEdit.insert(
                new vscode.Position(0, 0),
                // Only use CRLF as the line termination string if we are certain the file is on a Windows file system
                new vscode.SnippetString(
                  newContent.join(uri.scheme == "file" && process.platform == "win32" ? "\r\n" : "\n")
                )
              ),
              {
                label: `New ObjectScript ${fileExt == "cls" ? "class" : fileExt == "inc" ? "include file" : "routine"}`,
                iconPath: iscIcon,
                needsConfirmation: false,
              },
            ],
          ]);
          vscode.workspace.applyEdit(wsEdit);
        })
    ),
    vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
      const uri: string = doc.uri.toString();
      const idx: number = openedClasses.indexOf(uri);
      if (idx > -1) {
        openedClasses.splice(idx, 1);
      }
      const isfsIdx = isfsTabs.indexOf(uri);
      if (isfsIdx > -1) {
        isfsTabs.splice(isfsIdx, 1);
        fireOtherStudioAction(OtherStudioAction.ClosedDocument, doc.uri);
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.addItemsToProject", (item) => {
      sendCommandTelemetryEvent("addItemsToProject");
      return modifyProject(item instanceof NodeBase || item instanceof vscode.Uri ? item : undefined, "add");
    }),
    vscode.commands.registerCommand("vscode-objectscript.removeFromProject", (item) => {
      sendCommandTelemetryEvent("removeFromProject");
      return modifyProject(item instanceof NodeBase || item instanceof vscode.Uri ? item : undefined, "remove");
    }),
    vscode.commands.registerCommand("vscode-objectscript.removeItemsFromProject", (item) => {
      sendCommandTelemetryEvent("removeItemsFromProject");
      return modifyProject(item instanceof NodeBase || item instanceof vscode.Uri ? item : undefined, "remove");
    }),
    vscode.commands.registerCommand("vscode-objectscript.modifyProjectMetadata", (item) => {
      sendCommandTelemetryEvent("modifyProjectMetadata");
      return modifyProjectMetadata(item instanceof NodeBase || item instanceof vscode.Uri ? item : undefined);
    }),
    vscode.commands.registerCommand("vscode-objectscript.createProject", (node) => {
      sendCommandTelemetryEvent("createProject");
      createProject(node);
    }),
    vscode.commands.registerCommand("vscode-objectscript.deleteProject", (node) => {
      sendCommandTelemetryEvent("deleteProject");
      deleteProject(node);
    }),
    vscode.commands.registerCommand("vscode-objectscript.exportProjectContents", () => {
      sendCommandTelemetryEvent("exportProjectContents");
      exportProjectContents();
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.compileProjectContents", (node) => {
      sendCommandTelemetryEvent("explorer.project.compileProjectContents");
      compileProjectContents(node);
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.openOtherServerNs", () => {
      sendCommandTelemetryEvent("explorer.project.openOtherServerNs");
      pickServerAndNamespace().then((pick) => {
        if (pick != undefined) {
          projectsExplorerProvider.openExtraServerNs(pick);
        }
      });
    }),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.closeOtherServerNs", (node) =>
      projectsExplorerProvider.closeExtraServerNs(node)
    ),
    vscode.commands.registerCommand("vscode-objectscript.explorer.project.addWorkspaceFolderForProject", (node) => {
      sendCommandTelemetryEvent("explorer.project.addWorkspaceFolderForProject");
      addWorkspaceFolderForProject(node);
    }),
    vscode.window.registerCustomEditorProvider(lowCodeEditorViewType, new LowCodeEditorProvider(), {
      webviewOptions: {
        retainContextWhenHidden: true,
      },
      supportsMultipleEditorsPerDocument: false,
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
        for await (const folder of vscode.workspace.workspaceFolders ?? []) {
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
        updateWebAndAbstractDocsCaches(vscode.workspace.workspaceFolders);
      }
      if (affectsConfiguration("objectscript.commentToken")) {
        // Update the language configuration for "objectscript" and "objectscript-macros"
        macLangConf?.dispose();
        incLangConf?.dispose();
        macLangConf = vscode.languages.setLanguageConfiguration(macLangId, getLanguageConfiguration(macLangId));
        incLangConf = vscode.languages.setLanguageConfiguration(incLangId, getLanguageConfiguration(incLangId));
      }
      if (affectsConfiguration("objectscript.intCommentToken")) {
        // Update the language configuration for "objectscript-int"
        intLangConf?.dispose();
        intLangConf = vscode.languages.setLanguageConfiguration(intLangId, getLanguageConfiguration(intLangId));
      }
    }),
    vscode.window.onDidCloseTerminal((t) => {
      const terminalIndex = terminals.findIndex((terminal) => terminal.name == t.name);
      if (terminalIndex > -1) {
        terminals.splice(terminalIndex, 1);
      }
    }),
    vscode.window.onDidChangeTextEditorSelection(async (event: vscode.TextEditorSelectionChangeEvent) => {
      const document = event.textEditor.document;
      // Avoid losing position indicator if event came from output channel or a non-active editor
      if (document.uri.scheme == "output" || vscode.window.activeTextEditor != event.textEditor) return;
      try {
        if (
          ![macLangId, intLangId].includes(document.languageId) ||
          event.selections.length > 1 ||
          !event.selections[0].isEmpty
        ) {
          throw undefined;
        }
        const file = currentFile(document);
        const nameMatch = file.name.match(/(.*)\.(int|mac)$/i);
        if (!nameMatch) throw undefined;
        const [, routine] = nameMatch;
        let label = "";
        let pos = 0;
        await vscode.commands
          .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", document.uri)
          .then((symbols) => {
            if (!symbols) throw undefined;
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
          });
      } catch {
        // If we couldn't resolve the cursor location to a label+offset^routine
        // for any reason, hide the status bar item
        posPanel.text = "";
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.loadStudioSnippets", () => {
      sendCommandTelemetryEvent("loadStudioSnippets");
      loadStudioSnippets();
    }),
    vscode.commands.registerCommand("vscode-objectscript.loadStudioColors", () => {
      sendCommandTelemetryEvent("loadStudioColors");
      loadStudioColors(languageServerExt);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.businessOperation", () => {
      sendCommandTelemetryEvent("newFile.businessOperation");
      newFile(NewFileType.BusinessOperation);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.bpl", () => {
      sendCommandTelemetryEvent("newFile.bpl");
      newFile(NewFileType.BPL);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.rule", () => {
      sendCommandTelemetryEvent("newFile.rule");
      newFile(NewFileType.Rule);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.businessService", () => {
      sendCommandTelemetryEvent("newFile.businessService");
      newFile(NewFileType.BusinessService);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.dtl", () => {
      sendCommandTelemetryEvent("newFile.dtl");
      newFile(NewFileType.DTL);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.kpi", () => {
      sendCommandTelemetryEvent("newFile.kpi");
      newFile(NewFileType.KPI);
    }),
    vscode.commands.registerCommand("vscode-objectscript.newFile.message", () => {
      sendCommandTelemetryEvent("newFile.message");
      newFile(NewFileType.Message);
    }),
    vscode.window.registerFileDecorationProvider(fileDecorationProvider),
    vscode.workspace.onDidOpenTextDocument((doc) => !doc.isUntitled && fileDecorationProvider.emitter.fire(doc.uri)),
    vscode.commands.registerCommand("vscode-objectscript.importLocalFilesServerSide", (wsFolderUri) => {
      sendCommandTelemetryEvent("importLocalFilesServerSide");
      if (
        wsFolderUri instanceof vscode.Uri &&
        wsFolderUri.scheme == FILESYSTEM_SCHEMA &&
        (vscode.workspace.workspaceFolders != undefined
          ? vscode.workspace.workspaceFolders.some((wsFolder) => wsFolder.uri.toString() == wsFolderUri.toString())
          : false)
      ) {
        // wsFolderUri is an isfs workspace folder URI
        return importLocalFilesToServerSideFolder(wsFolderUri);
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.modifyWsFolder", (wsFolderUri?: vscode.Uri) => {
      sendCommandTelemetryEvent("modifyWsFolder");
      modifyWsFolder(wsFolderUri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.openErrorLocation", () => {
      sendCommandTelemetryEvent("openErrorLocation");
      openErrorLocation();
    }),
    vscode.commands.registerCommand("vscode-objectscript.launchWebSocketTerminal", () => {
      launchWebSocketTerminal();
    }),
    vscode.commands.registerCommand(
      "vscode-objectscript.intersystems-servermanager.webterminal",
      (namespaceTreeItem) => {
        sendCommandTelemetryEvent("intersystems-servermanager.webterminal");
        const idArray = namespaceTreeItem.id.split(":");
        const namespace = idArray[3];
        const serverTreeItem = namespaceTreeItem?.parent?.parent;
        const isWsFolderServer =
          serverTreeItem?.label.includes("(") && typeof serverTreeItem?.params?.serverSummary?.scope?.uri == "object";
        launchWebSocketTerminal(
          // Support servers that are defined at the workspace-folder level
          isWsFolderServer
            ? serverTreeItem?.params?.serverSummary?.scope?.uri
            : vscode.Uri.from({ scheme: "isfs", authority: `${idArray[1]}:${namespace}` }),
          isWsFolderServer ? namespace : undefined
        );
      }
    ),
    vscode.commands.registerCommand("vscode-objectscript.ObjectScriptExplorer.webterminal", (node: NodeBase) => {
      sendCommandTelemetryEvent("ObjectScriptExplorer.webterminal");
      const targetUri = DocumentContentProvider.getUri(
        node.fullName,
        node.workspaceFolder,
        node.namespace,
        undefined,
        undefined,
        true
      );
      launchWebSocketTerminal(targetUri);
    }),
    vscode.window.registerTerminalProfileProvider(
      "vscode-objectscript.webSocketTerminal",
      new WebSocketTerminalProfileProvider()
    ),
    vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
      // Make sure we have a resolved connection spec for the targets of all added folders
      const toCheck = new Map<string, vscode.Uri>();
      e.added.map((workspaceFolder) => {
        const uri = workspaceFolder.uri;
        const { configName } = connectionTarget(uri);
        toCheck.set(configName, uri);
      });
      for await (const oneToCheck of toCheck) {
        const configName = oneToCheck[0];
        const uri = oneToCheck[1];
        const serverName = notIsfs(uri) ? config("conn", configName).server : configName;
        await resolveConnectionSpec(serverName);
      }
      // await this so the next step can take advantage of the caching
      await updateWebAndAbstractDocsCaches(e.added);
      addWsServerRootFolderData(e.added);
      // Show the proposed API prompt if required
      proposedApiPrompt(proposed.length > 0, e.added);
      // Warn about SystemMode
      systemModeWarning(e.added);
      // Update the local workspace folder index
      for (const a of e.added) indexWorkspaceFolder(a);
      for (const r of e.removed) removeIndexOfWorkspaceFolder(r);
      // Show or hide explorer views as needed
      setExplorerContextKeys();
      // Fire OpenedDocument UserAction for added folders showing the contents of a server-side project
      fireOpenProjectUserAction(e.added);
      // Send telemetry events for all added folders
      sendWsFolderTelemetryEvent(e.added, true);
    }),
    vscode.commands.registerCommand("vscode-objectscript.importXMLFiles", () => {
      sendCommandTelemetryEvent("importXMLFiles");
      importXMLFiles();
    }),
    vscode.commands.registerCommand("vscode-objectscript.exportToXMLFile", () => {
      sendCommandTelemetryEvent("exportToXMLFile");
      exportDocumentsToXMLFile();
    }),
    vscode.commands.registerCommand("vscode-objectscript.extractXMLFileContents", (xmlUri?: vscode.Uri) => {
      sendCommandTelemetryEvent("extractXMLFileContents");
      extractXMLFileContents(xmlUri);
    }),
    vscode.commands.registerCommand(
      "vscode-objectscript.openPathInBrowser",
      async (path: string, docUri: vscode.Uri) => {
        sendCommandTelemetryEvent("openPathInBrowser");
        if (typeof path == "string" && docUri instanceof vscode.Uri) {
          const api = new AtelierAPI(docUri);
          // Get the default web application for this namespace.
          // If it can't be determined, fall back to the /csp/<namespace> web application.
          const app: string =
            (await api
              .getCSPApps(true)
              .then((data) => data.result.content.find((a) => a.default)?.name)
              .catch(() => {
                // Swallow errors
              })) ?? `/csp/${api.ns}`;
          vscode.commands.executeCommand(
            "workbench.action.browser.open",
            `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
              api.config.pathPrefix
            }${app}${path}`
          );
        }
      }
    ),
    vscode.commands.registerCommand("vscode-objectscript.compileIsfs", (uri) => {
      sendCommandTelemetryEvent("compileIsfs");
      fileSystemProvider.compile(uri);
    }),
    vscode.commands.registerCommand("vscode-objectscript.openISCDocument", async () => {
      sendCommandTelemetryEvent("openISCDocument");
      const wsFolder = await getWsFolder(
        "Pick the workspace folder where you want to open a document",
        false,
        false,
        false,
        true
      );
      if (!wsFolder) {
        if (wsFolder === undefined) {
          // Strict equality needed because undefined == null
          vscode.window.showErrorMessage("No workspace folders with an active server connection are open.", "Dismiss");
        }
        return;
      }
      const api = new AtelierAPI(wsFolder.uri);
      if (!api.active) {
        vscode.window.showErrorMessage(
          "'Open InterSystems Document...' command requires an active server connection.",
          "Dismiss"
        );
        return;
      }
      const doc = await pickDocument(api, "Open a document");
      if (!doc) return;
      vscode.window.showTextDocument(
        DocumentContentProvider.getUri(doc, undefined, undefined, undefined, wsFolder.uri)
      );
    }),
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      const processUri = (uri: vscode.Uri): void => {
        if (uri.scheme == FILESYSTEM_SCHEMA) {
          isfsTabs.push(uri.toString());
          fireOtherStudioAction(OtherStudioAction.OpenedDocument, uri);
        }
      };
      for (const t of e.opened) {
        if (t.input instanceof vscode.TabInputText || t.input instanceof vscode.TabInputCustom) {
          processUri(t.input.uri);
        } else if (t.input instanceof vscode.TabInputTextDiff) {
          processUri(t.input.original);
          processUri(t.input.modified);
        }
      }
    }),
    ...setUpTestController(context),
    vscode.commands.registerCommand("vscode-objectscript.reopenInLowCodeEditor", (uri: vscode.Uri) => {
      if (vscode.window.activeTextEditor?.document.uri.toString() == uri.toString()) {
        vscode.commands
          .executeCommand("workbench.action.closeActiveEditor")
          .then(() => vscode.commands.executeCommand("vscode.openWith", uri, lowCodeEditorViewType));
      }
    }),
    vscode.commands.registerCommand("vscode-objectscript.showPlanWebview", (args) => {
      sendCommandTelemetryEvent("showPlanWebview");
      if (typeof args != "object") return;
      showPlanWebview(args);
    }),
    vscode.window.createTreeView("ObjectScriptExplorer", {
      treeDataProvider: explorerProvider,
      showCollapseAll: true,
      canSelectMany: true,
    }),
    vscode.window.createTreeView("ObjectScriptProjectsExplorer", {
      treeDataProvider: projectsExplorerProvider,
      showCollapseAll: true,
      canSelectMany: false,
    }),
    vscode.commands.registerCommand("vscode-objectscript.showAllClassMembers", (uri: vscode.Uri) => {
      sendCommandTelemetryEvent("showAllClassMembers");
      if (uri instanceof vscode.Uri) showAllClassMembers(uri);
    }),
    vscode.workspace.onDidSaveTextDocument((d) => {
      // If the document just saved is a server-side document that needs to be updated in the UI,
      // then force VS Code to update the document's contents. This is needed if the document has
      // been changed during a save, for example by adding or changing the Storage definition.
      if (notIsfs(d.uri)) return;
      const uriString = d.uri.toString();
      if (fileSystemProvider.needsUpdate(uriString)) {
        const activeDoc = vscode.window.activeTextEditor?.document;
        if (activeDoc && !activeDoc.isDirty && !activeDoc.isClosed && activeDoc.uri.toString() == uriString) {
          // Force VS Code to refresh the file's contents in the editor tab
          vscode.commands.executeCommand("workbench.action.files.revert");
        }
      }
    }),
    // These three listeners are needed to keep track of which file events were caused by VS Code
    // to support the "vscodeOnly" option for the objectscript.syncLocalChanges setting.
    // They store the URIs of files that are about to be changed by VS Code.
    // The curresponding file system watcher listener in documentIndex.ts will pick up the
    // event after these listeners are called, and it removes the affected URIs from the Set.
    // The "waitUntil" Promises are needed to ensure that these listeners complete
    // before the file system watcher listeners are called. This should not have any noticable
    // effect on the user experience since the Promises will resolve very quickly.
    vscode.workspace.onWillSaveTextDocument((e) =>
      e.waitUntil(
        new Promise<void>((resolve) => {
          storeTouchedByVSCode(e.document.uri);
          resolve();
        })
      )
    ),
    vscode.workspace.onWillCreateFiles((e) =>
      e.waitUntil(
        new Promise<void>((resolve) => {
          e.files.forEach((f) => storeTouchedByVSCode(f));
          resolve();
        })
      )
    ),
    vscode.workspace.onWillDeleteFiles((e) =>
      e.waitUntil(
        new Promise<void>((resolve) => {
          e.files.forEach((f) => storeTouchedByVSCode(f));
          resolve();
        })
      )
    ),

    /* Anything we use from the VS Code proposed API */
    ...proposed
  );

  // Send the activation and workspace folders telemetry events
  reporter?.sendTelemetryEvent("extensionActivated", {
    languageServerVersion: languageServerExt?.packageJSON.version,
    serverManagerVersion: smExt?.packageJSON.version,
    "config.showProposedApiPrompt": String(conf.get("showProposedApiPrompt")),
    "config.unitTest.enabled": String(conf.get("unitTest.enabled")),
  });
  sendWsFolderTelemetryEvent(vscode.workspace.workspaceFolders);

  // The API we export
  const extensionApi = {
    serverForUri,
    asyncServerForUri,
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

// This function is exported as one of our API functions but is also used internally
// for example to implement the async variant capable of resolving docker port number.
function serverForUri(uri: vscode.Uri): any {
  const { apiTarget, configName } = connectionTarget(uri);
  const configNameLower = configName.toLowerCase();
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
    superserverPort,
    pathPrefix,
    username,
    password,
    ns = "",
    apiVersion,
    serverVersion,
  } = api.config;
  return {
    serverName,
    active,
    scheme: https ? "https" : "http",
    host,
    port,
    superserverPort,
    pathPrefix,
    username,
    password:
      serverName === ""
        ? password
        : vscode.workspace
            .getConfiguration(
              `intersystems.servers.${serverName.toLowerCase()}`,
              // objectscript(xml):// URIs are not in any workspace folder,
              // so make sure we resolve the server definition with the proper
              // granularity. This is needed to prevent other extensions like
              // Language Server prompting for a passwoord when it's not needed.
              [OBJECTSCRIPT_FILE_SCHEMA, OBJECTSCRIPTXML_FILE_SCHEMA].includes(uri.scheme)
                ? vscode.workspace.workspaceFolders?.find((f) => f.name.toLowerCase() == configNameLower)?.uri
                : uri
            )
            .get("password"),
    namespace: ns,
    apiVersion: active ? apiVersion : undefined,
    serverVersion: active ? serverVersion : undefined,
  };
}

// An async variant capable of resolving docker port number.
// It is exported as one of our API functions but is also used internally.
async function asyncServerForUri(uri: vscode.Uri): Promise<any> {
  const server = serverForUri(uri);
  if (!server.port) {
    let { apiTarget } = connectionTarget(uri);
    if (apiTarget instanceof vscode.Uri) {
      apiTarget = vscode.workspace.getWorkspaceFolder(apiTarget)?.name;
    }
    const {
      port: dockerPort,
      superserverPort: dockerSuperserverPort,
      docker: withDocker,
    } = await portFromDockerCompose(apiTarget);
    if (withDocker && dockerPort && dockerSuperserverPort) {
      server.port = dockerPort;
      server.superserverPort = dockerSuperserverPort;
      server.host = "localhost";
      server.pathPrefix = "";
      server.https = false;
    }
  }
  return server;
}

export async function deactivate(): Promise<void> {
  if (workspaceState) {
    workspaceState.update("openedClasses", openedClasses);
  }
  reporter?.dispose();
  if (terminals) {
    terminals.forEach((t) => t.dispose());
  }
  macLangConf?.dispose();
  incLangConf?.dispose();
  intLangConf?.dispose();
  disposeDocumentIndex();
  // Log out of all CSP sessions
  const loggedOut: Set<string> = new Set();
  const promises: Promise<any>[] = [];
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    const api = new AtelierAPI(f.uri);
    if (!api.active || !api.cookies.length) continue;
    const sessionCookie = api.cookies.find((c) => c.startsWith("CSPSESSIONID-"));
    if (!sessionCookie || loggedOut.has(sessionCookie)) continue;
    loggedOut.add(sessionCookie);
    promises.push(
      api.request(
        0,
        "HEAD",
        undefined,
        undefined,
        // Prefer IRISLogout for servers that support it
        semver.lt(api.config.serverVersion, "2018.2.0") ? { CacheLogout: "end" } : { IRISLogout: "end" }
      )
    );
  }
  await Promise.allSettled(promises);
}
