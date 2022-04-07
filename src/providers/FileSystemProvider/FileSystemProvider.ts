import * as path from "path";
import * as vscode from "vscode";
import * as url from "url";
import { AtelierAPI } from "../../api";
import { Directory } from "./Directory";
import { File } from "./File";
import { fireOtherStudioAction, OtherStudioAction } from "../../commands/studio";
import { StudioOpenDialog } from "../../queries";
import { studioOpenDialogFromURI } from "../../utils/FileProviderUtil";
import { notNull, outputChannel, redirectDotvscodeRoot, workspaceFolderOfUri } from "../../utils/index";
import { workspaceState } from "../../extension";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { Document } from "../../api/atelier";

declare function setTimeout(callback: (...args: any[]) => void, ms: number, ...args: any[]): NodeJS.Timeout;

export type Entry = File | Directory;

export function generateFileContent(fileName: string, sourceContent: Buffer): { content: string[]; enc: boolean } {
  const sourceLines = sourceContent.toString().split("\n");
  const fileExt = fileName.split(".").pop().toLowerCase();
  if (fileExt === "cls") {
    const className = fileName.split(".").slice(0, -1).join(".");
    const content: string[] = [];
    const preamble: string[] = [];

    // If content was provided (e.g. when copying a file), use all lines except for
    // the Class x.y one. Replace that with one to match fileName.
    while (sourceLines.length > 0) {
      const nextLine = sourceLines.shift();
      if (nextLine.startsWith("Class ")) {
        content.push(...preamble, `Class ${className}`, ...sourceLines);
        break;
      }
      preamble.push(nextLine);
    }
    if (content.length === 0) {
      content.push(`Class ${className}`, "{", "}");
    }
    return {
      content,
      enc: false,
    };
  } else if (["int", "inc", "mac"].includes(fileExt)) {
    sourceLines.shift();
    const routineName = fileName.split(".").slice(0, -1).join(".");
    const routineType = `[ type = ${fileExt}]`;
    return {
      content: [`ROUTINE ${routineName} ${routineType}`, ...sourceLines],
      enc: false,
    };
  }
  return {
    content: [sourceContent.toString("base64")],
    enc: true,
  };
}

export class FileSystemProvider implements vscode.FileSystemProvider {
  private superRoot = new Directory("", "");

  public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle?: NodeJS.Timer;

  public constructor() {
    this.onDidChangeFile = this._emitter.event;
  }

  // Used by import and compile to make sure we notice its changes
  public fireFileChanged(uri: vscode.Uri): void {
    // Remove entry from our cache
    this._lookupParentDirectory(uri).then((parent) => {
      const name = path.basename(uri.path);
      parent.entries.delete(name);
    });
    // Queue the event
    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  public stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return this._lookup(uri);
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    uri = redirectDotvscodeRoot(uri);
    const parent = await this._lookupAsDirectory(uri);
    const api = new AtelierAPI(uri);
    if (!api.active) {
      throw vscode.FileSystemError.Unavailable(`${uri.toString()} is unavailable`);
    }
    const { query } = url.parse(uri.toString(true), true);
    const csp = query.csp === "" || query.csp === "1";
    const folder = !csp
      ? uri.path.replace(/\//g, ".")
      : uri.path === "/"
      ? ""
      : uri.path.endsWith("/")
      ? uri.path
      : uri.path + "/";
    // get all web apps that have a filepath (Studio dialog used below returns REST ones too)
    const cspApps = csp ? await api.getCSPApps().then((data) => data.result.content || []) : [];
    const cspSubfolderMap = new Map<string, vscode.FileType>();
    const prefix = folder === "" ? "/" : folder;
    for (const app of cspApps) {
      if ((app + "/").startsWith(prefix)) {
        const subfolder = app.slice(prefix.length).split("/")[0];
        if (subfolder) {
          cspSubfolderMap.set(subfolder, vscode.FileType.Directory);
        }
      }
    }
    const cspSubfolders = Array.from(cspSubfolderMap.entries());
    return studioOpenDialogFromURI(uri)
      .then((data) => data.result.content || [])
      .then((data) => {
        const results = data
          .filter((item: StudioOpenDialog) =>
            item.Type === "10"
              ? csp && !item.Name.includes("/") // ignore web apps here because there may be REST ones
              : item.Type === "9" // class package
              ? !csp
              : csp
              ? item.Type === "5" // web app file
              : true
          )
          .map((item: StudioOpenDialog) => {
            const name = item.Name;
            if (item.Type === "10" || item.Type === "9") {
              if (!parent.entries.has(name)) {
                const fullName = folder === "" ? name : csp ? folder + name : folder + "/" + name;
                parent.entries.set(name, new Directory(name, fullName));
              }
              return [name, vscode.FileType.Directory];
            } else {
              return [name, vscode.FileType.File];
            }
          });
        if (!csp) {
          return results;
        }
        cspSubfolders.forEach((value) => {
          const name = value[0];
          if (!parent.entries.has(name)) {
            const fullName = folder + name;
            parent.entries.set(name, new Directory(name, fullName));
          }
          results.push(value);
        });
        return results;
      })
      .catch((error) => {
        if (error) {
          console.log(error);
          if (error.errorText.includes(" #5540:")) {
            const message = `User '${api.config.username}' cannot list ${
              csp ? "web application" : "namespace"
            } contents. To resolve this, execute the following SQL in the ${api.config.ns.toUpperCase()} namespace:\n\t GRANT EXECUTE ON %Library.RoutineMgr_StudioOpenDialog TO ${
              api.config.username
            }`;
            outputChannel.appendError(message);
          }
        }
      });
  }

  public createDirectory(uri: vscode.Uri): void | Thenable<void> {
    uri = redirectDotvscodeRoot(uri);
    const basename = path.posix.basename(uri.path);
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    return this._lookupAsDirectory(dirname).then((parent) => {
      const entry = new Directory(basename, uri.path);
      parent.entries.set(entry.name, entry);
      parent.mtime = Date.now();
      parent.size += 1;
      this._fireSoon(
        { type: vscode.FileChangeType.Changed, uri: dirname },
        { type: vscode.FileChangeType.Created, uri }
      );
    });
  }

  public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    // Use _lookup() instead of _lookupAsFile() so we send
    // our cached mtime with the GET /doc request if we have it
    return this._lookup(uri, true).then((file: File) => {
      // Update cache entry
      const uniqueId = `${workspaceFolderOfUri(uri)}:${file.fileName}`;
      workspaceState.update(`${uniqueId}:mtime`, file.mtime);
      return file.data;
    });
  }

