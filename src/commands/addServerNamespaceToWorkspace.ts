import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import {
  panel,
  resolveConnectionSpec,
  getResolvedConnectionSpec,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
  filesystemSchemas,
} from "../extension";
import { cspAppsForUri } from "../utils";
import { pickProject } from "./project";

/**
 * @param message The prefix of the message to show when the server manager API can't be found.
 * @returns An object containing `serverName` and `namespace`, or `undefined`.
 */
export async function pickServerAndNamespace(message?: string): Promise<{ serverName: string; namespace: string }> {
  const serverManagerApi = await getServerManagerApi();
  if (!serverManagerApi) {
    vscode.window.showErrorMessage(
      `${
        message ? message : "Picking a server and namespace"
      } requires the [InterSystems Server Manager extension](https://marketplace.visualstudio.com/items?itemName=intersystems-community.servermanager) to be installed and enabled.`,
      "Dismiss"
    );
    return;
  }
  // Get user's choice of server
  const options: vscode.QuickPickOptions = { ignoreFocusOut: true };
  const serverName: string = await serverManagerApi.pickServer(undefined, options);
  if (!serverName) {
    return;
  }
  // Get its namespace list
  const uri = vscode.Uri.parse(`isfs://${serverName}:%sys/`);
  await resolveConnectionSpec(serverName);
  // Prepare a displayable form of its connection spec as a hint to the user.
  // This will never return the default value (second parameter) because we only just resolved the connection spec.
  const connSpec = getResolvedConnectionSpec(serverName, undefined);
  const connDisplayString = `${connSpec.webServer.scheme}://${connSpec.webServer.host}:${connSpec.webServer.port}/${connSpec.webServer.pathPrefix}`;
  // Connect and fetch namespaces
  const api = new AtelierAPI(uri);
  const allNamespaces: string[] | undefined = await api
    .serverInfo()
    .then((data) => data.result.content.namespaces)
    .catch((reason) => {
      // Notify user about serverInfo failure
      vscode.window.showErrorMessage(
        reason.errorText || `Failed to fetch namespace list from server at ${connDisplayString}`,
        "Dismiss"
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
    vscode.window.showErrorMessage(`No namespace list returned by server at ${connDisplayString}`, "Dismiss");
    return;
  }
  // Get user's choice of namespace
  const namespace = await vscode.window.showQuickPick(allNamespaces, {
    placeHolder: `Namespace on server '${serverName}' (${connDisplayString})`,
    ignoreFocusOut: true,
  });
  if (!namespace) {
    return;
  }
  return { serverName, namespace };
}

export async function addServerNamespaceToWorkspace(): Promise<void> {
  const picks = await pickServerAndNamespace("Adding a server namespace to a workspace");
  if (picks == undefined) {
    return;
  }
  const { serverName, namespace } = picks;
  // Prompt the user for edit or read-only
  const mode = await vscode.window.showQuickPick(
    [
      {
        value: FILESYSTEM_SCHEMA,
        label: `$(pencil) Edit Code in ${namespace}`,
        detail: "Documents opened in this folder will be editable.",
      },
      {
        value: FILESYSTEM_READONLY_SCHEMA,
        label: `$(lock) View Code in ${namespace}`,
        detail: "Documents opened in this folder will be read-only.",
      },
    ],
    { title: "Choose the type of access", ignoreFocusOut: true }
  );
  if (!mode) {
    return;
  }
  // Prompt the user to fill in the uri
  const uri = await modifyWsFolderUri(vscode.Uri.parse(`${mode.value}://${serverName}:${namespace}/`));
  if (!uri) {
    return;
  }
  // Generate the name
  const params = new URLSearchParams(uri.query);
  const project = params.get("project");
  const csp = params.has("csp");
  const name = `${project ? `${project} - ` : ""}${serverName}:${namespace}${csp ? " web files" : ""}${
    mode.value == FILESYSTEM_READONLY_SCHEMA && !project ? " (read-only)" : ""
  }`;
  // Append it to the workspace
  const added = vscode.workspace.updateWorkspaceFolders(
    vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
    0,
    { uri, name }
  );
  // Switch to Explorer view so user sees the outcome
  vscode.commands.executeCommand("workbench.view.explorer");
  // Handle failure
  if (!added) {
    vscode.window
      .showErrorMessage("Folder not added. Maybe it already exists in the workspace.", "Retry", "Close")
      .then((value) => {
        if (value === "Retry") {
          vscode.commands.executeCommand("vscode-objectscript.addServerNamespaceToWorkspace");
        }
      });
  }
}

export async function getServerManagerApi(): Promise<any> {
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

/** Prompt the user to fill in the `path` and `query` of `uri`. */
async function modifyWsFolderUri(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (!filesystemSchemas.includes(uri.scheme)) {
    return;
  }
  const oldParams = new URLSearchParams(uri.query);

  // Prompt the user for the files to show
  const filterType = await vscode.window.showQuickPick(
    [
      {
        label: "$(file-code) Show web application files.",
        detail: "Choose a specific web application, or show all.",
        value: "csp",
      },
      {
        label: "$(files) Show the contents of a server-side project.",
        detail: "Choose an existing project or create a new one.",
        value: "project",
      },
      {
        label: "$(list-tree) Show files that pass through custom filters.",
        detail: "Choose the filters to apply.",
        value: "other",
      },
    ],
    {
      ignoreFocusOut: true,
      title: "Pick the files to be shown in this workspace folder.",
    }
  );
  if (!filterType) {
    return;
  }

  let newParams = "";
  let newPath = "/";
  if (filterType.value == "csp") {
    // Prompt for a specific web app
    const cspApps = cspAppsForUri(uri);
    if (cspApps.length == 0) {
      vscode.window.showInformationMessage("No web applications are configured in this namespace.", "Dismiss");
      return;
    }
    newPath =
      (await vscode.window.showQuickPick(cspApps, {
        title: "Pick a specific web application to show, or press 'Escape' to show all.",
        ignoreFocusOut: true,
      })) ?? "/";
    newParams = "csp";
  } else if (filterType.value == "project") {
    // Prompt for project
    const project = await pickProject(new AtelierAPI(uri));
    if (!project) {
      return;
    }
    newParams = `project=${project}`;
  } else {
    // Prompt the user for other query parameters
    const otherParams = await vscode.window.showQuickPick(
      [
        {
          label: "$(filter) filter",
          detail: "Comma-delimited list of search options. (i.e. '*.cls,*.inc,*.mac,*.int')",
          picked: oldParams.has("filter"),
        },
        {
          label: "$(list-flat) flat",
          detail: "Show a flat list of files. Does not split packages as folders.",
          picked: oldParams.has("flat"),
        },
        {
          label: "$(server-process) generated",
          detail: "Show generated files as well as non-generated.",
          picked: oldParams.has("generated"),
        },
        {
          label: "$(references) mapped",
          detail: "Hide files that are mapped from a non-default database.",
          picked: oldParams.has("mapped"),
        },
      ],
      {
        ignoreFocusOut: true,
        canPickMany: true,
        title: "",
      }
    );
    if (!otherParams) {
      return;
    }
    // Build the new query parameter string
    const newParamsObj = new URLSearchParams();
    for (const otherParam of otherParams) {
      const otherParamName = otherParam.label.split(" ")[1];
      switch (otherParamName) {
        case "filter": {
          // Prompt for filter
          const filter = await vscode.window.showInputBox({
            title: "Enter a filter string.",
            ignoreFocusOut: true,
            value: oldParams.get("filter"),
            placeHolder: "*.cls,*.inc,*.mac,*.int",
            prompt:
              "Patterns are comma-delimited and may contain both * (any number of characters) and ? (a single character) as wildcards. To exclude items, prefix the pattern with a single quote.",
          });
          if (filter && filter.length) {
            newParamsObj.set(otherParamName, filter);
          }
          break;
        }
        case "flat":
        case "generated":
          newParamsObj.set(otherParamName, "1");
          break;
        case "mapped":
          newParamsObj.set(otherParamName, "0");
      }
    }
    newParams = newParamsObj.toString();
  }

  return uri.with({ query: newParams, path: newPath });
}

export async function modifyWsFolder(wsFolderUri?: vscode.Uri): Promise<void> {
  let wsFolder: vscode.WorkspaceFolder;
  if (!wsFolderUri) {
    // Select a workspace folder to modify
    if (vscode.workspace.workspaceFolders == undefined || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage("No workspace folders are open.", "Dismiss");
      return;
    } else if (vscode.workspace.workspaceFolders.length == 1) {
      wsFolder = vscode.workspace.workspaceFolders[0];
    } else {
      wsFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Pick the workspace folder modify.",
        ignoreFocusOut: true,
      });
    }
    if (!wsFolder) {
      return;
    }
    if (!filesystemSchemas.includes(wsFolder.uri.scheme)) {
      vscode.window.showErrorMessage(
        `Workspace folder '${wsFolder.name}' does not have scheme 'isfs' or 'isfs-readonly'.`,
        "Dismiss"
      );
      return;
    }
  } else {
    // Find the workspace folder for this uri
    wsFolder = vscode.workspace.getWorkspaceFolder(wsFolderUri);
    if (!wsFolder) {
      return;
    }
  }

  // Prompt the user to modify the uri
  const newUri = await modifyWsFolderUri(wsFolder.uri);
  if (!newUri) {
    return;
  }
  // Prompt for name change
  const newName = await vscode.window.showInputBox({
    title: "Enter a name for the workspace folder.",
    ignoreFocusOut: true,
    value: wsFolder.name,
  });
  if (!newName) {
    return;
  }
  // Make the edit
  const modified = vscode.workspace.updateWorkspaceFolders(wsFolder.index, 1, {
    uri: newUri,
    name: newName,
  });
  if (!modified) {
    vscode.window.showErrorMessage(
      "Failed to modify workspace folder. Most likely a folder with the same URI already exists.",
      "Dismiss"
    );
  } else {
    // Switch to Explorer view so user sees the outcome
    vscode.commands.executeCommand("workbench.view.explorer");
  }
}
