import path = require("path");
import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, explorerProvider, OBJECTSCRIPT_FILE_SCHEMA, schemas, workspaceState } from "../extension";
import {
  currentFile,
  currentFileFromContent,
  exportedUris,
  handleError,
  notNull,
  outputChannel,
  stringifyError,
  throttleRequests,
  uriOfWorkspaceFolder,
} from "../utils";
import { pickDocuments } from "../utils/documentPicker";
import { NodeBase } from "../explorer/nodes";

export function getCategory(fileName: string, addCategory: any | boolean): string {
  const fileExt = fileName.split(".").pop().toLowerCase();
  if (typeof addCategory === "object") {
    for (const pattern of Object.keys(addCategory)) {
      if (new RegExp(`^${pattern}$`).test(fileName)) {
        return addCategory[pattern];
      }
    }
    if (addCategory[fileExt]) return addCategory[fileExt];
    if (addCategory["*"]) return addCategory["*"];
    return null;
  }
  switch (fileExt) {
    case "cls":
    case "int":
    case "inc":
    case "mac":
    case "dfi":
      return fileExt;
    default:
      return "oth";
  }
}

export function getFileName(
  folder: string,
  name: string,
  split: boolean,
  addCategory: boolean,
  map: {
    [key: string]: string;
  },
  sep = path.sep
): string {
  if (name.includes("/")) {
    // This is a file from a web application
    const nameArr: string[] = name.split("/");
    const cat = addCategory ? getCategory(name, addCategory) : null;
    return [folder, cat, ...nameArr].filter(notNull).join(sep);
  } else {
    let fileNameArray: string[];
    let fileExt: string;
    if (/\.(?:cls|mac|int|inc)$/.test(name)) {
      // This is a class, routine or include file
      if (map) {
        for (const pattern of Object.keys(map)) {
          if (new RegExp(`^${pattern}$`).test(name)) {
            name = name.replace(new RegExp(`^${pattern}$`), map[pattern]);
            break;
          }
        }
      }
      fileNameArray = name.split(".");
      fileExt = fileNameArray.pop().toLowerCase();
    } else {
      // This is some other type of file (LUT,HL7,...)
      const lastDot = name.lastIndexOf(".");
      fileNameArray = [name.slice(0, lastDot)];
      fileExt = name.slice(lastDot + 1);
    }
    const cat = addCategory ? getCategory(name, addCategory) : null;
    if (split) {
      const fileName = [folder, cat, ...fileNameArray].filter(notNull).join(sep);
      return [fileName, fileExt].join(".");
    }
    return [folder, cat, name].filter(notNull).join(sep);
  }
}

async function exportFile(wsFolderUri: vscode.Uri, namespace: string, name: string, fileName: string): Promise<void> {
  const api = new AtelierAPI(wsFolderUri);
  api.setNamespace(namespace);
  let fileUri = vscode.Uri.file(fileName);
  if (wsFolderUri.scheme != "file") fileUri = wsFolderUri.with({ path: fileUri.path });
  const log = (status: string) =>
    outputChannel.appendLine(`Export '${name}' to '${fileUri.toString(true)}' - ${status}`);

  try {
    const data = await api.getDoc(name);
    if (!data || !data.result) {
      throw new Error("Received malformed JSON object from server fetching document");
    }
    const content = data.result.content;

    // Local function to update local record of mtime
    const recordMtime = async () => {
      const contentString = Buffer.isBuffer(content) ? "" : content.join("\n");
      const file = currentFileFromContent(fileUri, contentString);
      const serverTime = Number(new Date(data.result.ts + "Z"));
      await workspaceState.update(`${file.uniqueId}:mtime`, serverTime);
    };
    if (Buffer.isBuffer(content)) {
      // This is a binary file
      await vscode.workspace.fs.writeFile(fileUri, content);
      exportedUris.push(fileUri.toString());
      await recordMtime();
      log("Success");
    } else {
      // This is a text file
      const joinedContent = content.join("\n");
      await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(joinedContent));
      exportedUris.push(fileUri.toString());
      await recordMtime();
      log("Success");
    }
  } catch (error) {
    const errorStr = stringifyError(error);
    log(errorStr == "" ? "ERROR" : errorStr);
  }
}