  public writeFile(
    uri: vscode.Uri,
    content: Buffer,
    options: {
      create: boolean;
      overwrite: boolean;
    }
  ): void | Thenable<void> {
    uri = redirectDotvscodeRoot(uri);
    if (uri.path.startsWith("/.")) {
      throw vscode.FileSystemError.NoPermissions("dot-folders not supported by server");
    }
    const { query } = url.parse(uri.toString(true), true);
    const csp = query.csp === "" || query.csp === "1";
    const fileName = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
    if (fileName.startsWith(".")) {
      return;
    }
    const api = new AtelierAPI(uri);
    // Use _lookup() instead of _lookupAsFile() so we send
    // our cached mtime with the GET /doc request if we have it
    return this._lookup(uri).then(
      () => {
        // Weirdly, if the file exists on the server we don't actually write its content here.
        // Instead we simply return as though we wrote it successfully.
        // The actual writing is done by our workspace.onDidSaveTextDocument handler.
        // But first check cases for which we should fail the write and leave the document dirty if changed.
        if (!csp && fileName.split(".").pop().toLowerCase() === "cls") {
          // Check if the class is deployed
          api.actionIndex([fileName]).then((result) => {
            if (result.result.content[0].content.depl) {
              throw new Error("Cannot overwrite a deployed class");
            }
          });
          // Check if the class name and file name match
          let clsname = "";
          const match = content.toString().match(/^[ \t]*Class[ \t]+(%?[\p{L}\d]+(?:\.[\p{L}\d]+)+)/imu);
          if (match) {
            [, clsname] = match;
          }
          if (clsname === "") {
            throw new Error("Cannot save a malformed class");
          }
          if (fileName.slice(0, -4) !== clsname) {
            throw new Error("Cannot save an isfs class where the class name and file name do not match");
          }
        }
        // Set a -1 mtime cache entry so the actual write by the workspace.onDidSaveTextDocument handler always overwrites.
        // By the time we get here VS Code's built-in conflict resolution mechanism will already have interacted with the user.
        const uniqueId = `${workspaceFolderOfUri(uri)}:${fileName}`;
        workspaceState.update(`${uniqueId}:mtime`, -1);
        return;
      },
      (error) => {
        if (error.code !== "FileNotFound" || !options.create) {
          return Promise.reject();
        }
        // File doesn't exist on the server, and we are allowed to create it.
        // Create content (typically a stub).
        const newContent = generateFileContent(fileName, content);

        // Write it to the server
        return api
          .putDoc(
            fileName,
            {
              ...newContent,
              mtime: Date.now(),
            },
            false
          )
          .catch((error) => {
            // Throw all failures
            if (error.errorText && error.errorText !== "") {
              throw vscode.FileSystemError.Unavailable(error.errorText);
            }
            throw vscode.FileSystemError.Unavailable(error.message);
          })
          .then((response) => {
            // New file has been written
            if (response && response.result.ext && response.result.ext[0] && response.result.ext[1]) {
              fireOtherStudioAction(OtherStudioAction.CreatedNewDocument, uri, response.result.ext[0]);
              fireOtherStudioAction(OtherStudioAction.FirstTimeDocumentSave, uri, response.result.ext[1]);
            }
            // Sanity check that we find it there, then make client side update things
            this._lookupAsFile(uri).then(() => {
              this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
            });
          });
      }
    );
  }

