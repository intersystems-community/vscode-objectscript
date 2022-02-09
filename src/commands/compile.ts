import fs = require("fs");
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
  currentFile,
  CurrentFile,
  currentFileFromContent,
  currentWorkspaceFolder,
  outputChannel,
  throttleRequests,
  uriOfWorkspaceFolder,
} from "../utils";
import { PackageNode } from "../explorer/models/packageNode";
import { NodeBase } from "../explorer/models/nodeBase";

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
export async function checkChangedOnServer(file: CurrentFile, force = false): Promise<number> {
  if (!file || !file.uri) {
    return -1;
  }
  const api = new AtelierAPI(file.uri);
  const mtime =
    workspaceState.get(`${file.uniqueId}:mtime`, null) ||
    (await api
      .getDoc(file.name)
      .then((data) => data.result)
      .then(({ ts, content }) => {
        const fileContent = file.content.split(/\r?\n/);
        const serverTime = Number(new Date(ts + "Z"));
        const sameContent = force
          ? false
          : content.every((line, index) => line.trim() == (fileContent[index] || "").trim());
        const mtime =
          force || sameContent ? serverTime : Math.max(Number(fs.statSync(file.fileName).mtime), serverTime);
        return mtime;
      })
      .catch(() => -1));
  workspaceState.update(`${file.uniqueId}:mtime`, mtime > 0 ? mtime : undefined);
  return mtime;
}

async function importFile(file: CurrentFile, ignoreConflict?: boolean): Promise<any> {
  const api = new AtelierAPI(file.uri);
  if (file.name.split(".").pop().toLowerCase() === "cls") {
    const result = await api.actionIndex([file.name]);
    if (result.result.content[0].content.depl) {
      vscode.window.showErrorMessage("Cannot import over a deployed class");
      return Promise.reject();
    }
  }
  const content = file.content.split(/\r?\n/);
  const mtime = await checkChangedOnServer(file);
  ignoreConflict = ignoreConflict || mtime < 0 || (file.uri.scheme === "file" && config("overwriteServerChanges"));
  return api
    .putDoc(
      file.name,
      {
        content,
        enc: false,
        mtime,
      },
      ignoreConflict
    )
    .then(() => {
      // Clear cache entry
      workspaceState.update(`${file.uniqueId}:mtime`, undefined);
      // Create fresh cache entry
      checkChangedOnServer(file, true);
    })
    .catch((error) => {
      if (error.statusCode == 409) {
        return vscode.window
          .showErrorMessage(
            `Failed to import '${file.name}': The version of the file on the server is newer.
What do you want to do?`,
            "Compare",
            "Overwrite on Server",
            "Pull Server Changes",
            "Cancel"
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
                return importFile(file, true);
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
        if (error.errorText && error.errorText !== "") {
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
      console.log(`updateOthers: uri.path=${uri.path} baseUri.path=${baseUri.path} correctPath=${correctPath}`);
      fileSystemProvider.fireFileChanged(uri.with({ path: correctPath }));
    } else {
      documentContentProvider.update(uri);
    }
  });
}

export async function loadChanges(files: CurrentFile[]): Promise<any> {
  if (!files.length) {
    return;
  }
  const api = new AtelierAPI(files[0].uri);
  return Promise.all(
    files.map((file) =>
      api
        .getDoc(file.name)
        .then((data) => {
          const content = (data.result.content || []).join(file.eol === vscode.EndOfLine.LF ? "\n" : "\r\n");
          const mtime = Number(new Date(data.result.ts + "Z"));
          workspaceState.update(`${file.uniqueId}:mtime`, mtime > 0 ? mtime : undefined);
          if (file.uri.scheme === "file") {
            fs.writeFileSync(file.fileName, content);
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
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: `Compiling: ${docs.length === 1 ? docs.map((el) => el.name).join(", ") : docs.length + " files"}`,
      },
      () =>
        api
          .actionCompile(
            docs.map((el) => el.name),
            flags
          )
          .then((data) => {
            const info = docs.length > 1 ? "" : `${docs[0].name}: `;
            if (data.status && data.status.errors && data.status.errors.length) {
              throw new Error(`${info}Compile error`);
            } else if (!config("suppressCompileMessages")) {
              vscode.window.showInformationMessage(`${info}Compilation succeeded`, "Hide");
            }
            return docs;
          })
          .catch((error: Error) => {
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
            // Even when compile failed we should still fetch server changes
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
    `Compiling all files in namespace '${api.ns}' might be expensive. Are you sure you want to proceed?`,
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
      cancellable: false,
      location: vscode.ProgressLocation.Notification,
      title: `Compiling Namespace: ${api.ns}`,
    },
    async () => {
      const data = await api.actionCompile(fileTypes, flags);
      if (data.status && data.status.errors && data.status.errors.length) {
        // console.error(data.status.summary);
        throw new Error(`Compiling Namespace: ${api.ns} Error`);
      } else {
        vscode.window.showInformationMessage(`Compiling Namespace: ${api.ns} Success`);
      }
      const file = currentFile();
      return loadChanges([file]);
    }
  );
}

function importFiles(files, noCompile = false) {
  return Promise.all<CurrentFile>(
    files.map((file) =>
      throttleRequests(
        fs.promises
          .readFile(file, { encoding: "utf8" })
          .then((content) => currentFileFromContent(file, content))
          .then((curFile) =>
            importFile(curFile).then((data) => {
              outputChannel.appendLine("Imported file: " + curFile.fileName);
              return curFile;
            })
          )
      )
    )
  ).then(noCompile ? Promise.resolve : compile);
}

export async function importFolder(uri: vscode.Uri, noCompile = false): Promise<any> {
  const uripath = uri.fsPath;
  if (fs.lstatSync(uripath).isFile()) {
    return importFiles([uripath], noCompile);
  }
  let globpattern = "*.{cls,inc,int,mac}";
  const workspace = currentWorkspaceFolder();
  const workspacePath = uriOfWorkspaceFolder(workspace).fsPath;
  const folderPathNoWorkspaceArr = uripath.replace(workspacePath + path.sep, "").split(path.sep);
  if (folderPathNoWorkspaceArr.includes("csp")) {
    // This folder is a CSP application, so import all files
    // We need to include eveything becuase CSP applications can
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
    } else {
      docs.push(node.fullName);
    }
  }
  return api.actionCompile(docs, flags);
}
