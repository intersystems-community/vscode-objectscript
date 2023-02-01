import glob = require("glob");
import path = require("path");
import vscode = require("vscode");
import { AtelierAPI } from "../api";
import {
  config,
  documentContentProvider,
  FILESYSTEM_SCHEMA,
  FILESYSTEM_READONLY_SCHEMA,
  OBJECTSCRIPT_FILE_SCHEMA,
  fileSystemProvider,
  workspaceState,
} from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import {
  cspAppsForUri,
  CurrentBinaryFile,
  currentFile,
  CurrentFile,
  currentFileFromContent,
  CurrentTextFile,
  isClassDeployed,
  notNull,
  outputChannel,
  throttleRequests,
} from "../utils";
import { PackageNode } from "../explorer/models/packageNode";
import { NodeBase } from "../explorer/models/nodeBase";
import { RootNode } from "../explorer/models/rootNode";
import { isText } from "istextorbinary";

async function compileFlags(): Promise<string> {
  const defaultFlags = config().compileFlags;
  return vscode.window.showInputBox({
    prompt: "Compilation flags",
    value: defaultFlags,
  });
}

/**
 * For files being locally edited, get and return its mtime timestamp from workspace-state cache if present there,
 * else get from server. May update cache.
 * - If mtime fetched from server is later than local file mtime, or if `force` parameter is `true`, cache server mtime and return it.
 * - Otherwise if server fetch fails, clear cache entry and return -1.
 * - Otherwise cache local file mtime and return it.
 *
 * For other file types (e.g. isfs) return -1 and do not alter cache.
 * @param file File to check.
 * @param force If passed true, use server mtime.
 * @return mtime timestamp or -1.
 */
export async function checkChangedOnServer(file: CurrentTextFile | CurrentBinaryFile, force = false): Promise<number> {
  if (!file || !file.uri) {
    return -1;
  }
  const api = new AtelierAPI(file.uri);
  const mtime =
    workspaceState.get(`${file.uniqueId}:mtime`, null) ||
    (await api
      .getDoc(file.name)
      .then((data) => data.result)
      .then(async ({ ts, content }) => {
        const serverTime = Number(new Date(ts + "Z"));
        let sameContent: boolean;
        if (typeof file.content === "string") {
          const fileContent = file.content.split(/\r?\n/);
          sameContent = force
            ? false
            : (content as string[]).every((line, index) => line.trim() == (fileContent[index] || "").trim());
        } else {
          sameContent = force ? false : Buffer.compare(content as Buffer, file.content) === 0;
        }
        const mtime =
          force || sameContent ? serverTime : Math.max((await vscode.workspace.fs.stat(file.uri)).mtime, serverTime);
        return mtime;
      })
      .catch(() => -1));
  workspaceState.update(`${file.uniqueId}:mtime`, mtime > 0 ? mtime : undefined);
  return mtime;
}