  /** Process a Document object that was successfully deleted. */
  private async processDeletedDoc(doc: Document, uri: vscode.Uri, csp: boolean): Promise<void> {
    const events: vscode.FileChangeEvent[] = [];
    try {
      if (doc.ext) {
        fireOtherStudioAction(OtherStudioAction.DeletedDocument, uri, doc.ext);
      }
      // Remove entry from our cache, plus any now-empty ancestor entries
      let thisUri = vscode.Uri.parse(uri.toString(), true);
      while (thisUri.path !== "/") {
        events.push({ type: vscode.FileChangeType.Deleted, uri: thisUri });
        const parentDir = await this._lookupParentDirectory(thisUri);
        const name = path.basename(thisUri.path);
        parentDir.entries.delete(name);
        if (!csp && parentDir.entries.size === 0) {
          thisUri = thisUri.with({ path: path.posix.dirname(thisUri.path) });
        } else {
          break;
        }
      }
    } catch {
      // Swallow all errors
    } finally {
      if (events.length) {
        this._fireSoon(...events);
      }
    }
  }

  public async delete(uri: vscode.Uri, options: { recursive: boolean }): Promise<void> {
    const { query } = url.parse(uri.toString(true), true);
    const csp = query.csp === "" || query.csp === "1";
    const fileName = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
    const api = new AtelierAPI(uri);
    if (fileName.startsWith(".")) {
      return;
    }
    if (!fileName.includes(".")) {
      // Get the list of documents to delete
      const toDelete: string[] = await studioOpenDialogFromURI(
        uri,
        options.recursive ? { flat: true } : undefined
      ).then((data) =>
        data.result.content
          .map((entry) => {
            if (options.recursive) {
              return entry.Name;
            } else if (entry.Name.includes(".")) {
              return csp ? uri.path + entry.Name : uri.path.slice(1).replace(/\//g, ".") + entry.Name;
            }
            return null;
          })
          .filter(notNull)
      );
      if (toDelete.length == 0) {
        // Nothing to delete
        return;
      }
      // Delete the documents
      return api.deleteDocs(toDelete).then((data) => {
        let failed = 0;
        for (const doc of data.result) {
          if (doc.status == "") {
            this.processDeletedDoc(doc, DocumentContentProvider.getUri(doc.name, undefined, undefined, true, uri), csp);
          } else {
            // The document was not deleted, so log the error
            failed++;
            outputChannel.appendLine(`${failed == 1 ? "\n" : ""}${doc.status}`);
          }
        }
        if (failed > 0) {
          outputChannel.show(true);
          throw new vscode.FileSystemError(
            `Failed to delete ${failed} document${
              failed > 1 ? "s" : ""
            }. Check 'ObjectScript' Output channel for details.`
          );
        }
      });
    }
    return api.deleteDoc(fileName).then(
      (response) => {
        this.processDeletedDoc(response.result, uri, csp);
      },
      (error) => {
        let message = `Failed to delete file '${fileName}'.`;
        if (error && error.errorText && error.errorText !== "") {
          outputChannel.appendLine("\n" + error.errorText);
          outputChannel.show(true);
          message += " Check 'ObjectScript' Output channel for details.";
        }
        throw new vscode.FileSystemError(message);
      }
    );
  }

  public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
    throw new Error("Move / rename is not supported on server");
  }