export async function exportList(files: string[], workspaceFolder: string, namespace: string): Promise<any> {
  if (!files || !files.length) {
    vscode.window.showWarningMessage("No documents to export.", "Dismiss");
    return;
  }
  const wsFolderUri = uriOfWorkspaceFolder(workspaceFolder);
  if (!workspaceFolder || !wsFolderUri) return;
  if (!vscode.workspace.fs.isWritableFileSystem(wsFolderUri.scheme)) {
    vscode.window.showErrorMessage(`Cannot export to read-only file system '${wsFolderUri.scheme}'.`, "Dismiss");
    return;
  }
  if (!new AtelierAPI(wsFolderUri).active) {
    vscode.window.showErrorMessage("Exporting documents requires an active server connection.", "Dismiss");
    return;
  }

  const { atelier, folder, addCategory, map } = config("export", workspaceFolder);
  const root = wsFolderUri.fsPath + (folder.length ? path.sep + folder : "");
  outputChannel.show(true);
  return vscode.window.withProgress(
    {
      title: `Exporting ${files.length == 1 ? files[0] : files.length + " documents"}`,
      location: vscode.ProgressLocation.Notification,
      cancellable: false,
    },
    () =>
      Promise.allSettled<void>(
        files.map(
          throttleRequests((file: string) =>
            exportFile(wsFolderUri, namespace, file, getFileName(root, file, atelier, addCategory, map))
          )
        )
      )
  );
}

export async function exportAll(): Promise<any> {
  let workspaceFolder: string;
  const workspaceList = vscode.workspace.workspaceFolders
    .filter((folder) => !schemas.includes(folder.uri.scheme) && config("conn", folder.name).active)
    .map((el) => el.name);
  if (workspaceList.length > 1) {
    const selection = await vscode.window.showQuickPick(workspaceList, {
      placeHolder: "Select the workspace folder to export files to.",
    });
    if (selection === undefined) {
      return;
    }
    workspaceFolder = selection;
  } else if (workspaceList.length === 1) {
    workspaceFolder = workspaceList.pop();
  } else {
    vscode.window.showInformationMessage(
      "There are no folders in the current workspace that code can be exported to.",
      "Dismiss"
    );
    return;
  }
  if (!config("conn", workspaceFolder).active) {
    return;
  }
  const api = new AtelierAPI(workspaceFolder);
  const { category, generated, filter, exactFilter, mapped } = config("export", workspaceFolder);
  // Replicate the behavior of getDocNames() but use StudioOpenDialog for better performance
  let filterStr = "";
  switch (category) {
    case "CLS":
      filterStr = "Type = 4";
      break;
    case "CSP":
      filterStr = "Type %INLIST $LISTFROMSTRING('5,6')";
      break;
    case "OTH":
      filterStr = "Type NOT %INLIST $LISTFROMSTRING('0,1,2,3,4,5,6,11,12')";
      break;
    case "RTN":
      filterStr = "Type %INLIST $LISTFROMSTRING('0,1,2,3,11,12')";
      break;
  }
  if (filter !== "" || exactFilter !== "") {
    if (exactFilter !== "") {
      if (filterStr !== "") {
        filterStr += " AND ";
      }
      filterStr += `Name LIKE '${exactFilter}'`;
    } else {
      if (filterStr !== "") {
        filterStr += " AND ";
      }
      filterStr += `Name LIKE '%${filter}%'`;
    }
  }
  return api
    .actionQuery("SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?,?,?)", [
      "*",
      "1",
      "1",
      api.config.ns.toLowerCase() === "%sys" ? "1" : "0",
      "1",
      "0",
      generated ? "1" : "0",
      filterStr,
      "0",
      mapped ? "1" : "0",
    ])
    .then(async (data) => {
      let files: vscode.QuickPickItem[] = data.result.content.map((file) => {
        return { label: file.Name, picked: true };
      });
      files = await vscode.window.showQuickPick(files, {
        canPickMany: true,
        ignoreFocusOut: true,
        placeHolder: "Uncheck a file to exclude it. Press 'Escape' to cancel export.",
        title: "Files to Export",
      });
      if (files === undefined) {
        return;
      }
      return exportList(
        files.map((file) => file.label),
        workspaceFolder,
        api.config.ns
      );
    });
}

