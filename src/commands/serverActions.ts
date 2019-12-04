import * as vscode from "vscode";
import { config, workspaceState, checkConnection } from "../extension";
import { currentWorkspaceFolder, terminalWithDocker } from "../utils";

export async function serverActions(): Promise<void> {
  const { active, host, ns, https, port: defaultPort, username, password } = config("conn");
  const workspaceFolder = currentWorkspaceFolder();
  const port = workspaceState.get(workspaceFolder + ":port", defaultPort);
  const connInfo = `${host}:${port}[${ns}]`;
  const serverUrl = `${https ? "https" : "http"}://${host}:${port}`;
  const portalUrl = `${serverUrl}/csp/sys/UtilHome.csp?$NAMESPACE=${ns}`;
  const classRef = `${serverUrl}/csp/documatic/%25CSP.Documatic.cls?LIBRARY=${ns}`;
  const iris = workspaceState.get(workspaceFolder + ":iris", false);
  const auth = iris
    ? `&IRISUsername=${username}&IRISPassword=${password}`
    : `&CacheUserName=${username}&CachePassword=${password}`;

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
          checkConnection();
          break;
        }
        case "openDockerTerminal": {
          terminalWithDocker();
        }
      }
    });
}
