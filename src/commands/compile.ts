import vscode = require("vscode");
import { isText } from "istextorbinary";
import { AtelierAPI } from "../api";
import {
  config,
  documentContentProvider,
  FILESYSTEM_SCHEMA,
  OBJECTSCRIPT_FILE_SCHEMA,
  fileSystemProvider,
  workspaceState,
  filesystemSchemas,
  schemas,
} from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import {
  base64EncodeContent,
  classNameRegex,
  compileErrorMsg,
  cspAppsForUri,
  CurrentBinaryFile,
  currentFile,
  CurrentFile,
  currentFileFromContent,
  CurrentTextFile,
  exportedUris,
  getWsFolder,
  handleError,
  isClassDeployed,
  isClassOrRtn,
  lastUsedLocalUri,
  notIsfs,
  notNull,
  outputChannel,
  RateLimiter,
  routineNameTypeRegex,
} from "../utils";
import { StudioActions } from "./studio";
import { NodeBase, PackageNode, RootNode } from "../explorer/nodes";
import { getUrisForDocument, updateIndexForDocument } from "../utils/documentIndex";

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
  if (!file || !file.uri || schemas.includes(file.uri.scheme)) {
    return -1;
  }
  const api = new AtelierAPI(file.uri);
  const mtime =
    workspaceState.get(`${file.uniqueId}:mtime`, null) ||
    (await api
      .getDoc(file.name, file.uri)
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

export async function importFile(
  file: CurrentTextFile | CurrentBinaryFile,
  ignoreConflict?: boolean,
  skipDeplCheck = false
): Promise<any> {
  const api = new AtelierAPI(file.uri);
  if (!api.active) return;
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

    // Avoid appending a blank line on every save, which would cause a web app file to grow each time
    if (file.name.includes("/") && content.length > 1 && content[content.length - 1] == "") {
      content.pop();
    }
  } else {
    enc = true;
    content = base64EncodeContent(file.content);
  }
  const mtime = await checkChangedOnServer(file);
  ignoreConflict =
    ignoreConflict ||
    mtime < 0 ||
    (notIsfs(file.uri) &&
      vscode.workspace.getConfiguration("objectscript", file.uri).get<boolean>("overwriteServerChanges"));
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
    .then((data) => {
      // Update cache entry
      workspaceState.update(`${file.uniqueId}:mtime`, Number(new Date(data.result.ts + "Z")));

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
      documentContentProvider.update(serverUri.with({ scheme: OBJECTSCRIPT_FILE_SCHEMA }));
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
        handleError(error, `Failed to save file '${file.name}' on the server.`);
        return Promise.reject();
      }
    });
}

function updateOthers(others: string[], baseUri: vscode.Uri) {
  let workspaceFolder = vscode.workspace.getWorkspaceFolder(baseUri);
  if (!workspaceFolder && filesystemSchemas.includes(baseUri.scheme)) {
    // hack to deal with problem seen with isfs* schemes
    workspaceFolder = vscode.workspace.getWorkspaceFolder(baseUri.with({ path: "" }));
  }
  others.forEach((item) => {
    const uri = DocumentContentProvider.getUri(item, undefined, undefined, undefined, workspaceFolder?.uri);
    if (filesystemSchemas.includes(uri.scheme)) {
      fileSystemProvider.fireFileChanged(uri);
    } else if (uri.scheme == OBJECTSCRIPT_FILE_SCHEMA) {
      documentContentProvider.update(uri);
    }
  });
}

