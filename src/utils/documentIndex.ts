import * as vscode from "vscode";
import {
  CurrentBinaryFile,
  CurrentTextFile,
  RateLimiter,
  currentFileFromContent,
  exportedUris,
  isClassOrRtn,
  isImportableLocalFile,
  notIsfs,
  openLowCodeEditors,
  outputChannel,
  displayableUri,
  isCompilable,
  uriIsAncestorOf,
} from ".";
import { isText } from "istextorbinary";
import { AtelierAPI } from "../api";
import { compile, importFile } from "../commands/compile";
import { sendClientSideSyncTelemetryEvent } from "../extension";

interface WSFolderIndex {
  /** The `FileSystemWatcher` for this workspace folder */
  watcher: vscode.FileSystemWatcher;
  /** Map of document names (i.e., server-side names) to VS Code URIs */
  documents: Map<string, vscode.Uri[]>;
  /** Map of VS Code URIs to document names */
  uris: Map<string, string>;
}

interface WSFolderIndexChange {
  /** InterSystems document added to the index or changed on disk, if any */
  addedOrChanged?: CurrentTextFile | CurrentBinaryFile;
  /** InterSystems document removed from the index, if any */
  removed?: string;
}

/** Map of stringified workspace folder `Uri`s to collection of InterSystems classes and routines contained therein */
const wsFolderIndex: Map<string, WSFolderIndex> = new Map();

/** We want decoding errors to be thrown */
const textDecoder = new TextDecoder("utf-8", { fatal: true });

/** The number of milliseconds that we should wait before sending a compile or delete request */
const debounceDelay = 1000;

/**
 * Create an object describing the file in `uri`.
 * Supports binary files and will use `content` if it's defined.
 */
async function getCurrentFile(
  uri: vscode.Uri,
  forceText = false,
  content?: string[] | Buffer
): Promise<CurrentTextFile | CurrentBinaryFile | undefined> {
  if (content) {
    // forceText is always true when content is passed
    return currentFileFromContent(uri, Buffer.isBuffer(content) ? textDecoder.decode(content) : content.join("\n"));
  }
  try {
    const contentBytes = await vscode.workspace.fs.readFile(uri);
    const contentBuffer = Buffer.from(contentBytes);
    return currentFileFromContent(
      uri,
      forceText || isText(uri.path.split("/").pop(), contentBuffer) ? textDecoder.decode(contentBytes) : contentBuffer
    );
  } catch (error) {
    // Either a vscode.FileSystemError from readFile()
    // or a TypeError from decode(). Don't log TypeError
    // since the file may be a non-text file that has
    // an extension that we interpret as text (like cls or mac).
    // Don't log "FileNotFound" errors, which are probably
    // caused by concurrency issues, or "FileIsADirectory"
    // issues, since we don't care about directories.
    if (error instanceof vscode.FileSystemError && !["FileNotFound", "FileIsADirectory"].includes(error.code)) {
      outputChannel.appendLine(`Failed to read contents of '${displayableUri(uri)}': ${error.toString()}`);
    }
  }
}

/** Generate a debounced compile function */
function generateCompileFn(): (doc: CurrentTextFile | CurrentBinaryFile) => void {
  let timeout: NodeJS.Timeout;
  const docs: (CurrentTextFile | CurrentBinaryFile)[] = [];

  return (doc: CurrentTextFile | CurrentBinaryFile): void => {
    docs.push(doc);

    // Clear the previous timeout to reset the debounce timer
    clearTimeout(timeout);

    // Set a new timeout to call the function after the specified delay
    timeout = setTimeout(() => {
      const docsCopy = [...docs];
      docs.length = 0;
      compile(docsCopy);
    }, debounceDelay);
  };
}

/** Generate a debounced delete function. */
function generateDeleteFn(wsFolderUri: vscode.Uri): (doc: string) => void {
  let timeout: NodeJS.Timeout;
  const docs: string[] = [];
  const api = new AtelierAPI(wsFolderUri);

  return (doc: string): void => {
    docs.push(doc);

    // Clear the previous timeout to reset the debounce timer
    clearTimeout(timeout);

    // Set a new timeout to call the function after the specified delay
    timeout = setTimeout(() => {
      const docsCopy = [...docs];
      docs.length = 0;
      api.deleteDocs(docsCopy).then((data) => {
        let failed = 0;
        const ts = tsString();
        for (const doc of data.result) {
          failed += outputDelete(doc.name, doc.status, ts);
        }
        if (failed > 0) {
          outputChannel.show(true);
          vscode.window.showErrorMessage(
            `Failed to delete ${failed} document${
              failed > 1 ? "s" : ""
            }. Check the 'ObjectScript' Output channel for details.`,
            "Dismiss"
          );
        }
      });
    }, debounceDelay);
  };
}