async function importFile(
  file: CurrentTextFile | CurrentBinaryFile,
  ignoreConflict?: boolean,
  skipDeplCheck = false
): Promise<any> {
  const api = new AtelierAPI(file.uri);
  if (file.name.split(".").pop().toLowerCase() === "cls" && !skipDeplCheck) {
    if (await isClassDeployed(file.name, api)) {
      vscode.window.showErrorMessage(`Cannot import ${file.name} because it is deployed on the server.`, "Dismiss");
      return Promise.reject();
    }
  }
  let enc: boolean;
  let content: string[];
  if (typeof file.content === "string") {
    enc = false;
    content = file.content.split(/\r?\n/);
  } else {
    // Base64 encoding must be in chunk size multiple of 3 and within the server's potential 32K string limit
    // Output is 4 chars for each 3 input, so 24573/3*4 = 32764
    const chunkSize = 24573;
    let start = 0;
    content = [];
    enc = true;
    while (start < file.content.byteLength) {
      content.push(file.content.toString("base64", start, start + chunkSize));
      start += chunkSize;
    }
  }
  const mtime = await checkChangedOnServer(file);
  ignoreConflict = ignoreConflict || mtime < 0 || (file.uri.scheme === "file" && config("overwriteServerChanges"));
  return api
    .putDoc(
      file.name,
      {
        content,
        enc,
        mtime,
      },
      ignoreConflict
    )
    .then(() => {
      // Clear cache entry
      workspaceState.update(`${file.uniqueId}:mtime`, undefined);
      // Create fresh cache entry
      checkChangedOnServer(file, true);

      // In case another extension has used an 'objectscript://' uri to load a document read-only from the server,
      // make it reload with what we just imported to the server.
      const serverUri = DocumentContentProvider.getUri(
        file.name,
        file.workspaceFolder,
        undefined,
        false,
        undefined,
        true
      );
      documentContentProvider.update(serverUri.with({ scheme: "objectscript" }));
    })
    .catch((error) => {
      if (error?.statusCode == 409) {
        const choices: string[] = [];
        if (!enc) {
          choices.push("Compare");
        }
        choices.push("Overwrite on Server", "Pull Server Changes", "Cancel");
        return vscode.window
          .showErrorMessage(
            `Failed to import '${file.name}': The version of the file on the server is newer.
What do you want to do?`,
            ...choices
          )
          .then((action) => {
            switch (action) {
              case "Compare":
                return vscode.commands
                  .executeCommand(
                    "vscode.diff",
                    vscode.Uri.file(file.name).with({
                      scheme: OBJECTSCRIPT_FILE_SCHEMA,
                      authority: file.workspaceFolder,
                    }),
                    file.uri,
                    `Server • ${file.name} ↔ Local • ${file.fileName}`
                  )
                  .then(() => Promise.reject());
              case "Overwrite on Server":
                // Clear cache entry
                workspaceState.update(`${file.uniqueId}:mtime`, undefined);
                // Overwrite
                return importFile(file, true, true);
              case "Pull Server Changes":
                outputChannel.appendLine(`${file.name}: Loading changes from server`);
                outputChannel.show(true);
                loadChanges([file]);
                return Promise.reject();
              case "Cancel":
                outputChannel.appendLine(`${file.name}: Import and Compile canceled by user`);
                outputChannel.show(true);
                return Promise.reject();
            }
            return Promise.reject();
          });
      } else {
        if (error && error.errorText && error.errorText !== "") {
          outputChannel.appendLine("\n" + error.errorText);
          vscode.window
            .showErrorMessage(
              `Failed to save file '${file.name}' on the server. Check 'ObjectScript' output channel for details.`,
              "Show",
              "Dismiss"
            )
            .then((action) => {
              if (action === "Show") {
                outputChannel.show(true);
              }
            });
        } else {
          vscode.window.showErrorMessage(`Failed to save file '${file.name}' on the server.`, "Dismiss");
        }
        return Promise.reject();
      }
    });
}

function updateOthers(others: string[], baseUri: vscode.Uri) {
  let workspaceFolder = vscode.workspace.getWorkspaceFolder(baseUri);
  if (!workspaceFolder && (baseUri.scheme === FILESYSTEM_SCHEMA || baseUri.scheme === FILESYSTEM_READONLY_SCHEMA)) {
    // hack to deal with problem seen with isfs* schemes
    workspaceFolder = vscode.workspace.getWorkspaceFolder(baseUri.with({ path: "" }));
  }
  const workspaceFolderName = workspaceFolder ? workspaceFolder.name : "";
  others.forEach((item) => {
    const uri = DocumentContentProvider.getUri(item, workspaceFolderName);
    if (uri.scheme === FILESYSTEM_SCHEMA || uri.scheme === FILESYSTEM_READONLY_SCHEMA) {
      // Massage uri.path to change the first N-1 dots to slashes, where N is the number of slashes in baseUri.path
      // For example, when baseUri.path is /Foo/Bar.cls and uri.path is /Foo.Bar.1.int
      const partsToConvert = baseUri.path.split("/").length - 1;
      const dotParts = uri.path.split(".");
      const correctPath =
        dotParts.length <= partsToConvert
          ? uri.path
          : dotParts.slice(0, partsToConvert).join("/") + "." + dotParts.slice(partsToConvert).join(".");
      //console.log(`updateOthers: uri.path=${uri.path} baseUri.path=${baseUri.path} correctPath=${correctPath}`);
      fileSystemProvider.fireFileChanged(uri.with({ path: correctPath }));
    } else {
      documentContentProvider.update(uri);
    }
  });
}

