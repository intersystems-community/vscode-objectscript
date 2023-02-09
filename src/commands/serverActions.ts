import * as vscode from "vscode";
import {
  config,
  workspaceState,
  checkConnection,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
  explorerProvider,
} from "../extension";
import {
  connectionTarget,
  terminalWithDocker,
  shellWithDocker,
  currentFile,
  uriOfWorkspaceFolder,
  outputChannel,
} from "../utils";
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

    // Switching namespace makes only sense if the user has a local folder open and not a server-side folder!
    if (uriOfWorkspaceFolder()?.scheme === "file") {
      actions.push({
        id: "switchNamespace",
        label: "Switch Namespace",
        detail: "Switch to a different namespace in the current server",
      });
    }
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
      case "switchNamespace": {
        // NOTE: List of all namespaces except the current one as it doesn't make sense to allow switching to the current one
        const allNamespaces: string[] | undefined = await api
          .serverInfo()
          .then((data) =>
            data.result.content.namespaces.filter((ns) => ns.toLowerCase() !== api.config.ns.toLowerCase())
          )
          .catch((error) => {
            let message = `Failed to fetch a list of namespaces.`;
            if (error && error.errorText && error.errorText !== "") {
              outputChannel.appendLine("\n" + error.errorText);
              outputChannel.show(true);
              message += " Check 'ObjectScript' output channel for details.";
            }
            vscode.window.showErrorMessage(message, "Dismiss");
            return undefined;
          });

        if (!allNamespaces) {
          return;
        }

        if (!allNamespaces.length) {
          vscode.window.showErrorMessage(`Server returned an empty namespace list.`, "Dismiss");
          return;
        }

        const namespace = await vscode.window.showQuickPick(allNamespaces, {
          placeHolder: `Choose the namespace to switch to`,
          ignoreFocusOut: true,
        });

        if (namespace) {
          const connConfig = config("", workspaceFolder);
          const target = connConfig.inspect("conn").workspaceFolderValue
            ? vscode.ConfigurationTarget.WorkspaceFolder
            : vscode.ConfigurationTarget.Workspace;
          const targetConfig =
            connConfig.inspect("conn").workspaceFolderValue || connConfig.inspect("conn").workspaceValue;
          return connConfig.update("conn", { ...targetConfig, ns: namespace }, target);
        }
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
  if (workspaceState.get(workspaceFolder.toLowerCase() + ":docker", false)) {
    actions.push({
      id: "openDockerTerminal",
      label: "Open Terminal in Docker",
      detail: "Use Docker Compose to start session inside configured service",
    });
  }
  if (workspaceState.get(workspaceFolder.toLowerCase() + ":docker", false)) {
    actions.push({
      id: "openDockerShell",
      label: "Open Shell in Docker",
      detail: "Use Docker Compose to start shell inside configured service",
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
          let url = vscode.Uri.parse(action.detail);
          if (action.rawLink?.startsWith("${serverUrl}")) {
            const token = await getCSPToken(api, url.path);
            if (token.length > 0) {
              url = url.with({
                query: url.query.length ? `${url.query}&CSPCHD=${token}` : `CSPCHD=${token}`,
              });
            }
          }
          vscode.env.openExternal(url);
        }
      }
    });
}
