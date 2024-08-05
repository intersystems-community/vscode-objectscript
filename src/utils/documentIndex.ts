import * as vscode from "vscode";
import { CurrentBinaryFile, CurrentTextFile, currentFileFromContent, handleError, notIsfs, outputChannel } from ".";
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
  /** InterSystems document added to the index, if any */
  added?: CurrentTextFile | CurrentBinaryFile;
  /** InterSystems document removed from the index, if any */
  removed?: string;
}

/** Map of stringified workspace folder `Uri`s to collection of InterSystems classes and routines contained therein */
const wsFolderIndex: Map<string, WSFolderIndex> = new Map();

/** Glob pattern that matches files we want to index */
const filePattern = "{**/*.cls,**/*.mac,**/*.int,**/*.inc}";

/** We want decoding errors to be thrown */
const textDecoder = new TextDecoder("utf-8", { fatal: true });

/** Create index of `wsFolder` and set up a `FileSystemWatcher` to keep the index up to date */
export async function indexWorkspaceFolder(wsFolder: vscode.WorkspaceFolder): Promise<void> {
  if (!notIsfs(wsFolder.uri)) return;
  const pattern = new vscode.RelativePattern(wsFolder, filePattern);
  const documents: Map<string, vscode.Uri[]> = new Map();
  const uris: Map<string, string> = new Map();
  // Index files that currently exist
  const files = await vscode.workspace.findFiles(pattern);
  for (const file of files) updateIndexForDocument(file, documents, uris);
  // Watch for changes that may require an index update
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  watcher.onDidChange((uri) => updateIndexAndSyncChanges(uri, documents, uris));
  watcher.onDidCreate((uri) => updateIndexAndSyncChanges(uri, documents, uris));
  watcher.onDidDelete((uri) => {
    const change = removeDocumentFromIndex(uri, documents, uris);
    if (change.removed) {
      const api = new AtelierAPI(uri);
      if (!api.active) return;
      // Delete document on the server
      api.deleteDoc(change.removed).catch((error) => handleError(error));
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
  const textDocument = vscode.workspace.textDocuments.find((d) => d.uri.toString() == uriString);
  let content: string;
  if (textDocument) {
    // Get the content from the text document
    content = textDocument.getText();
  } else {
    // Get the content from the file system
    try {
      content = textDecoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch (error) {
      // Either a vscode.FileSystemError from readFile()
      // or a TypeError from decode(). Don't log TypeError
      // since the file may be a non-text file
      // with a cls, mac, int or inc extension.
      if (error instanceof vscode.FileSystemError) {
        outputChannel.appendLine(`Failed to get text contents of '${uri.toString(true)}': ${error.toString()}`);
      }
      return result;
    }
  }
  const file = currentFileFromContent(uri, content);
  if (!file) return result;
  // This file contains an InterSystems document, so add it to the index
  if (!documentName || (documentName && documentName != file.name)) {
    const documentUris = documents.get(file.name) ?? [];
    if (documentUris.length == 0) result.added = file;
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

/** Update the entries in the index for `uri` and sync any changes with the server */
async function updateIndexAndSyncChanges(
  uri: vscode.Uri,
  documents?: Map<string, vscode.Uri[]>,
  uris?: Map<string, string>
): Promise<void> {
  const change = await updateIndexForDocument(uri, documents, uris);
  if (!change.added && !change.removed) return;
  const api = new AtelierAPI(uri);
  if (!api.active) return;
  const config = vscode.workspace.getConfiguration("objectscript", uri);
  if (change.added && config.get("importOnSave")) {
    // Create the document on the server
    try {
      await importFile(change.added);
      if (config.get("compileOnSave")) await compile([change.added]);
    } catch (error) {
      handleError(error);
    }
  }
  if (change.removed) {
    try {
      // Delete document on the server
      await api.deleteDoc(change.removed);
    } catch (error) {
      handleError(error);
    }
  }
}

/** Get all `Uri`s for `document` in `wsFolder` */
export function getUrisForDocument(document: string, wsFolder: vscode.WorkspaceFolder): vscode.Uri[] {
  const index = wsFolderIndex.get(wsFolder.uri.toString());
  return index ? index.documents.get(document) ?? [] : [];
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
