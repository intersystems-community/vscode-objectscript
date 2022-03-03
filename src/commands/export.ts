import fs = require("fs");
import path = require("path");
import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, explorerProvider, OBJECTSCRIPT_FILE_SCHEMA, schemas } from "../extension";
import { currentFile, mkdirSyncRecursive, notNull, outputChannel, uriOfWorkspaceFolder } from "../utils";
import { NodeBase } from "../explorer/models/nodeBase";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

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
    } else {
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
  const folders = path.dirname(fileName);
  return mkdirSyncRecursive(folders)
    .then(() => {
      return api.getDoc(name).then((data) => {
        if (!data || !data.result) {
          throw new Error("Something wrong happened");
        }
        const content = data.result.content;
        const { noStorage, dontExportIfNoChanges } = config("export");

        const promise = new Promise((resolve, reject) => {
          if (noStorage) {
            // get only the storage xml for the doc.
            api.getDoc(name + "?storageOnly=1").then((storageData) => {
              if (!storageData || !storageData.result) {
                reject(new Error("Something wrong happened fetching the storage data"));
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
            });
          } else {
            resolve({ found: false });
          }
        });

        return promise
          .then((res: any) => {
            if (Buffer.isBuffer(content)) {
              // This is a binary file
              let isSkipped = "";
              if (dontExportIfNoChanges && fs.existsSync(fileName)) {
                const existingContent = fs.readFileSync(fileName);
                if (content.equals(existingContent)) {
                  fs.writeFileSync(fileName, content);
                } else {
                  isSkipped = " => skipped - no changes.";
                }
              } else {
                fs.writeFileSync(fileName, content);
              }
              log(`Success ${isSkipped}`);
            } else {
              // This is a text file
              let joinedContent = content.join("\n");
              let isSkipped = "";

              if (res.found) {
                joinedContent = res.content.toString("utf8");
              }

              if (dontExportIfNoChanges && fs.existsSync(fileName)) {
                const existingContent = fs.readFileSync(fileName, "utf8");
                // stringify to harmonise the text encoding.
                if (JSON.stringify(joinedContent) !== JSON.stringify(existingContent)) {
                  fs.writeFileSync(fileName, joinedContent);
                } else {
                  isSkipped = " => skipped - no changes.";
                }
              } else {
                fs.writeFileSync(fileName, joinedContent);
              }

              log(`Success ${isSkipped}`);
            }
          })
          .catch((error) => {
            throw error;
          });
      });
    })
    .catch((error) => {
      log("ERROR: " + error);
      throw error;
    });
}

export async function exportList(files: string[], workspaceFolder: string, namespace: string): Promise<any> {
  if (!files || !files.length) {
    vscode.window.showWarningMessage("Nothing to export");
  }
  const { atelier, folder, addCategory, map } = config("export", workspaceFolder);

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

async function pickWorkspaceFolder(): Promise<string | undefined> {
  const workspaceList = vscode.workspace.workspaceFolders
    .filter((folder) => !schemas.includes(folder.uri.scheme) && config("conn", folder.name).active)
    .map((el) => el.name);
  if (workspaceList.length > 1) {
    return vscode.window.showQuickPick(workspaceList, {
      placeHolder: "Select the workspace folder to export files to.",
    });
  } else if (workspaceList.length === 1) {
    return workspaceList.pop();
  } else {
    vscode.window.showInformationMessage(
      "There are no folders in the current workspace that code can be exported to.",
      "Dismiss"
    );
    return undefined;
  }
}

export async function exportAll(): Promise<any> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (workspaceFolder === undefined) {
    return;
  }
  if (!config("conn", workspaceFolder).active) {
    return;
  }
  const api = new AtelierAPI(workspaceFolder);
  outputChannel.show(true);
  const { category, generated, filter } = config("export", workspaceFolder);
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
  if (filter !== "") {
    if (filterStr !== "") {
      filterStr += " AND ";
    }
    filterStr += `Name LIKE '%${filter}%'`;
  }
  return api
    .actionQuery("SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?)", [
      "*",
      "1",
      "1",
      api.config.ns.toLowerCase() === "%sys" ? "1" : "0",
      "1",
      "0",
      generated ? "1" : "0",
      filterStr,
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

export async function exportStudioProject(): Promise<any> {
  const workspaceFolder = await pickWorkspaceFolder();
  if (workspaceFolder === undefined) {
    return;
  }
  if (!config("conn", workspaceFolder).active) {
    return;
  }
  const api = new AtelierAPI(workspaceFolder);
  const ns = api.config.ns.toUpperCase();
  outputChannel.show(true);
  const projects: string[] = await api
    .actionQuery("SELECT Name FROM %Studio.Project_ProjectList()", [])
    .then((data) => data.result.content.map((prj) => prj.Name));
  if (projects.length === 0) {
    vscode.window.showInformationMessage(`Namespace ${ns} contains no Studio projects.`, "Dismiss");
    return;
  }
  const project = await vscode.window.showQuickPick(projects, {
    placeHolder: "Select the project to export files from.",
  });
  if (project === undefined) {
    return;
  }
  await api
    .actionQuery("SELECT Name, Type FROM %Studio.Project_ProjectItemsList(?)", [project])
    .then((data) => data.result.content)
    .then((items: { Name: string; Type: string }[]) => {
      return Promise.all(
        items
          .filter((item) => item.Type !== "PKG" && item.Type !== "GBL")
          .map(async (item): Promise<string | string[]> => {
            if (item.Type === "MAC" || item.Type === "CSP") {
              return item.Name;
            } else if (item.Type === "CLS") {
              return `${item.Name}.cls`;
            } else {
              // We need to use StudioOpenDialog to get all files in this CSP DIR
              return api
                .actionQuery("SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)", [
                  `${item.Name}/*`,
                  "1",
                  "1",
                  ns === "%SYS" ? "1" : "0",
                  "1",
                  "0",
                  config("export", workspaceFolder).generated ? "1" : "0",
                ])
                .then((data) => data.result.content.map((f) => f.Name));
            }
          })
      );
    })
    .then((docs) => {
      return exportList(docs.flat(), workspaceFolder, ns);
    })
    .then(async () => {
      return vscode.window
        .showInformationMessage(
          `Successfully exported files from project '${project}'. Would you also like to export breakpoints?`,
          "Yes",
          "No"
        )
        .then(async (answer) => {
          if (answer === "Yes") {
            api
              .actionQuery("SELECT Routine, Offset, Condition FROM %Studio.Project_BreakPointsList(?)", [project])
              .then((data) => data.result.content)
              .then(async (iscbps: { Routine: string; Offset: string; Condition: string }[]) =>
                vscode.debug.addBreakpoints(
                  await Promise.all(
                    iscbps.map(async (iscbp): Promise<vscode.SourceBreakpoint | null> => {
                      const uri = DocumentContentProvider.getUri(iscbp.Routine, workspaceFolder, ns);
                      if (uri.scheme !== "file") {
                        // Don't set breakpoints for files that we didn't export
                        return null;
                      }
                      if (iscbp.Routine.split(".").pop().toLowerCase() === "cls") {
                        const offsetArr = iscbp.Offset.split("+");
                        const offsetLine = offsetArr.pop();
                        const label = offsetArr.join("+");
                        let docLine = -1;
                        let symbols: vscode.DocumentSymbol[];
                        try {
                          symbols = (
                            await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                              "vscode.executeDocumentSymbolProvider",
                              uri
                            )
                          )[0].children;
                        } catch {
                          // Computing the document symbols failed
                          return null;
                        }
                        for (const symbol of symbols) {
                          if (symbol.name === label) {
                            const content: string[] = new TextDecoder()
                              .decode(await vscode.workspace.fs.readFile(uri))
                              .split("\n");
                            for (
                              let methodlinenum = symbol.selectionRange.start.line;
                              methodlinenum <= symbol.range.end.line;
                              methodlinenum++
                            ) {
                              // Find the offset of this breakpoint in the method
                              const methodlinetext: string = content[methodlinenum].trim();
                              if (methodlinetext.endsWith("{")) {
                                docLine = methodlinenum + Number(offsetLine);
                                break;
                              }
                            }
                            break;
                          }
                        }
                        if (docLine === -1) {
                          // We couldn't map the label+offset to a line in the document
                          return null;
                        }
                        return new vscode.SourceBreakpoint(
                          new vscode.Location(uri, new vscode.Position(docLine, 0)),
                          true,
                          iscbp.Condition
                        );
                      } else {
                        return new vscode.SourceBreakpoint(
                          new vscode.Location(uri, new vscode.Position(Number(iscbp.Offset) - 1, 0)),
                          true,
                          iscbp.Condition
                        );
                      }
                    })
                  ).then((vscbps) => vscbps.filter(notNull))
                )
              );
          }
        });
    });
}
