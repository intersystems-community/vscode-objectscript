import * as path from "path";
import * as vscode from "vscode";
import { isText } from "istextorbinary";
import { AtelierAPI } from "../../api";
import { fireOtherStudioAction, OtherStudioAction } from "../../commands/studio";
import { isfsConfig, projectContentsFromUri, studioOpenDialogFromURI } from "../../utils/FileProviderUtil";
import {
  classNameRegex,
  cspAppsForUri,
  isClassDeployed,
  notIsfs,
  notNull,
  outputChannel,
  handleError,
  redirectDotvscodeRoot,
  stringifyError,
  base64EncodeContent,
  openLowCodeEditors,
  compileErrorMsg,
} from "../../utils";
import { FILESYSTEM_READONLY_SCHEMA, FILESYSTEM_SCHEMA, intLangId, macLangId } from "../../extension";
import { addIsfsFileToProject, modifyProject } from "../../commands/project";
import { DocumentContentProvider } from "../DocumentContentProvider";
import { Document, UserAction } from "../../api/atelier";

class File implements vscode.FileStat {
  public type: vscode.FileType;
  public ctime: number;
  public mtime: number;
  public size: number;
  public permissions?: vscode.FilePermission;
  public fileName: string;
  public name: string;
  public data?: Uint8Array;
  public constructor(name: string, fileName: string, ts: string, size: number, data: string | Buffer) {
    this.type = vscode.FileType.File;
    this.ctime = Number(new Date(ts + "Z"));
    this.mtime = this.ctime;
    this.size = size;
    this.fileName = fileName;
    this.name = name;
    this.data = typeof data === "string" ? Buffer.from(data) : data;
  }
}

class Directory implements vscode.FileStat {
  public name: string;
  public fullName: string;
  public type: vscode.FileType;
  public ctime: number;
  public mtime: number;
  public size: number;
  public entries: Map<string, File | Directory>;
  public constructor(name: string, fullName: string) {
    this.name = name;
    this.fullName = fullName;
    this.type = vscode.FileType.Directory;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.entries = new Map();
  }
}

type Entry = File | Directory;

export function generateFileContent(
  uri: vscode.Uri,
  fileName: string,
  sourceContent: Uint8Array
): { content: string[]; enc: boolean } {
  const sourceLines = sourceContent.length ? new TextDecoder().decode(sourceContent).split("\n") : [];
  const fileExt = fileName.split(".").pop().toLowerCase();
  const csp = fileName.startsWith("/");
  if (fileExt === "cls" && !csp) {
    const className = fileName.split(".").slice(0, -1).join(".");
    let content: string[] = [];
    const preamble: string[] = [];

    if (sourceLines.length) {
      if (notIsfs(uri) && (fileName.includes(path.sep) || fileName.includes(" "))) {
        // We couldn't resolve a class name from the file path,
        // so keep the source text unchanged.
        content = sourceLines;
      } else {
        // Use all lines except for the Class x.y one.
        // Replace that with one to match fileName.
        while (sourceLines.length > 0) {
          const nextLine = sourceLines.shift();
          if (nextLine.toLowerCase().startsWith("class ")) {
            const classLine = nextLine.split(" ");
            classLine[0] = "Class";
            classLine[1] = className;
            content.push(...preamble, classLine.join(" "), ...sourceLines);
            break;
          }
          preamble.push(nextLine);
        }
        if (!content.length) {
          // Transfer sourceLines verbatim in cases where no class header line is found
          content.push(...preamble);
        }
      }
    } else {
      content = [`Class ${className} Extends %RegisteredObject`, "{", "}"];
    }

    return {
      content,
      enc: false,
    };
  } else if (["int", "inc", "mac"].includes(fileExt) && !csp) {
    if (sourceLines.length && notIsfs(uri) && (fileName.includes(path.sep) || fileName.includes(" "))) {
      // We couldn't resolve a routine name from the file path,
      // so keep the source text unchanged.
      return {
        content: sourceLines,
        enc: false,
      };
    } else {
      sourceLines.shift();
      const routineName = fileName.split(".").slice(0, -1).join(".");
      const routineType = fileExt != "mac" ? `[Type=${fileExt.toUpperCase()}]` : "";
      if (sourceLines.length === 0 && fileExt !== "inc") {
        const languageId = fileExt === "mac" ? macLangId : intLangId;

        // Labels cannot contain dots
        const firstLabel = routineName.replaceAll(".", "");

        // Be smart about whether to use a Tab or a space between label and comment.
        // Doing this will help autodetect to do the right thing.
        const lineStart = vscode.workspace.getConfiguration("editor", { languageId, uri }).get("insertSpaces")
          ? " "
          : "\t";
        sourceLines.push(`${firstLabel}${lineStart};`);
      }
      return {
        content: [`ROUTINE ${routineName} ${routineType}`, ...sourceLines],
        enc: false,
      };
    }
  }
  return {
    content: base64EncodeContent(Buffer.from(sourceContent)),
    enc: true,
  };
}

