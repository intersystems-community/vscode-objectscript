import * as vscode from "vscode";
import { config } from "../extension";

export async function serverActions(): Promise<void> {
  const conn = config("conn");
  const connInfo = `${conn.host}:${conn.port}[${conn.ns}]`;
  const serverUrl = `${conn.https ? "https" : "http"}://${conn.host}:${conn.port}`;
  const portalUrl = `${serverUrl}/csp/sys/UtilHome.csp?$NAMESPACE=${conn.ns}`;
  const classRef = `${serverUrl}/csp/documatic/%25CSP.Documatic.cls?LIBRARY=${conn.ns}`;
  return vscode.window
    .showQuickPick(
      [
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
      switch (action.id) {
        case "toggleConnection": {
          return vscode.workspace.getConfiguration().update("objectscript.conn.active", !conn.active);
        }
        case "openPortal": {
          vscode.env.openExternal(vscode.Uri.parse(portalUrl));
          break;
        }
        case "openClassReference": {
          vscode.env.openExternal(vscode.Uri.parse(classRef));
          break;
        }
      }
    });
}