export async function loadChanges(files: (CurrentTextFile | CurrentBinaryFile)[]): Promise<any> {
  if (!files.length) {
    return;
  }
  const api = new AtelierAPI(files[0].uri);
  // Use allSettled so we attempt to load changes for all files, even if some fail
  return api.actionIndex(files.map((f) => f.name)).then((data) =>
    Promise.allSettled(
      data.result.content.map(async (doc) => {
        if (doc.status.length) return;
        const file = files.find((f) => f.name == doc.name);
        const mtime = Number(new Date(doc.ts + "Z"));
        workspaceState.update(`${file.uniqueId}:mtime`, mtime > 0 ? mtime : undefined);
        if (notIsfs(file.uri)) {
          const content = await api.getDoc(file.name, file.uri).then((data) => data.result.content);
          exportedUris.add(file.uri.toString()); // Set optimistically
          await vscode.workspace.fs
            .writeFile(file.uri, Buffer.isBuffer(content) ? content : new TextEncoder().encode(content.join("\n")))
            .then(undefined, (e) => {
              // Save failed, so remove this URI from the set
              exportedUris.delete(file.uri.toString());
              // Re-throw the error
              throw e;
            });
          if (isClassOrRtn(file.uri)) {
            // Update the document index
            updateIndexForDocument(file.uri, undefined, undefined, content);
          }
        } else if (filesystemSchemas.includes(file.uri.scheme)) {
          fileSystemProvider.fireFileChanged(file.uri);
        }
        updateOthers(doc.others, file.uri);
      })
    )
  );
}

export async function compile(docs: CurrentFile[], flags?: string): Promise<any> {
  const wsFolder = vscode.workspace.getWorkspaceFolder(docs[0].uri);
  const conf = vscode.workspace.getConfiguration("objectscript", wsFolder || docs[0].uri);
  flags = flags || conf.get("compileFlags");
  const api = new AtelierAPI(docs[0].uri);
  const docNames = docs.map((d) => d.name);
  return vscode.window
    .withProgress(
      {
        cancellable: true,
        location: vscode.ProgressLocation.Notification,
        title: `Compiling: ${docs.length == 1 ? docs[0].name : docs.length + " files"}`,
      },
      (progress, token: vscode.CancellationToken) =>
        api
          .asyncCompile(docNames, token, flags)
          .then((data) => {
            const info = docs.length > 1 ? "" : `${docs[0].name}: `;
            if (data.status && data.status.errors && data.status.errors.length) {
              throw new Error(`${info}Compile error`);
            } else if (!conf.get("suppressCompileMessages")) {
              vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
            }
            if (wsFolder) {
              // Make sure that we update the content for any
              // other documents affected by this compilation
              data.result.content.forEach((f) => {
                if (docNames.includes(f.name)) return;
                getUrisForDocument(f.name, wsFolder).forEach((u) => {
                  docs.push({
                    name: f.name,
                    uri: u,
                    uniqueId: `${wsFolder.name}:${f.name}`,
                    // These two keys aren't used by loadChanges()
                    workspaceFolder: wsFolder.name,
                    fileName: u.fsPath,
                  });
                });
              });
            }
            return docs;
          })
          .catch(() => {
            compileErrorMsg(conf);
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
  if (!file || filesystemSchemas.includes(file.uri.scheme) || !new AtelierAPI(file.uri).active) {
    // Not for server-side URIs or folders with inactive server connections
    return;
  }

  const defaultFlags = config().compileFlags;
  const flags = askFlags ? await compileFlags() : defaultFlags;
  return importFile(file)
    .catch((error) => {
      throw error;
    })
    .then(() => {
      if (compileFile) compile([file], flags);
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
  if (notIsfs(file.uri) && !config("conn").active) {
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
            vscode.window.showErrorMessage(
              `Compiling namespace '${api.ns}' failed. Check the 'ObjectScript' Output channel for details.`,
              "Dismiss"
            );
          }
        })
        .then(() => {
          // Always fetch server changes, even when compile failed or got cancelled
          const file = currentFile();
          return loadChanges([file]);
        })
  );
}

async function importFiles(files: vscode.Uri[], noCompile = false) {
  const toCompile: CurrentFile[] = [];
  const rateLimiter = new RateLimiter(50);
  await Promise.allSettled<void>(
    files.map((uri) =>
      rateLimiter.call(async () => {
        return vscode.workspace.fs
          .readFile(uri)
          .then((contentBytes) => {
            if (isText(uri.path.split("/").pop(), Buffer.from(contentBytes))) {
              const textFile = currentFileFromContent(uri, new TextDecoder().decode(contentBytes));
              toCompile.push(textFile);
              return textFile;
            } else {
              return currentFileFromContent(uri, Buffer.from(contentBytes));
            }
          })
          .then((curFile) =>
            importFile(curFile).then(() => outputChannel.appendLine("Imported file: " + curFile.fileName))
          );
      })
    )
  );

  if (!noCompile && toCompile.length > 0) {
    return compile(toCompile);
  }
  return;
}

export async function importFolder(uri: vscode.Uri, noCompile = false): Promise<any> {
  if (filesystemSchemas.includes(uri.scheme)) return; // Not for server-side URIs
  if ((await vscode.workspace.fs.stat(uri)).type != vscode.FileType.Directory) {
    return importFiles([uri], noCompile);
  }
  let globpattern = "*.{cls,inc,int,mac}";
  if (cspAppsForUri(uri).findIndex((cspApp) => uri.path.includes(cspApp + "/") || uri.path.endsWith(cspApp)) != -1) {
    // This folder is a CSP application, so import all files
    // We need to include eveything because CSP applications can
    // include non-InterSystems files
    globpattern = "*";
  }
  vscode.workspace
    .findFiles(new vscode.RelativePattern(uri, `**/${globpattern}`))
    .then((files) => importFiles(files, noCompile));
}

export async function compileExplorerItems(nodes: NodeBase[]): Promise<any> {
  const { workspaceFolderUri, namespace } = nodes[0];
  const conf = vscode.workspace.getConfiguration("objectscript", workspaceFolderUri);
  const api = new AtelierAPI(workspaceFolderUri);
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
        .asyncCompile(docs, token, conf.get<string>("compileFlags"))
        .then((data) => {
          const info = nodes.length > 1 ? "" : `${nodes[0].fullName}: `;
          if (data.status && data.status.errors && data.status.errors.length) {
            throw new Error(`${info}Compile error`);
          } else if (!conf.get("suppressCompileMessages")) {
            vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
          }
        })
        .catch(() => compileErrorMsg(conf))
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
    if (await isClassDeployed(name, api)) {
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
        handleError(error, `Failed to save file '${name}' on the server.`);
        return Promise.reject();
      }
    });
}