/** The stringified URIs of all files that were touched by VS Code */
const touchedByVSCode: Set<string> = new Set();

/** Keep track that `uri` was touched by VS Code if it's in a client-side workspace folder */
export function storeTouchedByVSCode(uri: vscode.Uri): void {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (wsFolder && notIsfs(wsFolder.uri) && uri.scheme == wsFolder.uri.scheme) {
    touchedByVSCode.add(uri.toString());
  }
}

/** Create a timestamp string for use in a log entry */
function tsString(): string {
  const date = new Date();
  return `${date.toISOString().split("T").shift()} ${date.toLocaleTimeString(undefined, { hour12: false })}`;
}

/** Output a log entry */
function output(docName: string, msg: string, ts?: string): void {
  outputChannel.appendLine(`${ts ?? tsString()} [${docName}] ${msg}`);
}

/** Output a log entry for a successful import */
function outputImport(docName: string, uri: vscode.Uri): void {
  output(docName, `Imported from '${displayableUri(uri)}'`);
}

/**
 * Output a log entry for a successful or failed delete.
 * Does not output a log entry if the file did not exist on the server.
 * Returns `1` if the deleton failed, else `0`.
 */
function outputDelete(docName: string, status: string, ts: string): number {
  if (status == "") {
    output(docName, "Deleted", ts);
  } else if (!status.includes("#16005:")) {
    output(docName, `Deletion failed: ${status}`, ts);
    return 1;
  }
  return 0;
}

/** Create index of `wsFolder` and set up a `FileSystemWatcher` to keep the index up to date */
export async function indexWorkspaceFolder(wsFolder: vscode.WorkspaceFolder): Promise<void> {
  if (!notIsfs(wsFolder.uri)) return;
  const documents: WSFolderIndex["documents"] = new Map();
  const uris: WSFolderIndex["uris"] = new Map();
  // Limit the initial indexing to 250 files at once to avoid EMFILE errors
  const fsRateLimiter = new RateLimiter(250);
  // Limit FileSystemWatcher events that may produce a putDoc()
  // request to 50 concurrent calls to avoid hammering the server
  const restRateLimiter = new RateLimiter(50);
  // A cache of the last time each file was last changed
  const lastChangeMtimes: Map<string, number> = new Map();
  // Index classes and routines that currently exist
  vscode.workspace.findFiles(new vscode.RelativePattern(wsFolder, "{**/*}")).then((files) =>
    files.forEach((file) =>
      fsRateLimiter.call(() => {
        if (isClassOrRtn(file.path) || isImportableLocalFile(file)) {
          return updateIndexInternal(file, documents, uris, true);
        }
      })
    )
  );
  // Watch for all file changes
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(wsFolder, "**/*"));
  const debouncedCompile = generateCompileFn();
  const debouncedDelete = generateDeleteFn(wsFolder.uri);
  const notToSync = (uri: vscode.Uri) =>
    // We don't care about virtual files that might be
    // part of the workspace folder, like "git" files
    uri.scheme != wsFolder.uri.scheme ||
    // This file is not in this workspace folder. This can occur if there
    // are two workspace folders open where one is a subfolder of the other
    // and the file being changed is in the subfolder. This event will fire
    // for both watchers, but VS Code will correctly report that the file
    // is in the subfolder workspace folder, so the parent watcher can
    // safely ignore the event.
    vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() != wsFolder.uri.toString();
  async function updateIndexAndSyncChange(uri: vscode.Uri, created = false): Promise<void> {
    if (notToSync(uri)) {
      return;
    }
    if (!uri.path.split("/").pop().includes(".")) {
      // Ignore creation and change events for folders
      return;
    }
    const uriString = uri.toString();
    if (!created) {
      const stat = await vscode.workspace.fs.stat(uri).then(undefined, () => {});
      if (!stat) {
        // If we couldn't get the file's metadata then something is very wrong
        touchedByVSCode.delete(uriString);
        return;
      }
      const lastChangeMtime = lastChangeMtimes.get(uriString) ?? 0;
      lastChangeMtimes.set(uriString, stat.mtime);
      if (stat.mtime == lastChangeMtime) {
        // This file change event was triggered on the same version
        // of the file as the last event, so ignore this one
        touchedByVSCode.delete(uriString);
        return;
      }
    }
    if (openLowCodeEditors.has(uriString)) {
      // This class is open in a low-code editor, so its name will not change
      // and any updates to the class will be handled by that editor
      touchedByVSCode.delete(uriString);
      return;
    }
    if (exportedUris.has(uriString)) {
      // This creation/change event was fired due to a server
      // export, so don't re-sync the file with the server.
      // The index has already been updated.
      exportedUris.delete(uriString);
      touchedByVSCode.delete(uriString);
      return;
    }
    const api = new AtelierAPI(uri);
    const conf = vscode.workspace.getConfiguration("objectscript", wsFolder);
    const syncLocalChanges: string = conf.get("syncLocalChanges");
    const vscodeChange = touchedByVSCode.has(uriString);
    const sync = api.active && (syncLocalChanges == "all" || (syncLocalChanges == "vscodeOnly" && vscodeChange));
    touchedByVSCode.delete(uriString);
    const change = await updateIndexInternal(uri, documents, uris, sync);
    if (!sync || (!change.addedOrChanged && !change.removed)) return;
    if (change.addedOrChanged) {
      // Create or update the document on the server
      importFile(change.addedOrChanged)
        .then(() => {
          outputImport(change.addedOrChanged.name, uri);
          if (conf.get("compileOnSave") && isCompilable(change.addedOrChanged.name)) {
            // Compile right away if this document is in the active text editor.
            // This is needed to avoid noticeable latency when a user is editing
            // a client-side file, saves it, and the auto-compile kicks in.
            if (vscodeChange && vscode.window.activeTextEditor?.document.uri.toString() == uriString) {
              compile([change.addedOrChanged]);
            } else {
              debouncedCompile(change.addedOrChanged);
            }
          }
        })
        // importFile handles any server errors
        .catch(() => {});
    }
    if (change.removed) {
      // Delete document on the server
      debouncedDelete(change.removed);
    }
  }
  function updateIndexAndSyncDelete(uri: vscode.Uri): void {
    if (notToSync(uri)) {
      return;
    }
    const uriString = uri.toString();
    const api = new AtelierAPI(uri);
    const syncLocalChanges: string = vscode.workspace
      .getConfiguration("objectscript", wsFolder)
      .get("syncLocalChanges");
    const sync: boolean =
      api.active && (syncLocalChanges == "all" || (syncLocalChanges == "vscodeOnly" && touchedByVSCode.has(uriString)));
    for (const subUriString of uris.keys()) {
      touchedByVSCode.delete(subUriString);
      const subUri = vscode.Uri.parse(subUriString);
      if (!uriIsAncestorOf(uri, subUri)) {
        continue;
      }
      if (sync) {
        // Remove the class/routine, web application file, or Studio abstract document from the index,
        // then delete it on the server if required
        const change = removeDocumentFromIndex(subUri, documents, uris);
        if (change.removed) {
          debouncedDelete(change.removed);
        }
      }
    }
  }
  watcher.onDidChange((uri) => restRateLimiter.call(() => updateIndexAndSyncChange(uri)));
  watcher.onDidCreate((uri) => restRateLimiter.call(() => updateIndexAndSyncChange(uri, true)));
  watcher.onDidDelete(updateIndexAndSyncDelete);
  wsFolderIndex.set(wsFolder.uri.toString(), { watcher, documents, uris });
}

