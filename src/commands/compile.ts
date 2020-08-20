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
  schemas,
} from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { currentFile, CurrentFile, outputChannel } from "../utils";
import { RootNode } from "../explorer/models/rootNode";
import { PackageNode } from "../explorer/models/packageNode";
import { ClassNode } from "../explorer/models/classNode";
import { RoutineNode } from "../explorer/models/routineNode";

async function compileFlags(): Promise<string> {
  const defaultFlags = config().compileFlags;
  return vscode.window.showInputBox({
    prompt: "Compilation flags",
    value: defaultFlags,
  });
}

export async function checkChangedOnServer(file: CurrentFile, force = false): Promise<number> {
  if (!file || !file.uri || schemas.includes(file.uri.scheme)) {
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
  const content = file.content.split(/\r?\n/);
  const mtime = await checkChangedOnServer(file);
  workspaceState.update(`${file.uniqueId}:mtime`, undefined);
  ignoreConflict = ignoreConflict || mtime < 0;
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
      checkChangedOnServer(file, true);
    })
    .catch((error) => {
      if (error.statusCode == 400) {
        outputChannel.appendLine(error.error.result.status);
        vscode.window.showErrorMessage(error.error.result.status);
        return Promise.reject();
      }
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
                    file.uri,
                    vscode.Uri.file(file.name).with({
                      scheme: OBJECTSCRIPT_FILE_SCHEMA,
                      authority: file.workspaceFolder,
                    }),
                    `Local • ${file.fileName} ↔ Server • ${file.name}`
                  )
                  .then(() => Promise.reject());
              case "Overwrite on Server":
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
      }
      vscode.window.showErrorMessage(error.message);
      return Promise.reject();
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
            outputChannel.appendLine(error.message);
            outputChannel.show(true);
            if (!config("suppressCompileErrorMessages")) {
              vscode.window.showErrorMessage(error.message, "Show details").then((data) => {
                outputChannel.show(true);
              });
            }
            // Even when compile failed we should still fetch server changes
            return docs;
          })
    )
    .then(loadChanges);
}

export async function importAndCompile(askFlags = false, document?: vscode.TextDocument): Promise<any> {
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
    .then(() => compile([file], flags));
}

// Compiles all files types in the namespace
export async function namespaceCompile(askFLags = false): Promise<any> {
  const api = new AtelierAPI();
  const fileTypes = ["*.CLS", "*.MAC", "*.INC", "*.BAS"];
  if (!config("conn").active) {
    throw new Error(`No Active Connection`);
  }
  const defaultFlags = config().compileFlags;
  const flags = askFLags ? await compileFlags() : defaultFlags;
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
      vscode.workspace
        .openTextDocument(file)
        .then(currentFile)
        .then((curFile) =>
          importFile(curFile).then((data) => {
            outputChannel.appendLine("Imported file: " + curFile.fileName);
            return curFile;
          })
        )
    )
  ).then(noCompile ? Promise.resolve : compile);
}

export async function importFolder(uri: vscode.Uri, noCompile = false): Promise<any> {
  const folder = uri.fsPath;
  if (fs.lstatSync(folder).isFile()) {
    return importFiles([folder], noCompile);
  }
  glob(
    "*.{cls,inc,mac,int}",
    {
      cwd: folder,
      matchBase: true,
      nocase: true,
    },
    (_error, files) =>
      importFiles(
        files.map((name) => path.join(folder, name)),
        noCompile
      )
  );
}

export async function compileExplorerItem(node: RootNode | PackageNode | ClassNode | RoutineNode): Promise<any> {
  const { workspaceFolder, namespace } = node;
  const flags = config().compileFlags;
  const api = new AtelierAPI(workspaceFolder);
  api.setNamespace(namespace);
  let docs = [node.fullName];
  if (node instanceof PackageNode) {
    switch (node.category) {
      case "RTN":
        docs = [node.fullName + ".*.mac"];
        break;
      case "CLS":
        docs = [node.fullName + ".*.cls"];
        break;
    }
  }
  return api.actionCompile(docs, flags);
}
