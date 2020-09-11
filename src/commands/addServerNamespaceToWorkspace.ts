import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { panel, resolveConnectionSpec } from "../extension";

export async function addServerNamespaceToWorkspace(): Promise<void> {
  const serverManagerApi = await getServerManagerApi();
  if (!serverManagerApi) {
    vscode.window.showErrorMessage(
      "Adding a server namespace to a workspace requires the [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) to be installed and enabled."
    );
    return;
  }
  // Get user's choice of server
  const options: vscode.QuickPickOptions = {};
  const serverName: string = await serverManagerApi.pickServer(undefined, options);
  if (!serverName) {
    return;
  }
  // Get its namespace list
  let uri = vscode.Uri.parse(`isfs://${serverName}/?ns=%SYS`);
  await resolveConnectionSpec(serverName);
  // Prepare a displayable form of its connection spec as a hint to the user
  const connSpec = await serverManagerApi.getServerSpec(serverName);
  const connDisplayString = `${connSpec.webServer.scheme}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix}`;
  // Connect and fetch namespaces
  const api = new AtelierAPI(uri);
  const allNamespaces: string[] | undefined = await api
    .serverInfo()
    .then((data) => data.result.content.namespaces)
    .catch((reason) => {
      // Notify user about serverInfo failure
      vscode.window.showErrorMessage(
        reason.message || `Failed to fetch namespace list from  server at ${connDisplayString}`
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
  // Pick between isfs and isfs-readonly
  const editable = await vscode.window.showQuickPick(
    [
      {
        value: true,
        label: "Editable",
        detail: "Documents opened from this folder will be editable directly on the server.",
      },
      { value: false, label: "Read-only", detail: "Documents opened from this folder will be read-only." },
    ],
    { placeHolder: "Choose the mode of access" }
  );
  // Prepare the folder parameters
  const label = editable.value ? `${serverName}:${namespace}` : `${serverName}:${namespace} (read-only)`;
  uri = uri.with({ scheme: editable.value ? "isfs" : "isfs-readonly", query: `ns=${namespace}` });
  // Append it to the workspace
  const added = vscode.workspace.updateWorkspaceFolders(
    vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
    0,
    { uri, name: label }
  );
  // Switch to Explorer view so user sees the outcome
  vscode.commands.executeCommand("workbench.view.explorer");
  // Handle failure
  if (!added) {
    vscode.window
      .showErrorMessage("Folder not added. Maybe it already exists on the workspace.", "Retry", "Close")
      .then((value) => {
        if (value === "Retry") {
          vscode.commands.executeCommand("vscode-objectscript.addServerNamespaceToWorkspace");
        }
      });
  }
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