export async function exportExplorerItems(nodes: NodeBase[]): Promise<any> {
  const node = nodes[0];
  const origNamespace = config("conn", node.workspaceFolder).ns;
  if (origNamespace !== node.namespace) {
    const answer = await vscode.window.showWarningMessage(
      `
You are about to export from namespace ${node.namespace}.

Future edits to the file(s) in your local workspace will be saved and compiled in the primary namespace of your workspace root, ${origNamespace}, not the namespace from which you originally exported.

Would you like to continue?`,
      {
        modal: true,
      },
      "Yes"
    );
    if (answer !== "Yes") {
      return;
    }
  }
  const { workspaceFolder, namespace } = node;
  return Promise.all(nodes.map((node) => node.getItems4Export())).then((items) => {
    return exportList(items.flat(), workspaceFolder, namespace).then(() => explorerProvider.refresh());
  });
}

export async function exportCurrentFile(): Promise<any> {
  const openEditor = vscode.window.activeTextEditor;
  if (openEditor === undefined) {
    // Need an open document to export
    return;
  }
  const openDoc = openEditor.document;
  if (openDoc.uri.scheme !== OBJECTSCRIPT_FILE_SCHEMA) {
    // Only export files opened from the explorer
    return;
  }
  const api = new AtelierAPI(openDoc.uri);
  return exportList([currentFile(openDoc).name], api.configName, api.config.ns);
}

export async function exportDocumentsToXMLFile(): Promise<void> {
  try {
    // Use the server connection from a workspace folder
    let connectionUri: vscode.Uri;
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    if (workspaceFolders.length == 0) {
      vscode.window.showErrorMessage(
        "'Export Documents to XML File...' command requires an open workspace.",
        "Dismiss"
      );
    } else if (workspaceFolders.length == 1) {
      // Use the current connection
      connectionUri = workspaceFolders[0].uri;
    } else {
      // Pick from the workspace folders
      connectionUri = (
        await vscode.window.showWorkspaceFolderPick({
          ignoreFocusOut: true,
          placeHolder: "Pick a workspace folder. Server-side folders export to the local file system.",
        })
      )?.uri;
    }
    if (connectionUri) {
      const api = new AtelierAPI(connectionUri);
      // Make sure the server connection is active
      if (!api.active || api.ns == "") {
        vscode.window.showErrorMessage(
          "'Export Documents to XML File...' command requires an active server connection.",
          "Dismiss"
        );
        return;
      }
      // Make sure the server has the xml endpoints
      if (api.config.apiVersion < 7) {
        vscode.window.showErrorMessage(
          "'Export Documents to XML File...' command requires InterSystems IRIS version 2023.2 or above.",
          "Dismiss"
        );
        return;
      }
      let defaultUri = vscode.workspace.getWorkspaceFolder(connectionUri)?.uri ?? connectionUri;
      if (schemas.includes(defaultUri.scheme)) {
        // Need a default URI without the isfs scheme or the save dialog
        // will show the virtual files from the workspace folder
        defaultUri = vscode.workspace.workspaceFile;
        if (defaultUri.scheme != "file") {
          vscode.window.showErrorMessage(
            "'Export Documents to XML File...' command is not supported for unsaved workspaces.",
            "Dismiss"
          );
          return;
        }
        // Remove the file name from the URI
        defaultUri = defaultUri.with({ path: defaultUri.path.split("/").slice(0, -1).join("/") });
      }
      if (!vscode.workspace.fs.isWritableFileSystem(defaultUri.scheme)) {
        vscode.window.showErrorMessage(`Cannot export to read-only file system '${defaultUri.scheme}'.`, "Dismiss");
        return;
      }
      // Prompt the user for the documents to export
      const documents = await pickDocuments(api, "to export");
      if (documents.length == 0) {
        return;
      }
      // Prompt the user for the export destination
      const uri = await vscode.window.showSaveDialog({
        saveLabel: "Export",
        filters: {
          "XML Files": ["xml"],
        },
        defaultUri,
      });
      if (uri) {
        // Get the XML content
        const xmlContent = await api.actionXMLExport(documents).then((data) => data.result.content);
        // Save the file
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(xmlContent.join("\n")));
      }
    }
  } catch (error) {
    handleError(error, "Error executing 'Export Documents to XML File...' command.");
  }
}