export async function loadChanges(files: (CurrentTextFile | CurrentBinaryFile)[]): Promise<any> {
  if (!files.length) {
    return;
  }
  const api = new AtelierAPI(files[0].uri);
  return Promise.all(
    files.map((file) =>
      api
        .getDoc(file.name)
        .then(async (data) => {
          const mtime = Number(new Date(data.result.ts + "Z"));
          workspaceState.update(`${file.uniqueId}:mtime`, mtime > 0 ? mtime : undefined);
          if (file.uri.scheme === "file") {
            if (Buffer.isBuffer(data.result.content)) {
              // This is a binary file
              await vscode.workspace.fs.writeFile(file.uri, data.result.content);
            } else {
              // This is a text file
              const content = (data.result.content || []).join(
                (file as CurrentTextFile).eol === vscode.EndOfLine.LF ? "\n" : "\r\n"
              );
              await vscode.workspace.fs.writeFile(file.uri, new TextEncoder().encode(content));
            }
          } else if (file.uri.scheme === FILESYSTEM_SCHEMA || file.uri.scheme === FILESYSTEM_READONLY_SCHEMA) {
            fileSystemProvider.fireFileChanged(file.uri);
          }
        })
        .then(() => api.actionIndex([file.name]))
        .then((data) => data.result.content[0].others)
        .then((others) => {
          updateOthers(others, file.uri);
        })
    )
  );
}

async function compile(docs: CurrentFile[], flags?: string): Promise<any> {
  flags = flags || config("compileFlags");
  const api = new AtelierAPI(docs[0].uri);
  return vscode.window
    .withProgress(
      {
        cancellable: true,
        location: vscode.ProgressLocation.Notification,
        title: `Compiling: ${docs.length === 1 ? docs.map((el) => el.name).join(", ") : docs.length + " files"}`,
      },
      (progress, token: vscode.CancellationToken) =>
        api
          .asyncCompile(
            docs.map((el) => el.name),
            token,
            flags
          )
          .then((data) => {
            const info = docs.length > 1 ? "" : `${docs[0].name}: `;
            if (data.status && data.status.errors && data.status.errors.length) {
              throw new Error(`${info}Compile error`);
            } else if (!config("suppressCompileMessages")) {
              vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
            }
            return docs;
          })
          .catch(() => {
            if (!config("suppressCompileErrorMessages")) {
              vscode.window
                .showErrorMessage(
                  "Compilation failed. Check 'ObjectScript' output channel for details.",
                  "Show",
                  "Dismiss"
                )
                .then((action) => {
                  if (action === "Show") {
                    outputChannel.show(true);
                  }
                });
            }
            // Always fetch server changes, even when compile failed or got cancelled
            return docs;
          })
    )
    .then(loadChanges);
}

export async function importAndCompile(
  askFlags = false,
  document?: vscode.TextDocument,
  compileFile = true
): Promise<any> {
  const file = currentFile(document);
  if (!file) {
    return;
  }

  // Do nothing if it is a local file and objectscript.conn.active is false
  if (file.uri.scheme === "file" && !config("conn").active) {
    return;
  }

  const defaultFlags = config().compileFlags;
  const flags = askFlags ? await compileFlags() : defaultFlags;
  return importFile(file)
    .catch((error) => {
      // console.error(error);
      throw error;
    })
    .then(() => {
      if (!file.fileName.startsWith("\\.vscode\\")) {
        if (compileFile) {
          compile([file], flags);
        } else {
          if (file.uri.scheme === FILESYSTEM_SCHEMA || file.uri.scheme === FILESYSTEM_READONLY_SCHEMA) {
            // Fire the file changed event to avoid VSCode alerting the user on the next save that
            // "The content of the file is newer."
            fileSystemProvider.fireFileChanged(file.uri);
          }
        }
      }
    });
}

export async function compileOnly(askFlags = false, document?: vscode.TextDocument): Promise<any> {
  document =
    document ||
    (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document
      ? vscode.window.activeTextEditor.document
      : null);

  if (!document) {
    return;
  }

  const file = currentFile(document);
  if (!file) {
    return;
  }

  // Do nothing if it is a local file and objectscript.conn.active is false
  if (file.uri.scheme === "file" && !config("conn").active) {
    return;
  }

  if (document.isDirty) {
    // Don't compile if document is dirty
    vscode.window.showWarningMessage(
      "Cannot compile '" + file.name + "' because it has unpersisted changes.",
      "Dismiss"
    );
    return;
  }

  const defaultFlags = config().compileFlags;
  const flags = askFlags ? await compileFlags() : defaultFlags;
  if (!file.fileName.startsWith("\\.vscode\\")) {
    compile([file], flags);
  }
}

