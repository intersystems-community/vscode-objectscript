import path = require("path");
import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, explorerProvider, OBJECTSCRIPT_FILE_SCHEMA, schemas, workspaceState } from "../extension";
import {
  currentFile,
  currentFileFromContent,
  fileExists,
  notNull,
  outputChannel,
  uriOfWorkspaceFolder,
} from "../utils";
import { NodeBase } from "../explorer/models/nodeBase";

export const getCategory = (fileName: string, addCategory: any | boolean): string => {
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
};

export const getFileName = (
  folder: string,
  name: string,
  split: boolean,
  addCategory: boolean,
  map: {
    [key: string]: string;
  }
): string => {
  if (name.includes("/")) {
    // This is a file from a web application
    const nameArr: string[] = name.split("/");
    const cat = addCategory ? getCategory(name, addCategory) : null;
    return [folder, cat, ...nameArr].filter(notNull).join(path.sep);
  } else {
    let fileNameArray: string[];
    let fileExt: string;
    if (/\.dfi$/i.test(name)) {
      // This is a DFI file
      fileNameArray = name.split("-");
      fileNameArray.push(fileNameArray.pop().slice(0, -4));
      fileExt = "dfi";
    } else if (/\.(?:cls|mac|int|inc)$/.test(name)) {
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
      const fileName = [folder, cat, ...fileNameArray].filter(notNull).join(path.sep);
      return [fileName, fileExt].join(".");
    }
    return [folder, cat, name].filter(notNull).join(path.sep);
  }
};

export const getFolderName = (folder: string, name: string, split: boolean, cat: string = null): string => {
  const folderNameArray: string[] = name.split(".");
  if (split) {
    return [folder, cat, ...folderNameArray].filter(notNull).join(path.sep);
  }
  return [folder, cat, name].filter(notNull).join(path.sep);
};

export async function exportFile(
  workspaceFolder: string,
  namespace: string,
  name: string,
  fileName: string
): Promise<void> {
  if (!config("conn", workspaceFolder).active) {
    return Promise.reject("Connection not active");
  }
  const api = new AtelierAPI(workspaceFolder);
  api.setNamespace(namespace);
  const log = (status) => outputChannel.appendLine(`export "${name}" as "${fileName}" - ${status}`);
  const fileUri = vscode.Uri.file(fileName);
  const foldersUri = vscode.Uri.file(path.dirname(fileName));
  try {
    if (!(await fileExists(foldersUri))) {
      // Only attempt to create directories that don't exist
      await vscode.workspace.fs.createDirectory(foldersUri);
    }

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
      return;
    };

    const { noStorage, dontExportIfNoChanges } = config("export");

    const storageResult: { found: boolean; content?: string } = await new Promise((resolve, reject) => {
      if (noStorage) {
        // get only the storage xml for the doc.
        api
          .getDoc(name + "?storageOnly=1")
          .then((storageData) => {
            if (!storageData || !storageData.result) {
              reject(new Error("Received malformed JSON object from server fetching storage only"));
            }
            const storageContent = storageData.result.content;

            if (storageContent.length > 1 && storageContent[0] && storageContent.length < content.length) {
              const storageContentString = storageContent.join("\n");
              const contentString = content.join("\n");

              // find and replace the docs storage section with ''
              resolve({
                content: contentString.replace(storageContentString, ""),
                found: contentString.indexOf(storageContentString) >= 0,
              });
            } else {
              resolve({ found: false });
            }
          })
          .catch((error) => reject(error));
      } else {
        resolve({ found: false });
      }
    });

    if (Buffer.isBuffer(content)) {
      // This is a binary file
      let isSkipped = "";
      if (dontExportIfNoChanges && (await fileExists(fileUri))) {
        const existingContent = await vscode.workspace.fs.readFile(fileUri);
        if (!content.equals(existingContent)) {
          await vscode.workspace.fs.writeFile(fileUri, content);
          await recordMtime();
        } else {
          isSkipped = " => skipped - no changes.";
        }
      } else {
        await vscode.workspace.fs.writeFile(fileUri, content);
        await recordMtime();
      }
      log(`Success ${isSkipped}`);
    } else {
      // This is a text file
      let joinedContent = content.join("\n");
      let isSkipped = "";

      if (storageResult.found) {
        joinedContent = storageResult.content;
      }

      if (dontExportIfNoChanges && (await fileExists(fileUri))) {
        const existingContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(fileUri));
        // stringify to harmonise the text encoding.
        if (JSON.stringify(joinedContent) !== JSON.stringify(existingContent)) {
          await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(joinedContent));
          await recordMtime();
        } else {
          isSkipped = " => skipped - no changes.";
        }
      } else {
        await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(joinedContent));
        await recordMtime();
      }

      log(`Success ${isSkipped}`);
    }
  } catch (error) {
    const errorStr = typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error);
    log(`ERROR${errorStr.length ? `: ${errorStr}` : ""}`);
    throw errorStr;
  }
}

export async function exportList(files: string[], workspaceFolder: string, namespace: string): Promise<any> {
  if (!files || !files.length) {
    vscode.window.showWarningMessage("Nothing to export");
  }
  const { atelier, folder, addCategory, map } = config("export", workspaceFolder);

  if (!workspaceFolder) {
    // No workspace folders are open
    return;
  }
  const root = [
    uriOfWorkspaceFolder(workspaceFolder).fsPath,
    typeof folder === "string" && folder.length ? folder : null,
  ]
    .filter(notNull)
    .join(path.sep);
  const run = async (fileList) => {
    const errors = [];
    for (const file of fileList) {
      await exportFile(workspaceFolder, namespace, file, getFileName(root, file, atelier, addCategory, map)).catch(
        (error) => {
          errors.push(`${file} - ${error}`);
        }
      );
    }
    outputChannel.appendLine(`Exported items: ${fileList.length - errors.length}`);
    if (errors.length) {
      outputChannel.appendLine(`Items failed to export: \n${errors.join("\n")}`);
    }
  };
  return vscode.window.withProgress(
    {
      title: "Export items",
      location: vscode.ProgressLocation.Notification,
    },
    () => {
      return run(files);
    }
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
  outputChannel.show(true);
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
