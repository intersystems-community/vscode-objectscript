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
import { cspAppsForUri, outputChannel } from "../utils";
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
    .serverInfo(false)
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
    { placeHolder: "Choose the type of access", ignoreFocusOut: true }
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
  const params = new URLSearchParams(uri.query);
  const api = new AtelierAPI(uri);

  // Prompt the user for the files to show
  const filterType = await new Promise<string | undefined>((resolve) => {
    let result: string;
    const quickPick = vscode.window.createQuickPick();
    quickPick.placeholder = "Choose what to show in the workspace folder";
    quickPick.ignoreFocusOut = true;
    quickPick.items = [
      {
        label: `$(list-tree) Code Files in ${api.ns}`,
        detail: "Filters can be applied in the next step.",
      },
      {
        label: "$(file-code) Web Application Files",
        detail: "Choose a specific web application, or show all.",
      },
      {
        label: "$(files) Contents of a Server-side Project",
        detail: "Choose an existing project, or create a new one.",
      },
    ];
    quickPick.activeItems = [
      params.has("project") ? quickPick.items[2] : params.has("csp") ? quickPick.items[1] : quickPick.items[0],
    ];

    quickPick.onDidChangeSelection((items) => {
      switch (items[0].label) {
        case quickPick.items[0].label:
          result = "other";
          break;
        case quickPick.items[1].label:
          result = "csp";
          break;
        default:
          result = "project";
      }
    });
    quickPick.onDidAccept(() => {
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve(result);
      quickPick.dispose();
    });
    quickPick.show();
  });
  if (!filterType) {
    return;
  }

  let newParams = "";
  let newPath = "/";
  if (filterType == "csp") {
    // Prompt for a specific web app
    let cspApps = cspAppsForUri(uri);
    if (cspApps.length == 0) {
      // Attempt to fetch from the server
      cspApps = await api
        .getCSPApps()
        .then((data) => data.result.content ?? [])
        .catch((error) => {
          if (error && error.errorText && error.errorText !== "") {
            outputChannel.appendLine(error.errorText);
          } else {
            outputChannel.appendLine(
              typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
            );
          }
          vscode.window.showErrorMessage(
            "Failed to fetch web application list. Check 'ObjectScript' output channel for details.",
            "Dismiss"
          );
          return;
        });
      if (cspApps == undefined) {
        // Catch handler reported the error already
        return;
      } else if (cspApps.length == 0) {
        vscode.window.showWarningMessage(`No web applications are configured to use namespace ${api.ns}.`, "Dismiss");
        return;
      }
    }
    newPath =
      (await vscode.window.showQuickPick(cspApps, {
        placeHolder: "Pick a specific web application to show, or press 'Escape' to show all",
        ignoreFocusOut: true,
      })) ?? "/";
    newParams = "csp";
  } else if (filterType == "project") {
    // Prompt for project
    const project = await pickProject(new AtelierAPI(uri));
    if (!project) {
      return;
    }
    newParams = `project=${project}`;
  } else {
    // Prompt the user for other query parameters
    const items = [
      {
        label: "$(filter) Filter",
        detail: "Comma-delimited list of search options, e.g. '*.cls,*.inc,*.mac,*.int'",
        picked: params.has("filter"),
        value: "filter",
      },
      {
        label: "$(list-flat) Flat Files",
        detail: "Show a flat list of files. Do not treat packages as folders.",
        picked: params.has("flat"),
        value: "flat",
      },
      {
        label: "$(server-process) Show Generated",
        detail: "Also show files tagged as generated, e.g. by compilation.",
        picked: params.has("generated"),
        value: "generated",
      },
      {
        label: "$(references) Hide Mapped",
        detail: `Hide files that are mapped into ${api.ns} from another code database.`,
        picked: params.has("mapped"),
        value: "mapped",
      },
    ];
    if (api.ns != "%SYS") {
      // Only show system item for non-%SYS namespaces
      items.push({
        label: "$(library) Show System",
        detail: "Also show '%' items and INFORMATION.SCHEMA items.",
        picked: params.has("system"),
        value: "system",
      });
    }
    const otherParams = await vscode.window.showQuickPick(items, {
      ignoreFocusOut: true,
      canPickMany: true,
      placeHolder: "Add optional filters",
    });
    if (!otherParams) {
      return;
    }
    // Build the new query parameter string
    params.delete("csp");
    params.delete("project");
    params.delete("filter");
    params.delete("flat");
    params.delete("generated");
    params.delete("mapped");
    params.delete("system");
    for (const otherParam of otherParams) {
      switch (otherParam.value) {
        case "filter": {
          // Prompt for filter
          const filter = await vscode.window.showInputBox({
            title: "Enter a filter string.",
            ignoreFocusOut: true,
            value: params.get("filter"),
            placeHolder: "*.cls,*.inc,*.mac,*.int",
            prompt:
              "Patterns are comma-delimited and may contain both * (zero or more characters) and ? (a single character) as wildcards. To exclude items, prefix the pattern with a single quote.",
          });
          if (filter && filter.length) {
            params.set(otherParam.value, filter);
          }
          break;
        }
        case "flat":
        case "generated":
        case "system":
          params.set(otherParam.value, "1");
          break;
        case "mapped":
          params.set(otherParam.value, "0");
      }
    }
    newParams = params.toString();
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
        placeHolder: "Pick the workspace folder to modify",
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
    title: "Enter a name for the workspace folder",
    ignoreFocusOut: true,
    value: wsFolder.name,
  });
  if (!newName) {
    return;
  }
  if (newName == wsFolder.name && newUri.toString() == wsFolder.uri.toString()) {
    // Nothing changed
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