// Compiles all files types in the namespace
export async function namespaceCompile(askFlags = false): Promise<any> {
  const api = new AtelierAPI();
  const fileTypes = ["*.CLS", "*.MAC", "*.INC", "*.BAS"];
  if (!config("conn").active) {
    throw new Error(`No Active Connection`);
  }
  const confirm = await vscode.window.showWarningMessage(
    `Compiling all files in namespace ${api.ns} might be expensive. Are you sure you want to proceed?`,
    "Cancel",
    "Confirm"
  );
  if (confirm !== "Confirm") {
    // Don't compile without confirmation
    return;
  }
  const defaultFlags = config().compileFlags;
  const flags = askFlags ? await compileFlags() : defaultFlags;
  if (flags === undefined) {
    // User cancelled
    return;
  }
  vscode.window.withProgress(
    {
      cancellable: true,
      location: vscode.ProgressLocation.Notification,
      title: `Compiling namespace ${api.ns}`,
    },
    (progress, token: vscode.CancellationToken) =>
      api
        .asyncCompile(fileTypes, token, flags)
        .then((data) => {
          if (data.status && data.status.errors && data.status.errors.length) {
            throw new Error(`Compiling Namespace: ${api.ns} Error`);
          } else if (!config("suppressCompileMessages")) {
            vscode.window.showInformationMessage(`Compiling namespace ${api.ns} succeeded.`, "Dismiss");
          }
        })
        .catch(() => {
          if (!config("suppressCompileErrorMessages")) {
            vscode.window
              .showErrorMessage(
                `Compiling namespace ${api.ns} failed. Check 'ObjectScript' output channel for details.`,
                "Show",
                "Dismiss"
              )
              .then((action) => {
                if (action === "Show") {
                  outputChannel.show(true);
                }
              });
          }
        })
        .then(() => {
          // Always fetch server changes, even when compile failed or got cancelled
          const file = currentFile();
          return loadChanges([file]);
        })
  );
}

function importFiles(files: string[], noCompile = false) {
  return Promise.all<CurrentFile>(
    files.map(
      throttleRequests((file: string) => {
        const uri = vscode.Uri.file(file);
        return vscode.workspace.fs
          .readFile(uri)
          .then((contentBytes) => {
            if (isText(file, Buffer.from(contentBytes))) {
              return currentFileFromContent(uri, new TextDecoder().decode(contentBytes));
            } else {
              return currentFileFromContent(uri, Buffer.from(contentBytes));
            }
          })
          .then((curFile) =>
            importFile(curFile).then((data) => {
              outputChannel.appendLine("Imported file: " + curFile.fileName);
              return curFile;
            })
          );
      })
    )
  ).then(noCompile ? Promise.resolve : compile);
}

export async function importFolder(uri: vscode.Uri, noCompile = false): Promise<any> {
  const uripath = uri.fsPath;
  if ((await vscode.workspace.fs.stat(uri)).type != vscode.FileType.Directory) {
    return importFiles([uripath], noCompile);
  }
  let globpattern = "*.{cls,inc,int,mac}";
  if (cspAppsForUri(uri).findIndex((cspApp) => uri.path.includes(cspApp + "/") || uri.path.endsWith(cspApp)) != -1) {
    // This folder is a CSP application, so import all files
    // We need to include eveything because CSP applications can
    // include non-InterSystems files
    globpattern = "*";
  }
  glob(
    globpattern,
    {
      cwd: uripath,
      matchBase: true,
      nocase: true,
    },
    (_error, files) =>
      importFiles(
        files.map((name) => path.join(uripath, name)),
        noCompile
      )
  );
}

