import * as vscode from "vscode";
import {
  CurrentBinaryFile,
  CurrentTextFile,
  currentFile,
  currentFileFromContent,
  exportedUris,
  getServerDocName,
  isImportableLocalFile,
  notIsfs,
  openCustomEditors,
  outputChannel,
} from ".";
import { isText } from "istextorbinary";
import { AtelierAPI } from "../api";
import { compile, importFile } from "../commands/compile";

interface WSFolderIndex {
  /** The `FileSystemWatcher` for this workspace folder */
  watcher: vscode.FileSystemWatcher;
  /** Map of InterSystems classes and routines in this workspace to their `Uri`s */
  documents: Map<string, vscode.Uri[]>;
  /** Map of stringified `Uri`s to their InterSystems class/routine name */
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

/** Glob pattern that matches classes and routines */
const filePattern = "{**/*.cls,**/*.mac,**/*.int,**/*.inc}";

/** We want decoding errors to be thrown */
const textDecoder = new TextDecoder("utf-8", { fatal: true });

/** The number of milliseconds that we should wait before sending a compile or delete request */
const debounceDelay = 500;

/** Returns `true` if `uri` has a class or routine file extension */
function isClassOrRtn(uri: vscode.Uri): boolean {
  return ["cls", "mac", "int", "inc"].includes(uri.path.split(".").pop().toLowerCase());
}

/**
 * Create an object describing the file in `uri`. Will use the version
 * of the file in VS Code if it's loaded and supports binary files.
 */
async function getCurrentFile(
  uri: vscode.Uri,
  forceText = false
): Promise<CurrentTextFile | CurrentBinaryFile | undefined> {
  const uriString = uri.toString();
  const textDocument = vscode.workspace.textDocuments.find((d) => d.uri.toString() == uriString);
  if (textDocument) {
    return currentFile(textDocument);
  } else {
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
      // We should ignore such files rather than alerting the user.
      if (error instanceof vscode.FileSystemError) {
        outputChannel.appendLine(`Failed to read contents of '${uri.toString(true)}': ${error.toString()}`);
      }
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

    // Compile right away if this document is in the active text editor
    if (vscode.window.activeTextEditor?.document.uri.toString() == doc.uri.toString()) {
      compile([...docs]);
      docs.length = 0;
      return;
    }

    // Set a new timeout to call the function after the specified delay
    timeout = setTimeout(() => {
      compile([...docs]);
      docs.length = 0;
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
      api.deleteDocs([...docs]).then((data) => {
        let failed = 0;
        for (const doc of data.result) {
          if (doc.status != "") {
            // The document was not deleted, so log the error
            failed++;
            outputChannel.appendLine(`${failed == 1 ? "\n" : ""}${doc.status}`);
          }
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
      docs.length = 0;
    }, debounceDelay);
  };
}

/** Create index of `wsFolder` and set up a `FileSystemWatcher` to keep the index up to date */
export async function indexWorkspaceFolder(wsFolder: vscode.WorkspaceFolder): Promise<void> {
  if (!notIsfs(wsFolder.uri)) return;
  const documents: Map<string, vscode.Uri[]> = new Map();
  const uris: Map<string, string> = new Map();
  // Index classes and routines that currently exist
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(wsFolder, filePattern));
  for (const file of files) updateIndexForDocument(file, documents, uris);
  // Watch for all file changes
  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(wsFolder, "**/*"));
  const debouncedCompile = generateCompileFn();
  const debouncedDelete = generateDeleteFn(wsFolder.uri);
  const updateIndexAndSyncChanges = async (uri: vscode.Uri): Promise<void> => {
    const uriString = uri.toString();
    if (openCustomEditors.includes(uriString)) {
      // This class is open in a graphical editor, so its name will not change
      // and any updates to the class will be handled by that editor
      return;
    }
    const conf = vscode.workspace.getConfiguration("objectscript", uri);
    const sync: boolean = conf.get("syncLocalChanges");
    let change: WSFolderIndexChange = {};
    if (isClassOrRtn(uri)) {
      change = await updateIndexForDocument(uri, documents, uris);
    } else if (sync && isImportableLocalFile(uri)) {
      change.addedOrChanged = await getCurrentFile(uri);
    }
    if (!sync || (!change.addedOrChanged && !change.removed)) return;
    const exportedIdx = exportedUris.findIndex((e) => e == uriString);
    if (exportedIdx != -1) {
      // This creation/change event was fired due to a server
      // export, so don't re-sync the file with the server
      exportedUris.splice(exportedIdx, 1);
      return;
    }
    const api = new AtelierAPI(uri);
    if (!api.active) return;
    if (change.addedOrChanged) {
      // Create or update the document on the server
      importFile(change.addedOrChanged)
        .then(() => {
          if (conf.get("compileOnSave")) debouncedCompile(change.addedOrChanged);
        })
        .catch(() => {});
    }
    if (change.removed) {
      // Delete document on the server
      debouncedDelete(change.removed);
    }
  };
  watcher.onDidChange((uri) => updateIndexAndSyncChanges(uri));
  watcher.onDidCreate((uri) => updateIndexAndSyncChanges(uri));
  watcher.onDidDelete((uri) => {
    const sync: boolean = vscode.workspace.getConfiguration("objectscript", uri).get("syncLocalChanges");
    const api = new AtelierAPI(uri);
    if (isClassOrRtn(uri)) {
      // Remove the class/routine in the file from the index,
      // then delete it on the server if required
      const change = removeDocumentFromIndex(uri, documents, uris);
      if (sync && api.active && change.removed) {
        debouncedDelete(change.removed);
      }
    } else if (sync && api.active && isImportableLocalFile(uri)) {
      // Delete this web application file or Studio abstract document on the server
      const docName = getServerDocName(uri);
      if (!docName) return;
      debouncedDelete(docName);
    }
  });
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

/** Update the entries in the index for `uri` */
export async function updateIndexForDocument(
  uri: vscode.Uri,
  documents?: Map<string, vscode.Uri[]>,
  uris?: Map<string, string>
): Promise<WSFolderIndexChange> {
  const result: WSFolderIndexChange = {};
  const uriString = uri.toString();
  if (!documents) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!wsFolder) return result;
    const index = wsFolderIndex.get(wsFolder.uri.toString());
    if (!index) return result;
    documents = index.documents;
    uris = index.uris;
  }
  const documentName = uris.get(uriString);
  const file = await getCurrentFile(uri, true);
  if (!file) return result;
  result.addedOrChanged = file;
  // This file contains an InterSystems document, so add it to the index
  if (!documentName || (documentName && documentName != file.name)) {
    const documentUris = documents.get(file.name) ?? [];
    documentUris.push(uri);
    documents.set(file.name, documentUris);
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
  }
  return result;
}

/** Remove the entries in the index for `uri` */
function removeDocumentFromIndex(
  uri: vscode.Uri,
  documents?: Map<string, vscode.Uri[]>,
  uris?: Map<string, string>
): WSFolderIndexChange {
  const result: WSFolderIndexChange = {};
  const uriString = uri.toString();
  if (!documents) {
    const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!wsFolder) return result;
    const index = wsFolderIndex.get(wsFolder.uri.toString());
    if (!index) return result;
    documents = index.documents;
    uris = index.uris;
  }
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
