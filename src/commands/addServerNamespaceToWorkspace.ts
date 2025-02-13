import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import {
  panel,
  resolveConnectionSpec,
  getResolvedConnectionSpec,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
  filesystemSchemas,
  smExtensionId,
} from "../extension";
import { cspAppsForUri, handleError, notIsfs } from "../utils";
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
  const namespace = await pickNamespaceOnServer(serverName);
  if (!namespace) {
    return;
  }
  return { serverName, namespace };
}

async function pickNamespaceOnServer(serverName: string): Promise<string> {
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
    .catch((error) => {
      // Notify user about serverInfo failure
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
    placeHolder: `Namespace on server '${serverName}' (${connDisplayString})`,
    ignoreFocusOut: true,
  });
  return namespace;
}

export async function addServerNamespaceToWorkspace(resource?: vscode.Uri): Promise<void> {
  const TITLE = "Add server namespace to workspace";
  let serverName = "";
  let namespace = "";
  if (filesystemSchemas.includes(resource?.scheme)) {
    serverName = resource.authority.split(":")[0];
    if (serverName) {
      const ANOTHER = "Choose another server";
      const choice = await vscode.window.showQuickPick([`Add a '${serverName}' namespace`, ANOTHER], {
        title: TITLE,
      });
      if (!choice) {
        return;
      }
      if (choice === ANOTHER) {
        serverName = "";
      }
    }
  }
  if (serverName === "") {
    const picks = await pickServerAndNamespace(TITLE);
    if (picks == undefined) {
      return;
    }
    serverName = picks.serverName;
    namespace = picks.namespace;
  } else {
    namespace = await pickNamespaceOnServer(serverName);
    if (!namespace) {
      return;
    }
  }
  const wsFolders = vscode.workspace.workspaceFolders ?? [];
  let scheme: string;
  if (wsFolders.length && wsFolders.some((wf) => notIsfs(wf.uri))) {
    // Don't allow the creation of an editable ISFS folder
    // if the workspace contains non-ISFS folders already
    scheme = FILESYSTEM_READONLY_SCHEMA;
  } else {
    // Prompt the user for edit or read-only
    scheme = await vscode.window
      .showQuickPick(
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
      )
      .then((mode) => mode?.value);
  }
  if (!scheme) return;
  // Prompt the user to fill in the uri
  const uri = await modifyWsFolderUri(vscode.Uri.parse(`${scheme}://${serverName}:${namespace}/`));
  if (!uri) {
    return;
  }
  // Generate the name
  const params = new URLSearchParams(uri.query);
  const project = params.get("project");
  const csp = params.has("csp");
  const name = `${project ? `${project} - ` : ""}${serverName}:${namespace}${!csp ? "" : ["", "/"].includes(uri.path) ? " web files" : ` web files (${uri.path})`}${
    scheme == FILESYSTEM_READONLY_SCHEMA && !project ? " (read-only)" : ""
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
      .showErrorMessage("Folder not added. Maybe it already exists in the workspace.", "Retry", "Dismiss")
      .then((value) => {
        if (value === "Retry") {
          vscode.commands.executeCommand("vscode-objectscript.addServerNamespaceToWorkspace");
        }
      });
  }
}

export async function getServerManagerApi(): Promise<any> {
  const targetExtension = vscode.extensions.getExtension(smExtensionId);
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
  if (notIsfs(uri)) return;
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
  let newPath = uri.path;
  if (filterType == "csp") {
    // Prompt for a specific web app
    let cspApps = cspAppsForUri(uri);
    if (cspApps.length == 0) {
      // Attempt to fetch from the server
      cspApps = await api
        .getCSPApps()
        .then((data) => data.result.content ?? [])
        .catch((error) => {
          handleError(error, "Failed to fetch web application list.");
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
    newPath = await new Promise<string | undefined>((resolve) => {
      let result: string;
      const allItem: vscode.QuickPickItem = { label: "All" };
      const quickPick = vscode.window.createQuickPick();
      quickPick.placeholder = "Pick a specific web application to show, or show all";
      quickPick.ignoreFocusOut = true;
      quickPick.items = [
        allItem,
        ...cspApps.map((label) => {
          return { label };
        }),
      ];
      const activeIdx = quickPick.items.findIndex((i) => i.label == uri.path);
      quickPick.activeItems = [quickPick.items[activeIdx == -1 ? 0 : activeIdx]];

      quickPick.onDidChangeSelection((items) => {
        result = items[0].label == allItem.label ? "/" : items[0].label;
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
    if (!newPath) {
      return;
    }
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
    params.delete("type");
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
  } else {
    // Find the workspace folder for this uri
    wsFolder = vscode.workspace.getWorkspaceFolder(wsFolderUri);
    if (!wsFolder) {
      return;
    }
  }
  if (notIsfs(wsFolder.uri)) {
    vscode.window.showErrorMessage(
      `Workspace folder '${wsFolder.name}' does not have scheme 'isfs' or 'isfs-readonly'.`,
      "Dismiss"
    );
    return;
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