export async function compileExplorerItems(nodes: NodeBase[]): Promise<any> {
  const { workspaceFolder, namespace } = nodes[0];
  const flags = config().compileFlags;
  const api = new AtelierAPI(workspaceFolder);
  api.setNamespace(namespace);
  const docs = [];
  for (const node of nodes) {
    if (node instanceof PackageNode) {
      switch (node.category) {
        case "RTN":
          docs.push(node.fullName + ".*.mac");
          break;
        case "CLS":
          docs.push(node.fullName + ".*.cls");
          break;
      }
    } else if (node instanceof RootNode && node.contextValue === "dataNode:cspApplication") {
      docs.push(node.fullName + "/*");
    } else {
      docs.push(node.fullName);
    }
  }
  return vscode.window.withProgress(
    {
      cancellable: true,
      location: vscode.ProgressLocation.Notification,
      title: `Compiling ${nodes.length === 1 ? nodes[0].fullName : nodes.length + " nodes"}`,
    },
    (progress, token: vscode.CancellationToken) =>
      api
        .asyncCompile(docs, token, flags)
        .then((data) => {
          const info = nodes.length > 1 ? "" : `${nodes[0].fullName}: `;
          if (data.status && data.status.errors && data.status.errors.length) {
            throw new Error(`${info}Compile error`);
          } else if (!config("suppressCompileMessages")) {
            vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
          }
        })
        .catch(() => {
          if (!config("suppressCompileErrorMessages")) {
            vscode.window
              .showErrorMessage(
                `Compilation failed. Check 'ObjectScript' output channel for details.`,
                "Show",
                "Dismiss"
              )
              .then((action) => {
                if (action === "Show") {
                  outputChannel.show(true);
                }
              });
          }
        })
  );
}

/** Import file `name` to server `api`. Used for importing local files that are not used as part of a client-side editing workspace. */
async function importFileFromContent(
  name: string,
  content: string,
  api: AtelierAPI,
  ignoreConflict?: boolean,
  skipDeplCheck = false
): Promise<void> {
  if (name.split(".").pop().toLowerCase() === "cls" && !skipDeplCheck) {
    const result = await api.actionIndex([name]);
    if (result.result.content[0].content.depl) {
      vscode.window.showErrorMessage(`Cannot import ${name} because it is deployed on the server.`, "Dismiss");
      return Promise.reject();
    }
  }
  ignoreConflict = ignoreConflict || config("overwriteServerChanges");
  return api
    .putDoc(
      name,
      {
        content: content.split(/\r?\n/),
        enc: false,
        // We don't have an mtime for this file because it's outside a local workspace folder
        mtime: 0,
      },
      ignoreConflict
    )
    .then(() => {
      return;
    })
    .catch((error) => {
      if (error?.statusCode == 409) {
        return vscode.window
          .showErrorMessage(
            `Failed to import '${name}' because it already exists on the server. Overwrite server copy?`,
            "Yes",
            "No"
          )
          .then((action) => {
            if (action == "Yes") {
              return importFileFromContent(name, content, api, true, true);
            } else {
              return Promise.reject();
            }
          });
      } else {
        if (error && error.errorText && error.errorText !== "") {
          outputChannel.appendLine("\n" + error.errorText);
          vscode.window
            .showErrorMessage(
              `Failed to save file '${name}' on the server. Check 'ObjectScript' output channel for details.`,
              "Show",
              "Dismiss"
            )
            .then((action) => {
              if (action === "Show") {
                outputChannel.show(true);
              }
            });
        } else {
          vscode.window.showErrorMessage(`Failed to save file '${name}' on the server.`, "Dismiss");
        }
        return Promise.reject();
      }
    });
}

