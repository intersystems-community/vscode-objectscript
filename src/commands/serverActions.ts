import * as vscode from "vscode";
import { config, workspaceState, checkConnection } from "../extension";
import { currentWorkspaceFolder, terminalWithDocker } from "../utils";

export async function serverActions(): Promise<void> {
  const { active, host, ns, https, port: defaultPort, username, password: defaultPassword, links } = config("conn");
  const workspaceFolder = currentWorkspaceFolder();
  const port = workspaceState.get(workspaceFolder + ":port", defaultPort);
  const password = workspaceState.get(workspaceFolder + ":password", defaultPassword);
  const nsEncoded = encodeURIComponent(ns);
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
  for (const title in links) {
    const link = String(links[title])
      .replace("${host}", host)
      .replace("${port}", port);
    extraLinks.push({
      id: "extraLink" + extraLinks.length,
      label: title,
      detail: link,
    });
  }
  const terminal = [];
  if (workspaceState.get(workspaceFolder + ":docker", true)) {
    terminal.push({
      id: "openDockerTerminal",
      label: "Open terminal in docker",
      detail: "Use docker-compose to start session inside configured service",
    });
  }
  return vscode.window
    .showQuickPick(
      [
        ...extraLinks,
        {
          id: "refreshConnection",
          label: "Refresh connection",
          detail: "Force attempt to connect to the server",
        },
        ...terminal,
        {
          detail: "Enable/Disable current connection",
          id: "toggleConnection",
          label: "Toggle connection",
        },
        {
          detail: portalUrl,
          id: "openPortal",
          label: "Open Management Portal",
        },
        {
          detail: classRef,
          id: "openClassReference",
          label: "Open class reference",
        },
      ],
      {
        placeHolder: `Select action for server: ${connInfo}`,
      }
    )
    .then(action => {
      if (!action) {
        return;
      }
      switch (action.id) {
        case "toggleConnection": {
          return vscode.workspace.getConfiguration().update("objectscript.conn.active", !active);
        }
        case "openPortal": {
          vscode.env.openExternal(vscode.Uri.parse(portalUrl + auth));
          break;
        }
        case "openClassReference": {
          vscode.env.openExternal(vscode.Uri.parse(classRef + auth));
          break;
        }
        case "refreshConnection": {
          checkConnection(true);
          break;
        }
        case "openDockerTerminal": {
          terminalWithDocker();
          break;
        }
        default: {
          vscode.env.openExternal(vscode.Uri.parse(action.detail));
        }
      }
    });
}
