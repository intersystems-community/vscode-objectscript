import * as vscode from "vscode";
import { config, workspaceState, checkConnection, FILESYSTEM_SCHEMA, FILESYSTEM_READONLY_SCHEMA } from "../extension";
import { connectionTarget, terminalWithDocker, currentFile } from "../utils";
import { mainCommandMenu, mainSourceControlMenu } from "./studio";
import { AtelierAPI } from "../api";

export async function serverActions(): Promise<void> {
  const { apiTarget, configName: workspaceFolder } = connectionTarget();
  const api = new AtelierAPI(apiTarget);
  const { active, host = "", ns = "", https, port = 0, username, password } = api.config;
  const { links } = config("conn");
  const nsEncoded = encodeURIComponent(ns);
  const actions = [];
  if (!api.externalServer) {
    actions.push({
      detail: (active ? "Disable" : "Enable") + " current connection",
      id: "toggleConnection",
      label: "Toggle Connection",
    });
  }
  if (active) {
    actions.push({
      id: "refreshConnection",
      label: "Refresh Connection",
      detail: "Force attempt to connect to the server",
    });
  }
  const connectionActionsHandler = (action) => {
    if (!action) {
      return;
    }
    switch (action.id) {
      case "toggleConnection": {
        const connConfig = config("", workspaceFolder);
        const target = connConfig.inspect("conn").workspaceFolderValue
          ? vscode.ConfigurationTarget.WorkspaceFolder
          : vscode.ConfigurationTarget.Workspace;
        const targetConfig =
          connConfig.inspect("conn").workspaceFolderValue || connConfig.inspect("conn").workspaceValue;
        return connConfig.update("conn", { ...targetConfig, active: !active }, target);
      }
      case "refreshConnection": {
        checkConnection(true);
        break;
      }
      default:
        return action;
    }
  };
  if (!active || !host?.length || !port || !ns.length) {
    return vscode.window.showQuickPick(actions).then(connectionActionsHandler);
  }
  const connInfo = `${host}:${port}[${nsEncoded}]`;
  const serverUrl = `${https ? "https" : "http"}://${host}:${port}`;
  const portalUrl = `${serverUrl}/csp/sys/UtilHome.csp?$NAMESPACE=${nsEncoded}`;
  const classRef = `${serverUrl}/csp/documatic/%25CSP.Documatic.cls?LIBRARY=${nsEncoded}`;
  const iris = workspaceState.get(workspaceFolder + ":iris", false);
  const usernameEncoded = encodeURIComponent(username);
  const passwordEncoded = encodeURIComponent(password);
  const auth = iris
    ? `&IRISUsername=${usernameEncoded}&IRISPassword=${passwordEncoded}`
    : `&CacheUserName=${usernameEncoded}&CachePassword=${passwordEncoded}`;
  const extraLinks = [];
  const file = currentFile();
  const classname = file && file.name.match(/cls$/i) ? file.name : "";
  for (const title in links) {
    let link = String(links[title]);
    if (classname == "" && link.includes("${classname}")) {
      continue;
    }
    link = link
      .replace("${host}", host)
      .replace("${port}", port.toString())
      .replace("${namespace}", ns == "%SYS" ? "sys" : nsEncoded.toLowerCase())
      .replace("${classname}", classname);
    extraLinks.push({
      id: "extraLink" + extraLinks.length,
      label: title,
      detail: link,
    });
  }
  if (workspaceState.get(workspaceFolder + ":docker", false)) {
    actions.push({
      id: "openDockerTerminal",
      label: "Open Terminal in Docker",
      detail: "Use docker-compose to start session inside configured service",
    });
  }
  actions.push({
    detail: portalUrl,
    id: "openPortal",
    label: "Open Management Portal",
  });
  actions.push({
    detail: classRef,
    id: "openClassReference",
    label: "Open Class Reference",
  });
  if (
    !vscode.window.activeTextEditor ||
    vscode.window.activeTextEditor.document.uri.scheme === FILESYSTEM_SCHEMA ||
    vscode.window.activeTextEditor.document.uri.scheme === FILESYSTEM_READONLY_SCHEMA
  ) {
    actions.push({
      id: "serverSourceControlMenu",
      label: "Server Source Control...",
      detail: "Pick server-side source control action",
    });
    actions.push({
      id: "serverCommandMenu",
      label: "Server Command Menu...",
      detail: "Pick server-side command",
    });
  }
  return vscode.window
    .showQuickPick(actions, {
      placeHolder: `Select action for server: ${connInfo}`,
    })
    .then(connectionActionsHandler)
    .then((action) => {
      if (!action) {
        return;
      }
      switch (action.id) {
        case "openPortal": {
          vscode.env.openExternal(vscode.Uri.parse(portalUrl + auth));
          break;
        }
        case "openClassReference": {
          vscode.env.openExternal(vscode.Uri.parse(classRef + auth));
          break;
        }
        case "openDockerTerminal": {
          terminalWithDocker();
          break;
        }
        case "serverSourceControlMenu": {
          mainSourceControlMenu();
          break;
        }
        case "serverCommandMenu": {
          mainCommandMenu();
          break;
        }
        default: {
          vscode.env.openExternal(vscode.Uri.parse(action.detail));
        }
      }
    });
}
