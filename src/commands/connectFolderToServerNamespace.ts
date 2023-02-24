import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { panel, resolveConnectionSpec, getResolvedConnectionSpec } from "../extension";

interface ConnSettings {
  server: string;
  ns: string;
  active: boolean;
}

export async function connectFolderToServerNamespace(): Promise<void> {
  const serverManagerApi = await getServerManagerApi();
  if (!serverManagerApi) {
    vscode.window.showErrorMessage(
      "Connecting a folder to a server namespace requires the [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) to be installed and enabled."
    );
    return;
  }
  // Which folder?
  const allFolders = vscode.workspace.workspaceFolders;
  const items: vscode.QuickPickItem[] = allFolders
    .filter((folder) => folder.uri.scheme === "file")
    .map((folder) => {
      const config = vscode.workspace.getConfiguration("objectscript", folder);
      const conn: ConnSettings = config.get("conn");
      return {
        label: folder.name,
        description: folder.uri.fsPath,
        detail: !conn.server ? undefined : `Currently connected to ${conn.ns} on ${conn.server}`,
      };
    });
  if (!items.length) {
    vscode.window.showErrorMessage("No local folders in the workspace.");
    return;
  }
  const pick =
    items.length === 1 && !items[0].detail
      ? items[0]
      : await vscode.window.showQuickPick(items, { placeHolder: "Choose folder" });
  const folder = allFolders.find((el) => el.name === pick.label);
  // Get user's choice of server
  const options: vscode.QuickPickOptions = {};
  const serverName: string = await serverManagerApi.pickServer(undefined, options);
  if (!serverName) {
    return;
  }
  // Get its namespace list
  const uri = vscode.Uri.parse(`isfs://${serverName}/?ns=%SYS`);
  await resolveConnectionSpec(serverName);
  // Prepare a displayable form of its connection spec as a hint to the user
  // This will never return the default value (second parameter) because we only just resolved the connection spec.
  const connSpec = getResolvedConnectionSpec(serverName, undefined);
  const connDisplayString = `${connSpec.webServer.scheme}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix}`;
  // Connect and fetch namespaces
  const api = new AtelierAPI(uri);
  const allNamespaces: string[] | undefined = await api
    .serverInfo(false)
    .then((data) => data.result.content.namespaces)
    .catch((reason) => {
      // Notify user about serverInfo failure
      vscode.window.showErrorMessage(
        reason.message || `Failed to fetch namespace list from server at ${connDisplayString}`
      );
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
    vscode.window.showErrorMessage(`No namespace list returned by server at ${connDisplayString}`);
    return;
  }
  // Get user's choice of namespace
  const namespace = await vscode.window.showQuickPick(allNamespaces, {
    placeHolder: `Namespace on server '${serverName}' (${connDisplayString})`,
  });
  if (!namespace) {
    return;
  }
  // Update folder's config object
  const config = vscode.workspace.getConfiguration("objectscript", folder);
  const conn: any = config.inspect("conn").workspaceFolderValue;
  await config.update("conn", { ...conn, server: serverName, ns: namespace, active: true });
}

async function getServerManagerApi(): Promise<any> {
  const targetExtension = vscode.extensions.getExtension("intersystems-community.servermanager");
  if (!targetExtension) {
    return undefined;
  }
  if (!targetExtension.isActive) {
    await targetExtension.activate();
  }
  const api = targetExtension.exports;

  if (!api) {
    return undefined;
  }
  return api;
}
