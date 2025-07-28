import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import {
  panel,
  resolveConnectionSpec,
  getResolvedConnectionSpec,
  serverManagerApi,
  resolveUsernameAndPassword,
} from "../extension";
import { handleError, isUnauthenticated, notIsfs } from "../utils";

interface ConnSettings {
  server: string;
  ns: string;
  active: boolean;
}

export async function connectFolderToServerNamespace(): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    vscode.window.showErrorMessage("No folders in the workspace.", "Dismiss");
    return;
  }
  if (!serverManagerApi) {
    vscode.window.showErrorMessage(
      "Connecting a folder to a server namespace requires the [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) to be installed and enabled.",
      "Dismiss"
    );
    return;
  }
  // Which folder?
  const items: vscode.QuickPickItem[] = vscode.workspace.workspaceFolders
    .filter((folder) => notIsfs(folder.uri))
    .map((folder) => {
      const config = vscode.workspace.getConfiguration("objectscript", folder);
      const conn: ConnSettings = config.get("conn");
      return {
        label: folder.name,
        description: folder.uri.fsPath,
        detail:
          !conn.server || !conn.active
            ? "No active server connection"
            : `Currently connected to ${conn.ns} on ${conn.server}`,
      };
    });
  if (!items.length) {
    vscode.window.showErrorMessage("No local folders in the workspace.", "Dismiss");
    return;
  }
  const pick =
    items.length == 1 && !items[0].detail.startsWith("Currently")
      ? items[0]
      : await vscode.window.showQuickPick(items, { title: "Pick a folder" });
  const folder = vscode.workspace.workspaceFolders.find((el) => el.name === pick.label);
  // Get user's choice of server
  const options: vscode.QuickPickOptions = {};
  const serverName: string = await serverManagerApi.pickServer(folder, options);
  if (!serverName) {
    return;
  }
  await resolveConnectionSpec(serverName, undefined, folder);
  // Prepare a displayable form of its connection spec as a hint to the user
  // This will never return the default value (second parameter) because we only just resolved the connection spec.
  const connSpec = getResolvedConnectionSpec(serverName, undefined);
  const connDisplayString = `${connSpec.webServer.scheme}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix}`;
  // Connect and fetch namespaces
  const api = new AtelierAPI(vscode.Uri.parse(`isfs://${serverName}/?ns=%SYS`));
  const serverConf = vscode.workspace
    .getConfiguration("intersystems", folder)
    .inspect<{ [key: string]: any }>("servers");
  if (
    serverConf.workspaceFolderValue &&
    typeof serverConf.workspaceFolderValue[serverName] == "object" &&
    !(serverConf.workspaceValue && typeof serverConf.workspaceValue[serverName] == "object")
  ) {
    // Need to manually set connection info if the server is defined at the workspace folder level
    api.setConnSpec(serverName, connSpec);
  }
  const allNamespaces: string[] = await api
    .serverInfo(false)
    .then((data) => data.result.content.namespaces)
    .catch(async (error) => {
      if (error?.statusCode == 401 && isUnauthenticated(api.config.username)) {
        // Attempt to resolve username and password and try again
        const newSpec = await resolveUsernameAndPassword(api.config.serverName, connSpec);
        if (newSpec) {
          // We were able to resolve credentials, so try again
          api.setConnSpec(api.config.serverName, newSpec);
          return api
            .serverInfo(false)
            .then((data) => data.result.content.namespaces)
            .catch(async (err) => {
              handleError(err, `Failed to fetch namespace list from server at ${connDisplayString}.`);
              return undefined;
            });
        } else {
          handleError(
            `Unauthenticated access rejected by '${api.serverId}'.`,
            `Failed to fetch namespace list from server at ${connDisplayString}.`
          );
          return undefined;
        }
      }
      handleError(error, `Failed to fetch namespace list from server at ${connDisplayString}.`);
      return undefined;
    });
  // Clear the panel entry created by the connection
  panel.text = "";
  panel.tooltip = "";
  // Handle serverInfo failure
  if (!allNamespaces) {
    return;
  }
  // Handle serverInfo having returned no namespaces
  if (!allNamespaces.length) {
    vscode.window.showErrorMessage(`No namespace list returned by server at ${connDisplayString}`, "Dismiss");
    return;
  }
  // Get user's choice of namespace
  const namespace = await vscode.window.showQuickPick(allNamespaces, {
    title: `Pick a namespace on server '${serverName}' (${connDisplayString})`,
  });
  if (!namespace) {
    return;
  }
  // Update folder's config object
  const config = vscode.workspace.getConfiguration("objectscript", folder);
  if (vscode.workspace.workspaceFile && items.length == 1) {
    // Ask the user if they want to enable the connection at the workspace or folder level.
    // Only allow this when there is a single client-side folder in the workspace because
    // the server may be configured at the workspace folder level.
    const answer = await vscode.window.showQuickPick(
      [
        { label: `Workspace Folder ${folder.name}`, detail: folder.uri.toString(true) },
        { label: "Workspace File", detail: vscode.workspace.workspaceFile.toString(true) },
      ],
      { title: "Store the server connection at the workspace or folder level?" }
    );
    if (!answer) return;
    if (answer.label == "Workspace File") {
      // Enable the connection at the workspace level
      const conn: any = config.inspect("conn").workspaceValue;
      await config.update(
        "conn",
        { ...conn, server: serverName, ns: namespace, active: true },
        vscode.ConfigurationTarget.Workspace
      );
      return;
    }
  }
  // Enable the connection at the workspace folder level
  const conn: any = config.inspect("conn").workspaceFolderValue;
  await config.update(
    "conn",
    { ...conn, server: serverName, ns: namespace, active: true },
    vscode.ConfigurationTarget.WorkspaceFolder
  );
}
