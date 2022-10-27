import * as vscode from "vscode";
import {
  config,
  workspaceState,
  checkConnection,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
  explorerProvider,
} from "../extension";
import { connectionTarget, terminalWithDocker, shellWithDocker, currentFile } from "../utils";
import { mainCommandMenu, mainSourceControlMenu } from "./studio";
import { AtelierAPI } from "../api";
import { getCSPToken } from "../utils/getCSPToken";

type ServerAction = { detail: string; id: string; label: string; rawLink?: string };
export async function serverActions(): Promise<void> {
  const { apiTarget, configName: workspaceFolder } = connectionTarget();
  const api = new AtelierAPI(apiTarget);
  const { active, host = "", ns = "", https, port = 0, pathPrefix, docker } = api.config;
  const explorerCount = (await explorerProvider.getChildren()).length;
  if (!explorerCount && (!docker || host === "")) {
    await vscode.commands.executeCommand("ObjectScriptExplorer.focus");
  }
  const { links } = config("conn");
  const nsEncoded = encodeURIComponent(ns);
  const actions: ServerAction[] = [];
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
  const connectionActionsHandler = async (action: ServerAction): Promise<ServerAction> => {
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
        await checkConnection(true, undefined, true);
        break;
      }
      default:
        return action;
    }
  };
  if (!active || !host?.length || !port || !ns.length) {
    return vscode.window
      .showQuickPick(actions)
      .then(connectionActionsHandler)
      .then(() => {
        return;
      });
  }
  const file = currentFile();
  const classname = file && file.name.toLowerCase().endsWith(".cls") ? file.name.slice(0, -4) : "";
  const classnameEncoded = encodeURIComponent(classname);
  const connInfo = `${host}:${port}${pathPrefix}[${nsEncoded.toUpperCase()}]`;
  const serverUrl = `${https ? "https" : "http"}://${host}:${port}${pathPrefix}`;
  const portalPath = `/csp/sys/UtilHome.csp?$NAMESPACE=${nsEncoded}`;
  const classRef = `/csp/documatic/%25CSP.Documatic.cls?LIBRARY=${nsEncoded}${
    classname ? "&CLASSNAME=" + classnameEncoded : ""
  }`;
  let extraLinks = 0;
  for (const title in links) {
    const rawLink = String(links[title]);
    // Skip link if it requires a classname and we don't currently have one
    if (classname == "" && (rawLink.includes("${classname}") || rawLink.includes("${classnameEncoded}"))) {
      continue;
    }
    const link = rawLink
      .replace("${host}", host)
      .replace("${port}", port.toString())
      .replace("${serverUrl}", serverUrl)
      .replace("${serverAuth}", "")
      .replace("${ns}", nsEncoded)
      .replace("${namespace}", ns == "%SYS" ? "sys" : nsEncoded.toLowerCase())
      .replace("${classname}", classname)
      .replace("${classnameEncoded}", classnameEncoded);
    actions.push({
      id: "extraLink" + extraLinks++,
      label: title,
      detail: link,
      rawLink,
    });
  }
  if (workspaceState.get(workspaceFolder + ":docker", false)) {
    actions.push({
      id: "openDockerTerminal",
      label: "Open Terminal in Docker",
      detail: "Use docker-compose to start session inside configured service",
    });
  }
  if (workspaceState.get(workspaceFolder + ":docker", false)) {
    actions.push({
      id: "openDockerShell",
      label: "Open Shell in Docker",
      detail: "Use docker-compose to start shell inside configured service",
    });
  }
  actions.push({
    id: "openPortal",
    label: "Open Management Portal",
    detail: serverUrl + portalPath,
  });
  actions.push({
    id: "openClassReference",
    label: "Open Class Reference" + (classname ? ` for ${classname}` : ""),
    detail: serverUrl + classRef,
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
    .then(async (action) => {
      if (!action) {
        return;
      }
      switch (action.id) {
        case "openPortal": {
          const token = await getCSPToken(api, portalPath);
          const urlString = `${serverUrl}${portalPath}&CSPCHD=${token}`;
          vscode.env.openExternal(vscode.Uri.parse(urlString));
          break;
        }
        case "openClassReference": {
          const token = await getCSPToken(api, classRef);
          const urlString = `${serverUrl}${classRef}&CSPCHD=${token}`;
          vscode.env.openExternal(vscode.Uri.parse(urlString));
          break;
        }
        case "openDockerTerminal": {
          terminalWithDocker();
          break;
        }
        case "openDockerShell": {
          shellWithDocker();
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
          let urlString = action.detail;
          if (action.rawLink?.startsWith("${serverUrl}")) {
            const path = vscode.Uri.parse(urlString).path;
            const token = await getCSPToken(api, path);
            if (token.length > 0) {
              urlString += `&CSPCHD=${token}`;
            }
          }
          vscode.env.openExternal(vscode.Uri.parse(urlString));
        }
      }
    });
}