/**
 * This map contains all csp files contained in a directory
 * within a workspace folder that has a `project` query parameter.
 * The key is the URI for the folder. The value is an array of names of
 * csp files contained within the folder.
 * @example
 * cspFilesInProjectFolder.get(`isfs://iris:user/csp/user/?project=test`) = ["menu.csp"]
 */
const cspFilesInProjectFolder: Map<string, string[]> = new Map();

/** Returns `true` if `uri` is a web application file */
export function isCSP(uri: vscode.Uri): boolean {
  const { csp, project } = isfsConfig(uri);
  if (project) {
    // Projects can contain both CSP and non-CSP files
    // Read the cache of found CSP files to determine if this is one
    const parent = uri
      .with({
        path: path.dirname(uri.path),
      })
      .toString();
    if (cspFilesInProjectFolder.has(parent) && cspFilesInProjectFolder.get(parent).includes(path.basename(uri.path))) {
      return true;
    }
    // Read the parent directory and file is not CSP OR haven't read the parent directory yet
    // Use the file extension to guess if it's a web app file
    const additionalExts: string[] = vscode.workspace
      .getConfiguration("objectscript.projects", uri)
      .get("webAppFileExtensions");
    return [
      "csp",
      "csr",
      "ts",
      "js",
      "css",
      "scss",
      "sass",
      "less",
      "html",
      "json",
      "md",
      "markdown",
      "png",
      "svg",
      "jpeg",
      "jpg",
      "ico",
      "xml",
      "txt",
      ...additionalExts,
    ].includes(uri.path.split(".").pop().toLowerCase());
  }
  return csp;
}

/** Get the document name of the file in `uri`. */
export function isfsDocumentName(uri: vscode.Uri, csp?: boolean, pkg = false): string {
  if (csp == undefined) csp = isCSP(uri);
  const doc = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
  // Add the .PKG extension to non-web folders if called from StudioActions
  return pkg && !csp && !doc.split("/").pop().includes(".") ? `${doc}.PKG` : doc;
}

export class FileSystemProvider implements vscode.FileSystemProvider {
  private superRoot = new Directory("", "");

  public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle?: NodeJS.Timeout;

  public constructor() {
    this.onDidChangeFile = this._emitter.event;
  }

  // Used by import and compile to make sure we notice its changes
  public fireFileChanged(uri: vscode.Uri): void {
    this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
  }

  public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const api = new AtelierAPI(uri);
    if (!api.active) throw vscode.FileSystemError.Unavailable("Server connection is inactive");
    let entryPromise: Promise<Entry>;
    let result: Entry;
    const redirectedUri = redirectDotvscodeRoot(uri);
    if (redirectedUri.path !== uri.path) {
      // When redirecting the /.vscode subtree we must fill in as-yet-unvisited folders to fix https://github.com/intersystems-community/vscode-objectscript/issues/1143
      entryPromise = this._lookup(redirectedUri, true);
    } else {
      entryPromise = this._lookup(uri);
    }

    // If this is our readonly variant there's no point checking server-side whether the file sould be marked readonly
    if (uri.scheme === FILESYSTEM_READONLY_SCHEMA) {
      return entryPromise;
    }

    if (entryPromise instanceof File) {
      // previously resolved as a file
      result = entryPromise;
    } else if (entryPromise instanceof Promise && uri.path.split("/").pop()?.split(".").length > 1) {
      // apparently a file, so resolve ahead of adding permissions
      result = await entryPromise;
    } else {
      // otherwise return the promise
      return entryPromise;
    }