/** Prompt the user to compile documents after importing them */
async function promptForCompile(imported: string[], api: AtelierAPI, isIsfs: boolean): Promise<void> {
  // This cast is safe because the only two callers intialize api with a workspace folder URI
  const conf = vscode.workspace.getConfiguration("objectscript", <vscode.Uri>api.wsOrFile);
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
                .asyncCompile(imported, token, conf.get<string>("compileFlags"))
                .then((data) => {
                  const info = imported.length > 1 ? "" : `${imported[0]}: `;
                  if (data.status && data.status.errors && data.status.errors.length) {
                    throw new Error(`${info}Compile error`);
                  } else if (!conf.get("suppressCompileMessages")) {
                    vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
                  }
                })
                .catch(() => compileErrorMsg(conf))
                .finally(() => {
                  if (isIsfs) {
                    // Refresh the files explorer to show the new files
                    vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
                  }
                })
          );
        } else {
          if (isIsfs) {
            // Refresh the files explorer to show the new files
            vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
          }
          return Promise.resolve();
        }
      });
  } else {
    return Promise.resolve();
  }
}

/** Import files from the local file system into a server-namespace from an `isfs` workspace folder. */
export async function importLocalFilesToServerSideFolder(wsFolderUri: vscode.Uri): Promise<any> {
  if (
    !(
      wsFolderUri instanceof vscode.Uri &&
      wsFolderUri.scheme == FILESYSTEM_SCHEMA &&
      (vscode.workspace.workspaceFolders != undefined
        ? vscode.workspace.workspaceFolders.some((wsFolder) => wsFolder.uri.toString() == wsFolderUri.toString())
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
  // Get the default URI and remove the file anme
  let defaultUri = lastUsedLocalUri() ?? vscode.workspace.workspaceFile;
  defaultUri = defaultUri.with({ path: defaultUri.path.split("/").slice(0, -1).join("/") });
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
    defaultUri,
  });
  if (!Array.isArray(uris) || uris.length == 0) {
    // No files to import
    return;
  }
  // Filter out non-ISC files
  uris = uris.filter(isClassOrRtn);
  if (uris.length == 0) {
    vscode.window.showErrorMessage("No classes or routines were selected.", "Dismiss");
    return;
  }
  lastUsedLocalUri(uris[0]);
  // Get the name and content of the files to import
  const textDecoder = new TextDecoder();
  const docs = await Promise.allSettled<{ name: string; content: string; uri: vscode.Uri }>(
    uris.map((uri) =>
      vscode.workspace.fs
        .readFile(uri)
        .then((contentBytes) => textDecoder.decode(contentBytes))
        .then((content) => {
          // Determine the name of this file
          let docName = "";
          let ext = "";
          if (uri.path.split(".").pop().toLowerCase() == "cls") {
            // Allow Unicode letters
            const match = content.match(classNameRegex);
            if (match) {
              [, docName, ext = "cls"] = match;
            }
          } else {
            const match = content.match(routineNameTypeRegex);
            if (match) {
              [, docName, ext = "mac"] = match;
            } else {
              const basename = uri.path.split("/").pop();
              docName = basename.slice(0, basename.lastIndexOf("."));
              ext = basename.slice(basename.lastIndexOf(".") + 1);
            }
          }
          if (docName != "" && ext != "") {
            return {
              name: `${docName}.${ext.toLowerCase()}`,
              content,
              uri,
            };
          } else {
            return Promise.reject();
          }
        })
    )
  ).then((results) => results.map((result) => (result.status == "fulfilled" ? result.value : null)).filter(notNull));
  // The user is importing into a server-side folder, so fire source control hook
  await new StudioActions().fireImportUserAction(
    api,
    docs.map((e) => e.name)
  );
  // Import the files
  const rateLimiter = new RateLimiter(50);
  return Promise.allSettled<string>(
    docs.map((doc) =>
      rateLimiter.call(async () => {
        // Allow importing over deployed classes since the XML import
        // command and SMP, terminal, and Studio imports allow it
        return importFileFromContent(doc.name, doc.content, api, false, true).then(() => {
          outputChannel.appendLine("Imported file: " + doc.uri.path.split("/").pop());
          return doc.name;
        });
      })
    )
  ).then((results) =>
    promptForCompile(
      results.map((result) => (result.status == "fulfilled" ? result.value : null)).filter(notNull),
      api,
      true
    )
  );
}

interface XMLQuickPickItem extends vscode.QuickPickItem {
  file: string;
}

export async function importXMLFiles(): Promise<any> {
  try {
    // Use the server connection from a workspace folder
    const wsFolder = await getWsFolder(
      "Pick a workspace folder. Server-side folders import from the local file system.",
      false,
      false,
      false,
      true
    );
    if (!wsFolder) {
      if (wsFolder === undefined) {
        // Strict equality needed because undefined == null
        vscode.window.showErrorMessage(
          "'Import XML Files...' command requires a workspace folder with an active server connection.",
          "Dismiss"
        );
      }
      return;
    }
    const api = new AtelierAPI(wsFolder.uri);
    // Make sure the server has the xml endpoints
    if (api.config.apiVersion < 7) {
      vscode.window.showErrorMessage(
        "'Import XML Files...' command requires InterSystems IRIS version 2023.2 or above.",
        "Dismiss"
      );
      return;
    }
    let defaultUri = wsFolder.uri;
    if (defaultUri.scheme == FILESYSTEM_SCHEMA) {
      // Need a default URI without the isfs scheme or the open dialog
      // will show the server-side files instead of local ones
      defaultUri = lastUsedLocalUri() ?? vscode.workspace.workspaceFile;
      if (defaultUri.scheme != "file") {
        vscode.window.showErrorMessage(
          "'Import XML Files...' command is not supported for unsaved workspaces.",
          "Dismiss"
        );
        return;
      }
      // Remove the file name from the URI
      defaultUri = defaultUri.with({ path: defaultUri.path.split("/").slice(0, -1).join("/") });
    }
    // Prompt the user the file to import
    let uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      openLabel: "Import",
      filters: {
        "XML Files": ["xml"],
      },
      defaultUri,
    });
    if (!Array.isArray(uris) || uris.length == 0) {
      // No file to import
      return;
    }
    // Filter out non-XML files
    uris = uris.filter((uri) => uri.path.split(".").pop().toLowerCase() == "xml");
    if (uris.length == 0) {
      vscode.window.showErrorMessage("No XML files were selected.", "Dismiss");
      return;
    }
    lastUsedLocalUri(uris[0]);
    // Read the XML files
    const fileTimestamps: Map<string, string> = new Map();
    const filesToList = await Promise.allSettled(
      uris.map(async (uri) => {
        fileTimestamps.set(
          uri.fsPath,
          new Date((await vscode.workspace.fs.stat(uri)).mtime).toISOString().replace("T", " ").split(".")[0]
        );
        return {
          file: uri.fsPath,
          content: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)).split(/\r?\n/),
        };
      })
    ).then((results) => results.map((result) => (result.status == "fulfilled" ? result.value : null)).filter(notNull));
    if (filesToList.length == 0) {
      return;
    }
    // List the documents in the XML files
    const documentsPerFile = await api.actionXMLList(filesToList).then((data) => data.result.content);
    // Prompt the user to select documents to import
    const quickPickItems = documentsPerFile
      .filter((file) => {
        if (file.status != "") {
          outputChannel.appendLine(`Failed to list documents in file '${file.file}': ${file.status}`);
          return false;
        } else {
          return true;
        }
      })
      .flatMap((file) => {
        const items: XMLQuickPickItem[] = [];
        if (file.documents.length > 0) {
          // Add a separator for this file
          items.push({
            label: file.file,
            kind: vscode.QuickPickItemKind.Separator,
            file: file.file,
          });
          file.documents.forEach((doc) =>
            items.push({
              label: doc.name,
              picked: true,
              detail: `${
                doc.ts.toString() != "-1" ? `Server timestamp: ${doc.ts.split(".")[0]}` : "Does not exist on server"
              }, ${fileTimestamps.has(file.file) ? `File timestamp: ${fileTimestamps.get(file.file)}` : ""}`,
              file: file.file,
            })
          );
        }
        return items;
      });
    // Prompt the user for documents to import
    const docsToImport = await vscode.window.showQuickPick(quickPickItems, {
      canPickMany: true,
      ignoreFocusOut: true,
      title: `Select the documents to import into namespace '${api.ns}' on server '${api.serverId}'`,
    });
    if (docsToImport == undefined || docsToImport.length == 0) {
      return;
    }
    const isIsfs = filesystemSchemas.includes(wsFolder.uri.scheme);
    if (isIsfs) {
      // The user is importing into a server-side folder, so fire source control hook
      await new StudioActions().fireImportUserAction(api, [...new Set(docsToImport.map((qpi) => qpi.label))]);
    }
    // Import the selected documents
    const filesToLoad: { file: string; content: string[]; selected: string[] }[] = filesToList.map((f) => {
      return { selected: [], ...f };
    });
    docsToImport.forEach((qpi) =>
      // This is safe because every document came from a file
      filesToLoad[filesToLoad.findIndex((f) => f.file == qpi.file)].selected.push(qpi.label)
    );
    const importedPerFile = await api
      .actionXMLLoad(filesToLoad.filter((f) => f.selected.length > 0))
      .then((data) => data.result.content);
    const imported = importedPerFile.flatMap((file) => {
      if (file.status != "") {
        outputChannel.appendLine(`Importing documents from file '${file.file}' produced error: ${file.status}`);
      }
      return file.imported;
    });
    // Prompt the user for compilation
    promptForCompile([...new Set(imported)], api, isIsfs);
  } catch (error) {
    handleError(error, "Error executing 'Import XML Files...' command.");
  }
}