  public watch(uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => {
      return;
    });
  }

  // Fetch entry (a file or directory) from cache, else from server
  private async _lookup(uri: vscode.Uri, fillInPath?: boolean): Promise<Entry> {
    const api = new AtelierAPI(uri);
    if (uri.path === "/") {
      await api
        .serverInfo()
        .then()
        .catch(() => {
          throw vscode.FileSystemError.Unavailable(`${uri.toString()} is unavailable`);
        });
    }
    const config = api.config;
    const rootName = `${config.username}@${config.host}:${config.port}${config.pathPrefix}/${config.ns.toUpperCase()}`;
    let entry: Entry = this.superRoot.entries.get(rootName);
    if (!entry) {
      entry = new Directory(rootName, "");
      this.superRoot.entries.set(rootName, entry);
    }
    const parts = uri.path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) {
        continue;
      }
      let child: Entry | undefined;
      if (entry instanceof Directory) {
        child = entry.entries.get(part);
        // If the last element of path is dotted and is one we haven't already cached as a directory
        // then it is assumed to be a file. Treat all other cases as a directory we haven't yet explored.
        if (!child && (!part.includes(".") || i + 1 < parts.length)) {
          if (!fillInPath) {
            throw vscode.FileSystemError.FileNotFound(uri);
          }
          // Caller granted us permission to create structures for intermediate directories not yet seen.
          // This arises when ObjectScript Explorer uses isfs to enable server-side editing, and when reloading a workspace
          // in which isfs documents were previously open.
          // See https://github.com/intersystems-community/vscode-objectscript/issues/879
          const fullName = entry.name === "" ? part : entry.fullName + "/" + part;
          child = new Directory(part, fullName);
          entry.entries.set(part, child);
        }
      }
      if (!child) {
        if (part.includes(".")) {
          return this._lookupAsFile(uri);
        } else {
          throw vscode.FileSystemError.FileNotFound(uri);
        }
      } else if (child instanceof File) {
        // Return cached copy unless changed, in which case return updated one
        return this._lookupAsFile(uri, child);
      } else {
        entry = child;
      }
    }
    return entry;
  }

  private async _lookupAsDirectory(uri: vscode.Uri): Promise<Directory> {
    // Reject attempt to access /node_modules
    if (uri.path.startsWith("/node_modules")) {
      throw vscode.FileSystemError.FileNotADirectory(uri);
    }
    const entry = await this._lookup(uri, true);
    if (entry instanceof Directory) {
      return entry;
    }
    throw vscode.FileSystemError.FileNotADirectory(uri);
  }

  // Fetch from server and cache it, optionally the passed cached copy if unchanged on server
  private async _lookupAsFile(uri: vscode.Uri, cachedFile?: File): Promise<File> {
    uri = redirectDotvscodeRoot(uri);
    if (uri.path.startsWith("/.")) {
      throw vscode.FileSystemError.NoPermissions("dot-folders not supported by server");
    }

    const { query } = url.parse(uri.toString(true), true);
    const csp = query.csp === "" || query.csp === "1";
    const fileName = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
    const name = path.basename(uri.path);
    const api = new AtelierAPI(uri);
    return api
      .getDoc(fileName, undefined, cachedFile?.mtime)
      .then((data) => data.result)
      .then((result) => {
        const fileSplit = fileName.split(".");
        const fileType = fileSplit[fileSplit.length - 1];
        if (!csp && ["bpl", "dtl"].includes(fileType)) {
          const partialUri = Array.isArray(result.content) ? result.content[0] : String(result.content).split("\n")[0];
          const strippedUri = partialUri.split("&STUDIO=")[0];
          const { https, host, port, pathPrefix } = api.config;
          result.content = [
            `${https ? "https" : "http"}://${host}:${port}${pathPrefix}${strippedUri}`,
            "Use the link above to launch the external editor in your web browser.",
            "Do not edit this document here. It cannot be saved to the server.",
          ];
        }
        return result;
      })
      .then(
        ({ ts, content }) =>
          new File(
            name,
            fileName,
            ts,
            Array.isArray(content) ? content.join("\n").length : content.length,
            Array.isArray(content) ? content.join("\n") : content
          )
      )
      .then((entry) =>
        this._lookupParentDirectory(uri).then((parent) => {
          // Store in parent directory's cache
          parent.entries.set(name, entry);
          return entry;
        })
      )
      .catch((error) => {
        if (error?.statusCode === 304 && cachedFile) {
          return cachedFile;
        }
        throw vscode.FileSystemError.FileNotFound(uri);
      });
  }

  private async _lookupParentDirectory(uri: vscode.Uri): Promise<Directory> {
    uri = redirectDotvscodeRoot(uri);
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    return await this._lookupAsDirectory(dirname);
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._bufferedEvents.push(...events);

    if (this._fireSoonHandle) {
      clearTimeout(this._fireSoonHandle);
    }

    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents);
      this._bufferedEvents = [];
    }, 5);
  }
}