/** Remove the index of `wsFolder` */
export function removeIndexOfWorkspaceFolder(wsFolder: vscode.WorkspaceFolder): void {
  const key = wsFolder.uri.toString();
  const index = wsFolderIndex.get(key);
  if (!index) return;
  index.watcher.dispose();
  wsFolderIndex.delete(key);
}

/**
 * Update the entries in the index for `uri`. `content` will only be passed if this
 * function is called for a document that was just exported from the server.
 */
export async function updateIndex(uri: vscode.Uri, content?: string[] | Buffer): Promise<WSFolderIndexChange> {
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!wsFolder) return {};
  const index = wsFolderIndex.get(wsFolder.uri.toString());
  if (!index) return {};
  return updateIndexInternal(uri, index.documents, index.uris, true, content);
}

async function updateIndexInternal(
  uri: vscode.Uri,
  documents: WSFolderIndex["documents"],
  uris: WSFolderIndex["uris"],
  sync: boolean,
  content?: string[] | Buffer
): Promise<WSFolderIndexChange> {
  const result: WSFolderIndexChange = {};
  const uriString = uri.toString();
  const file = await getCurrentFile(uri, true, content);
  if (!file) return result;
  result.addedOrChanged = file;
  if (isImportableLocalFile(uri) && sync) {
    sendClientSideSyncTelemetryEvent(file.fileName.split(".").pop().toLowerCase());
  }
  const documentUris = documents.get(file.name) ?? [];
  if (documentUris.some((u) => u.toString() == uriString)) {
    // No need to update the index since this document is already present
    return result;
  }
  documentUris.push(uri);
  documents.set(file.name, documentUris);
  const documentName = uris.get(uriString);
  uris.set(uriString, file.name);
  if (documentName) {
    // Remove the outdated reference
    const oldDocumentUris = documents.get(documentName);
    if (!oldDocumentUris) return result;
    const idx = oldDocumentUris.findIndex((f) => f.toString() == uriString);
    if (idx == -1) return result;
    if (documentUris.length > 1) {
      documentUris.splice(idx, 1);
      documents.set(documentName, documentUris);
    } else {
      documents.delete(documentName);
      result.removed = documentName;
    }
  }
  return result;
}