/** Import files from the local file system into a server-namespace from an `isfs` workspace folder. */
export async function importLocalFilesToServerSideFolder(wsFolderUri: vscode.Uri): Promise<any> {
  if (
    !(
      wsFolderUri instanceof vscode.Uri &&
      wsFolderUri.scheme == FILESYSTEM_SCHEMA &&
      (vscode.workspace.workspaceFolders != undefined
        ? vscode.workspace.workspaceFolders.findIndex(
            (wsFolder) => wsFolder.uri.toString() == wsFolderUri.toString()
          ) != -1
        : false)
    )
  ) {
    // Need an isfs workspace folder URI
    return;
  }
  if (vscode.workspace.workspaceFile.scheme != "file") {
    vscode.window.showErrorMessage(
      "'Import Local Files...' command is not supported for unsaved workspaces.",
      "Dismiss"
    );
    return;
  }
  const api = new AtelierAPI(wsFolderUri);
  // Prompt the user for files to import
  let uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    openLabel: "Import",
    filters: {
      "InterSystems Files": ["cls", "mac", "int", "inc"],
    },
    // Need a default URI with file scheme or the open dialog
    // will show the virtual files from the workspace folder
    defaultUri: vscode.workspace.workspaceFile,
  });
  if (!Array.isArray(uris) || uris.length == 0) {
    // No files to import
    return;
  }
  // Filter out non-ISC files
  uris = uris.filter((uri) => ["cls", "mac", "int", "inc"].includes(uri.path.split(".").pop().toLowerCase()));
  if (uris.length == 0) {
    vscode.window.showErrorMessage("No classes or routines were selected.", "Dismiss");
    return;
  }
  // Import the files
  return Promise.allSettled<string>(
    uris.map(
      throttleRequests((uri: vscode.Uri) =>
        vscode.workspace.fs
          .readFile(uri)
          .then((contentBytes) => new TextDecoder().decode(contentBytes))
          .then((content) => {
            // Determine the name of this file
            let docName = "";
            let ext = "";
            if (uri.path.split(".").pop().toLowerCase() == "cls") {
              // Allow Unicode letters
              const match = content.match(/^[ \t]*Class[ \t]+(%?[\p{L}\d]+(?:\.[\p{L}\d]+)+)/imu);
              if (match) {
                [, docName, ext = "cls"] = match;
              }
            } else {
              const match = content.match(/^ROUTINE ([^\s]+)(?:\s*\[\s*Type\s*=\s*\b([a-z]{3})\b)?/i);
              if (match) {
                [, docName, ext = "mac"] = match;
              } else {
                const basename = uri.path.split("/").pop();
                docName = basename.slice(0, basename.lastIndexOf("."));
                ext = basename.slice(basename.lastIndexOf(".") + 1);
              }
            }
            if (docName != "" && ext != "") {
              docName += `.${ext.toLowerCase()}`;
              return importFileFromContent(docName, content, api).then(() => {
                outputChannel.appendLine("Imported file: " + uri.path.split("/").pop());
                return docName;
              });
            } else {
              vscode.window.showErrorMessage(
                `Cannot determine document name for file ${uri.toString(true)}.`,
                "Dismiss"
              );
              return Promise.reject();
            }
          })
      )
    )
  ).then((results) => {
    const imported = results.map((result) => (result.status == "fulfilled" ? result.value : null)).filter(notNull);
    // Prompt the user for compilation
    if (imported.length) {
      return vscode.window
        .showInformationMessage(
          `Imported ${imported.length == 1 ? imported[0] : `${imported.length} files`}. Compile ${
            imported.length > 1 ? "them" : "it"
          }?`,
          "Yes",
          "No"
        )
        .then((response) => {
          if (response == "Yes") {
            // Compile the imported files
            return vscode.window.withProgress(
              {
                cancellable: true,
                location: vscode.ProgressLocation.Notification,
                title: `Compiling: ${imported.length == 1 ? imported[0] : imported.length + " files"}`,
              },
              (progress, token: vscode.CancellationToken) =>
                api
                  .asyncCompile(imported, token, config("compileFlags"))
                  .then((data) => {
                    const info = imported.length > 1 ? "" : `${imported[0]}: `;
                    if (data.status && data.status.errors && data.status.errors.length) {
                      throw new Error(`${info}Compile error`);
                    } else if (!config("suppressCompileMessages")) {
                      vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
                    }
                  })
                  .catch(() => {
                    if (!config("suppressCompileErrorMessages")) {
                      vscode.window
                        .showErrorMessage(
                          "Compilation failed. Check 'ObjectScript' output channel for details.",
                          "Show",
                          "Dismiss"
                        )
                        .then((action) => {
                          if (action === "Show") {
                            outputChannel.show(true);
                          }
                        });
                    }
                  })
                  .finally(() => {
                    // Refresh the files explorer to show the new files
                    vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
                  })
            );
          } else {
            // Refresh the files explorer to show the new files
            vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
            return Promise.resolve();
          }
        });
    } else {
      return Promise.resolve();
    }
  });
}