    if (result instanceof File) {
      const serverName = isfsDocumentName(uri);
      if (serverName.slice(-4).toLowerCase() == ".cls") {
        if (await isClassDeployed(serverName, api)) {
          result.permissions |= vscode.FilePermission.Readonly;
          return result;
        }
      }

      // Does server-side source control report it as editable?
      if (vscode.workspace.getConfiguration("objectscript.serverSourceControl", uri)?.get("respectEditableStatus")) {
        const query = "select * from %Atelier_v1_Utils.Extension_GetStatus(?)";
        const statusObj = await api.actionQuery(query, [serverName]);
        const docStatus = statusObj.result?.content?.pop();
        if (docStatus) {
          result.permissions = docStatus.editable ? undefined : result.permissions | vscode.FilePermission.Readonly;
        }
      }
    }
    return result;
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    if (uri.path.includes(".vscode/")) {
      throw vscode.FileSystemError.NoPermissions("Cannot read the /.vscode directory");
    }
    const parent = await this._lookupAsDirectory(uri);
    const api = new AtelierAPI(uri);
    if (!api.active) throw vscode.FileSystemError.Unavailable(uri);
    const { csp, project } = isfsConfig(uri);
    if (project) {
      // Get all items in the project
      return projectContentsFromUri(uri).then((entries) =>
        entries.map((entry) => {
          const csp = ["CSP", "DIR"].includes(entry.Type);
          if (!entry.Name.includes(".")) {
            if (!parent.entries.has(entry.Name)) {
              const folder = !csp
                ? uri.path.replace(/\/$/, "").replace(/\//g, ".")
                : uri.path === "/"
                  ? ""
                  : uri.path.endsWith("/")
                    ? uri.path
                    : uri.path + "/";
              const fullName = folder === "" ? entry.Name : csp ? folder + entry.Name : folder + "/" + entry.Name;
              parent.entries.set(entry.Name, new Directory(entry.Name, fullName));
            }
            return [entry.Name, vscode.FileType.Directory];
          } else {
            if (csp) {
              // Projects can contain both CSP and non-CSP files
              // Update the cache of found CSP files to include this file
              const mapkey = uri.toString();
              let mapvalue: string[] = [];
              if (cspFilesInProjectFolder.has(mapkey)) {
                mapvalue = cspFilesInProjectFolder.get(mapkey);
              }
              mapvalue.push(entry.Name);
              cspFilesInProjectFolder.set(mapkey, mapvalue);
            }
            return [entry.Name, vscode.FileType.File];
          }
        })
      );
    }
    const folder = !csp
      ? uri.path.replace(/\/$/, "").replace(/\//g, ".")
      : uri.path === "/"
        ? ""
        : uri.path.endsWith("/")
          ? uri.path
          : uri.path + "/";

    // Get all web apps that have a path (StudioOpenDialog returns all web apps)
    const cspApps = csp ? cspAppsForUri(uri) : [];
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
          .filter((item: { Name: string; Type: number }) =>
            item.Type == 10
              ? csp && !item.Name.includes("/") // ignore web apps here because there may be REST ones
              : item.Type == 9 // class package
                ? !csp
                : csp
                  ? item.Type == 5 // web app file
                  : true
          )
          .map((item: { Name: string; Type: number }) => {
            const name = item.Name;
            if (item.Type == 10 || item.Type == 9) {
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
          if (error.errorText.includes(" #5540:")) {
            const message = `User '${api.config.username}' cannot list ${
              csp ? `web application '${uri.path}'` : "namespace"
            } contents. If they do not have READ permission on the default code database of the ${api.config.ns.toUpperCase()} namespace then grant it and retry. If the problem remains then execute the following SQL in that namespace:\n\t GRANT EXECUTE ON %Library.RoutineMgr_StudioOpenDialog TO ${
              api.config.username
            }`;
            handleError(message);
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
    return this._lookup(uri, true).then((file: File) => file.data);
  }

  public writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: {
      create: boolean;
      overwrite: boolean;
    }
  ): void | Thenable<void> {
    uri = redirectDotvscodeRoot(uri);
    if (uri.path.startsWith("/.")) {
      throw vscode.FileSystemError.NoPermissions("dot-folders not supported by server");
    }
    const csp = isCSP(uri);
    const fileName = isfsDocumentName(uri, csp);
    if (fileName.startsWith(".")) {
      return;
    }
    const api = new AtelierAPI(uri);
    let created = false;
    // Use _lookup() instead of _lookupAsFile() so we send
    // our cached mtime with the GET /doc request if we have it
    return this._lookup(uri)
      .then(
        async (entry: File) => {
          // Check cases for which we should fail the write and leave the document dirty if changed
          if (!csp && fileName.split(".").pop().toLowerCase() == "cls") {
            // Check if the class name and file name match
            let clsname = "";
            const match = new TextDecoder().decode(content).match(classNameRegex);
            if (match) {
              [, clsname] = match;
            }
            if (clsname == "") {
              throw new Error("Cannot save a malformed class");
            }
            if (fileName.slice(0, -4) != clsname) {
              throw new Error("Cannot save an isfs class where the class name and file name do not match");
            }
            if (openLowCodeEditors.has(uri.toString())) {
              // This class is open in a low-code editor, so any
              // updates to the class will be handled by that editor
              return;
            }
            // Check if the class is deployed
            if (await isClassDeployed(fileName, api)) {
              throw new Error("Cannot overwrite a deployed class");
            }
          }
          const contentBuffer = Buffer.from(content);
          const putContent = isText(uri.path.split("/").pop(), contentBuffer)
            ? {
                content: new TextDecoder().decode(content).split(/\r?\n/),
                enc: false,
              }
            : {
                content: base64EncodeContent(contentBuffer),
                enc: true,
              };
          // By the time we get here VS Code's built-in conflict resolution mechanism will already have interacted with the user.
          // Therefore, it's safe to ignore any conflicts.
          return api
            .putDoc(
              fileName,
              {
                ...putContent,
                mtime: -1,
              },
              true
            )
            .then(() => entry)
            .catch((error) => {
              // Throw all failures
              throw vscode.FileSystemError.Unavailable(stringifyError(error) || uri);
            });
        },
        (error) => {
          if (error.code !== "FileNotFound" || !options.create) {
            return Promise.reject();
          }
          // File doesn't exist on the server, and we are allowed to create it.
          // Create content (typically a stub, unless the write-phase of a copy operation).
          const newContent = generateFileContent(uri, fileName, content);

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
              throw vscode.FileSystemError.Unavailable(stringifyError(error) || uri);
            })
            .then((data) => {
              // New file has been written
              if (data && data.result.ext && data.result.ext[0] && data.result.ext[1]) {
                fireOtherStudioAction(OtherStudioAction.CreatedNewDocument, uri, data.result.ext[0]);
                fireOtherStudioAction(OtherStudioAction.FirstTimeDocumentSave, uri, data.result.ext[1]);
              }
              const { project } = isfsConfig(uri);
              if (project) {
                // Add this document to the project if required
                addIsfsFileToProject(project, fileName, api);
              }
              // Create an entry in our cache for the document
              return this._lookupAsFile(uri).then((entry) => {
                created = true;
                this._fireSoon({ type: vscode.FileChangeType.Created, uri });
                return entry;
              });
            });
        }
      )
      .then((entry) => {
        // Compile the document if required
        if (
          !uri.path.includes("/_vscode/") &&
          vscode.workspace.getConfiguration("objectscript", uri).get("compileOnSave")
        ) {
          this.compile(uri, entry);
        } else if (!created) {
          this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
        }
      });
  }

  /** Process a Document object that was successfully deleted. */
  private async processDeletedDoc(doc: Document, uri: vscode.Uri, csp: boolean, project: boolean): Promise<void> {
    const events: vscode.FileChangeEvent[] = [];
    try {
      if (doc.ext) {
        fireOtherStudioAction(OtherStudioAction.DeletedDocument, uri, <UserAction>doc.ext);
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
      if (csp && project) {
        // Remove this file from our CSP files cache
        const parentUriStr = uri
          .with({
            path: path.dirname(uri.path),
          })
          .toString();
        const mapvalue = cspFilesInProjectFolder.get(parentUriStr);
        const idx = mapvalue.indexOf(path.basename(uri.path));
        if (idx != -1) {
          mapvalue.splice(idx, 1);
          if (mapvalue.length) {
            cspFilesInProjectFolder.set(parentUriStr, mapvalue);
          } else {
            cspFilesInProjectFolder.delete(parentUriStr);
          }
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
    uri = redirectDotvscodeRoot(uri);
    const { project } = isfsConfig(uri);
    const csp = isCSP(uri);
    const api = new AtelierAPI(uri);
    if (await this._lookup(uri, true).then((entry) => entry instanceof Directory)) {
      // Get the list of documents to delete
      let toDeletePromise: Promise<any>;
      if (project) {
        // Ignore the recursive flag for project folders
        toDeletePromise = projectContentsFromUri(uri, true);
      } else {
        toDeletePromise = studioOpenDialogFromURI(uri, options.recursive ? { flat: true } : undefined).then(
          (data) => data.result.content
        );
      }
      const toDelete: string[] = await toDeletePromise.then((data) =>
        data
          .map((entry) => {
            if (options.recursive || project) {
              return entry.Name;
            } else if (entry.Name.includes(".")) {
              const uriPath = uri.path.endsWith("/") ? uri.path : uri.path + "/";
              return (csp ? uriPath : uriPath.slice(1).replace(/\//g, ".")) + entry.Name;
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
            this.processDeletedDoc(
              doc,
              DocumentContentProvider.getUri(doc.name, undefined, undefined, true, uri),
              doc.name.includes("/"),
              project.length > 0
            );
          } else {
            // The document was not deleted, so log the error
            failed++;
            outputChannel.appendLine(`${failed == 1 ? "\n" : ""}${doc.status}`);
          }
        }
        if (project) {
          // Remove everything in this folder from the project if required
          modifyProject(uri, "remove");
        }
        if (failed > 0) {
          outputChannel.show(true);
          throw new vscode.FileSystemError(
            `Failed to delete ${failed} document${
              failed > 1 ? "s" : ""
            }. Check the 'ObjectScript' Output channel for details.`
          );
        }
      });
    } else {
      const fileName = isfsDocumentName(uri, csp);
      if (fileName.startsWith(".")) return;
      return api.deleteDoc(fileName).then(
        (response) => {
          this.processDeletedDoc(response.result, uri, csp, project.length > 0);
          if (project) {
            // Remove this document from the project if required
            modifyProject(uri, "remove");
          }
        },
        (error) => {
          handleError(error);
          throw new vscode.FileSystemError(
            `Failed to delete file '${fileName}'. Check the 'ObjectScript' Output channel for details.`
          );
        }
      );
    }
  }

  public async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): Promise<void> {
    if (!oldUri.path.split("/").pop().includes(".")) {
      throw vscode.FileSystemError.NoPermissions("Cannot rename a package/folder");
    }
    if (oldUri.path.split(".").pop().toLowerCase() != newUri.path.split(".").pop().toLowerCase()) {
      throw vscode.FileSystemError.NoPermissions("Cannot change a file's extension during rename");
    }
    if (vscode.workspace.getWorkspaceFolder(oldUri) != vscode.workspace.getWorkspaceFolder(newUri)) {
      throw vscode.FileSystemError.NoPermissions("Cannot rename a file across workspace folders");
    }
    // Check if the destination exists
    let newFileStat: vscode.FileStat;
    try {
      newFileStat = await vscode.workspace.fs.stat(newUri);
      if (!options.overwrite) {
        // If it does and we can't overwrite it, throw an error
        throw vscode.FileSystemError.FileExists(newUri);
      } else if (newFileStat.permissions & vscode.FilePermission.Readonly) {
        // If the file is read-only, throw an error
        // This can happen if the target class is deployed,
        // or the document is marked read-only by source control
        throw vscode.FileSystemError.NoPermissions(newUri);
      }
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code == "FileExists") {
        // Re-throw the FileExists error
        throw error;
      }
    }
    // Get the name of the new file
    const newFileName = isfsDocumentName(newUri);
    // Generate content for the new file
    const newContent = generateFileContent(newUri, newFileName, await vscode.workspace.fs.readFile(oldUri));
    if (newFileStat) {
      // We're overwriting an existing file so prompt the user to check it out
      await fireOtherStudioAction(OtherStudioAction.AttemptedEdit, newUri);
    }
    // Write the new file
    // This is going to attempt the write regardless of the user's response to the check out prompt
    const api = new AtelierAPI(newUri);
    await api
      .putDoc(
        newFileName,
        {
          ...newContent,
          mtime: Date.now(),
        },
        true
      )
      .catch((error) => {
        // Throw all failures
        throw vscode.FileSystemError.Unavailable(stringifyError(error) || newUri);
      })
      .then(async (response) => {
        // New file has been written
        if (!newFileStat && response && response.result.ext && response.result.ext[0]) {
          // We created a file
          fireOtherStudioAction(OtherStudioAction.CreatedNewDocument, newUri, response.result.ext[0]);
          fireOtherStudioAction(OtherStudioAction.FirstTimeDocumentSave, newUri, response.result.ext[1]);
          const { project } = isfsConfig(newUri);
          if (project) {
            // Add the new document to the project if required
            await addIsfsFileToProject(project, newFileName, api);
          }
        }
        // Sanity check that we find it there, then make client side update things
        this._lookupAsFile(newUri).then(() => {
          this._fireSoon({
            type: newFileStat ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
            uri: newUri,
          });
        });
      });
    // Delete the old file
    await vscode.workspace.fs.delete(oldUri);
  }

  /**
   * If `uri` is a file, compile it.
   * If `uri` is a directory, compile its contents.
   * `file` is passed if called from `writeFile()`.
   */
  public async compile(uri: vscode.Uri, file?: File): Promise<void> {
    if (!uri || uri.scheme != FILESYSTEM_SCHEMA) return;
    uri = redirectDotvscodeRoot(uri);
    const compileList: string[] = [];
    try {
      const entry = file || (await this._lookup(uri, true));
      if (!entry) return;
      if (entry instanceof Directory) {
        // Get the list of files to compile
        let compileListPromise: Promise<any>;
        if (isfsConfig(uri).project) {
          compileListPromise = projectContentsFromUri(uri, true);
        } else {
          compileListPromise = studioOpenDialogFromURI(uri, { flat: true }).then((data) => data.result.content);
        }
        compileList.push(...(await compileListPromise.then((data) => data.map((e) => e.Name))));
      } else {
        // Compile this file
        compileList.push(isCSP(uri) ? uri.path : uri.path.slice(1).replace(/\//g, "."));
      }
    } catch (error) {
      handleError(error, "Error determining documents to compile.");
      return;
    }
    if (!compileList.length) return;
    const api = new AtelierAPI(uri);
    const conf = vscode.workspace.getConfiguration("objectscript");
    const filesToUpdate: Set<string> = new Set(compileList);
    // Compile the files
    await vscode.window.withProgress(
      {
        cancellable: true,
        location: vscode.ProgressLocation.Notification,
        title: `Compiling: ${compileList.length == 1 ? compileList[0] : compileList.length + " files"}`,
      },
      (progress, token: vscode.CancellationToken) =>
        api
          .asyncCompile(compileList, token, conf.get("compileFlags"))
          .then((data) => {
            const info = compileList.length > 1 ? "" : `${compileList}: `;
            if (data.status && data.status.errors && data.status.errors.length) {
              throw new Error(`${info}Compile error`);
            } else if (!conf.get("suppressCompileMessages")) {
              vscode.window.showInformationMessage(`${info}Compilation succeeded.`, "Dismiss");
            }
            data.result.content.forEach((f) => filesToUpdate.add(f.name));
          })
          .catch(() => compileErrorMsg(conf))
    );
    // Fire file changed events for all files affected by compilation, including "other" files
    this._fireSoon(
      ...filesToUpdate.values().map((f) => {
        return {
          type: vscode.FileChangeType.Changed,
          uri: DocumentContentProvider.getUri(f, undefined, undefined, undefined, uri),
        };
      })
    );
    (
      await api
        .actionIndex(Array.from(filesToUpdate))
        .then((data) => data.result.content.flatMap((idx) => (!idx.status.length ? idx.others : [])))
        .catch(() => {
          // Index API returned an error. This should never happen.
          return [];
        })
    ).forEach(
      (f) =>
        !filesToUpdate.has(f) &&
        this._fireSoon({
          type: vscode.FileChangeType.Changed,
          uri: DocumentContentProvider.getUri(f, undefined, undefined, undefined, uri),
        })
    );
  }

  public watch(uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => {
      return;
    });
  }

  // Fetch entry (a file or directory) from cache, else from server
  private async _lookup(uri: vscode.Uri, fillInPath?: boolean): Promise<Entry> {
    const api = new AtelierAPI(uri);
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
    const csp = isCSP(uri);
    const name = path.basename(uri.path);
    const fileName = isfsDocumentName(uri, csp);
    const api = new AtelierAPI(uri);
    return api
      .getDoc(fileName, uri, cachedFile?.mtime)
      .then((data) => data.result)
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
        if (error?.statusCode == 304 && cachedFile) return cachedFile;
        const errArg = stringifyError(error) || uri;
        if (error?.statusCode == 404) throw vscode.FileSystemError.FileNotFound(errArg);
        throw vscode.FileSystemError.Unavailable(errArg);
      });
  }

  private async _lookupParentDirectory(uri: vscode.Uri): Promise<Directory> {
    uri = redirectDotvscodeRoot(uri);
    return this._lookupAsDirectory(uri.with({ path: path.posix.dirname(uri.path) }));
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