/** Remove the entries in the index for `uri` */
function removeDocumentFromIndex(
  uri: vscode.Uri,
  documents: Map<string, vscode.Uri[]>,
  uris: Map<string, string>
): WSFolderIndexChange {
  const result: WSFolderIndexChange = {};
  const uriString = uri.toString();
  const documentName = uris.get(uriString);
  if (!documentName) return result;
  // Remove it from the index
  const documentUris = documents.get(documentName);
  if (!documentUris) return result;
  const idx = documentUris.findIndex((f) => f.toString() == uriString);
  if (idx == -1) return result;
  if (documentUris.length > 1) {
    documentUris.splice(idx, 1);
    documents.set(documentName, documentUris);
  } else {
    documents.delete(documentName);
    result.removed = documentName;
  }
  uris.delete(uriString);
  return result;
}

/** Get all `Uri`s for `document` in `wsFolder` */
export function getUrisForDocument(document: string, wsFolder: vscode.WorkspaceFolder): vscode.Uri[] {
  const index = wsFolderIndex.get(wsFolder.uri.toString());
  return index ? (index.documents.get(document) ?? []) : [];
}

/** Clean up all `FileSystemWatcher`s */
export function disposeDocumentIndex(): void {
  for (const index of wsFolderIndex.values()) index.watcher.dispose();
}

/** Get the names of all documents in `wsFolder` */
export function allDocumentsInWorkspace(wsFolder: vscode.WorkspaceFolder): string[] {
  const index = wsFolderIndex.get(wsFolder.uri.toString());
  return index ? Array.from(index.documents.keys()) : [];
}

/** Get the class/routine name of the document in `uri` */
export function getDocumentForUri(uri: vscode.Uri): string {
  return wsFolderIndex.get(vscode.workspace.getWorkspaceFolder(uri)?.uri.toString())?.uris.get(uri.toString());
}

/**
 * Use the known mappings between files and document names to infer
 * a name for a document contained in file `uri`. For example,
 * `uri` with path `/wsFolder/src/User/Test.cls` may return
 * `User.Test.cls`. Returns `undefined` if an inference couldn't
 * be made. Only attempts inferencing for classes or routines.
 * Does not attempt to read `uri`. This is useful for
 * generating stub content for a file that was just created.
 */
export function inferDocName(uri: vscode.Uri): string | undefined {
  const exts = [".cls", ".mac", ".int", ".inc"];
  const fileExt = uri.path.slice(-4).toLowerCase();
  if (!exts.includes(fileExt)) return;
  const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!wsFolder) return;
  const index = wsFolderIndex.get(wsFolder.uri.toString());
  if (!index || !index.uris.size) return;
  // Get a list of all unique paths containing classes or routines that
  // do not contribute to the name of the documents contained within
  const containingPaths: Set<string> = new Set();
  index.uris.forEach((docName, docUriStr) => {
    const docExt = docName.slice(-4);
    if (exts.includes(docExt)) {
      // This entry is for a class or routine so see if its name and file system path match
      const docNamePath = `/${docName.slice(0, -4).replaceAll(".", "/")}${docExt}`;
      // Make sure the file extension is lowercased in the path before matching
      let fullPath = vscode.Uri.parse(docUriStr).path;
      fullPath = fullPath.slice(0, -3) + fullPath.slice(-3).toLowerCase();
      if (fullPath.endsWith(docNamePath)) {
        // The document name is the trailing substring of the file system path with different delimiters
        containingPaths.add(fullPath.slice(0, -docNamePath.length + 1));
      }
    }
  });
  if (!containingPaths.size) return; // We couldn't learn anything from the documents in the index
  // Sort the values in the Set by number of segments descending so we check the deepest paths first
  const containingPathsSorted = Array.from(containingPaths).sort((a, b) => b.split("/").length - a.split("/").length);
  let result: string;
  for (const prefix of containingPathsSorted) {
    if (uri.path.startsWith(prefix)) {
      // We've identified the leading path segments that don't contribute to the document
      // name, so remove them from the target URI before generating the document name
      result = `${uri.path.slice(prefix.length, -4).replaceAll("/", ".")}${fileExt}`;
      break;
    }
  }
  return result;
}
