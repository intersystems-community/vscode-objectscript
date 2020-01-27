import * as path from "path";
import * as vscode from "vscode";
import * as url from "url";
import { AtelierAPI } from "../../api";
import { Directory } from "./Directory";
import { File } from "./File";

export type Entry = File | Directory;

export class FileSystemProvider implements vscode.FileSystemProvider {
  public root = new Directory("", "");

  public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle?: NodeJS.Timer;

  public constructor() {
    this.onDidChangeFile = this._emitter.event;
  }

  public stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return this._lookup(uri);
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const api = new AtelierAPI(uri);
    const parent = await this._lookupAsDirectory(uri);
    const sql = `CALL %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)`;
    const { query } = url.parse(decodeURIComponent(uri.toString()), true);
    const type = query.type && query.type != "" ? query.type.toString() : "all";
    const csp = query.csp === "" || query.csp === "1";
    let filter = "";
    if (query.filter && query.filter.length) {
      filter = query.filter.toString();
    } else if (csp) {
      filter = "*";
    } else if (type === "rtn") {
      filter = "*.inc,*.mac,*.int";
    } else if (type === "cls") {
      filter = "*.cls";
    } else {
      filter = "*.cls,*.inc,*.mac,*.int";
    }
    const folder = csp ? (uri.path.endsWith("/") ? uri.path : uri.path + "/") : uri.path.replace(/\//g, ".");
    const spec = csp ? folder + filter : folder.length > 1 ? folder.slice(1) + "/" + filter : filter;
    const dir = "1";
    const orderBy = "1";
    const system = api.ns === "%SYS" ? "1" : "0";
    const flat = query.flat && query.flat.length ? query.flat.toString() : "0";
    const notStudio = "0";
    const generated = query.generated && query.generated.length ? query.generated.toString() : "0";
    return api
      .actionQuery(sql, [spec, dir, orderBy, system, flat, notStudio, generated])
      .then(data => data.result.content || [])
      .then(data =>
        data.map(item => {
          const name = item.Name;
          const fullName = folder === "" ? name : folder + "/" + name;
          if (item.Type === "10" || item.Type === "9") {
            parent.entries.set(name, new Directory(name, fullName));
            return [name, vscode.FileType.Directory];
          } else {
            return [name, vscode.FileType.File];
          }
        })
      )
      .catch(error => {
        console.error(error);
      });
  }

  public createDirectory(uri: vscode.Uri): void | Thenable<void> {
    const basename = path.posix.basename(uri.path);
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    return this._lookupAsDirectory(dirname).then(parent => {
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
    return this._lookupAsFile(uri).then((file: File) => file.data);
  }

  public writeFile(
    uri: vscode.Uri,
    content: Buffer,
    options: {
      create: boolean;
      overwrite: boolean;
    }
  ): void | Thenable<void> {
    const { query } = url.parse(decodeURIComponent(uri.toString()), true);
    const csp = query.csp === "" || query.csp === "1";
    const fileName = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
    if (fileName.startsWith(".")) {
      return;
    }
    const api = new AtelierAPI(uri);
    return api
      .actionIndex([fileName])
      .then(data => data.result.content[0])
      .then(info => {
        if (info.status === "") {
          /// file found, everything is Ok
          return;
        }
        if (options.create) {
          if (csp) {
            return api.putDoc(
              fileName,
              {
                content: [content.toString("base64")],
                enc: true,
              },
              false
            );
          }
          const fileExt = fileName
            .split(".")
            .pop()
            .toLowerCase();
          if (fileExt === "cls") {
            const className = fileName
              .split(".")
              .slice(0, -1)
              .join(".");
            return api.putDoc(
              fileName,
              {
                content: [`Class ${className} {}`],
                enc: false,
              },
              false
            );
          } else if (["int", "inc", "mac"].includes(fileExt)) {
            const api = new AtelierAPI(uri);
            const routineName = fileName
              .split(".")
              .slice(0, -1)
              .join(".");
            const routineType = `[ type = ${fileExt}]`;
            return api.putDoc(
              fileName,
              {
                content: [`ROUTINE ${routineName} ${routineType}`],
                enc: false,
              },
              false
            );
          }
          throw new Error("Not implemented");
        }
      })
      .then(() =>
        this._lookupAsFile(uri).then(entry => {
          this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
        })
      );
  }

  public delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
    const { query } = url.parse(decodeURIComponent(uri.toString()), true);
    const csp = query.csp === "" || query.csp === "1";
    const fileName = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
    if (fileName.startsWith(".")) {
      return;
    }
    const api = new AtelierAPI(uri);
    return api.deleteDoc(fileName).then(() => this._fireSoon({ type: vscode.FileChangeType.Deleted, uri }));
  }

  public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
    throw new Error("Not implemented");
    return;
  }
  public copy?(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
    throw new Error("Not implemented");
    return;
  }

  public watch(uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => {
      return;
    });
  }

  private async _lookup(uri: vscode.Uri): Promise<Entry> {
    const parts = uri.path.split("/");
    let entry: Entry = this.root;
    for (const part of parts) {
      if (!part) {
        continue;
      }
      let child: Entry | undefined;
      if (entry instanceof Directory) {
        child = entry.entries.get(part);
        if (!part.includes(".")) {
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
      }
      entry = child;
    }
    return entry;
  }

  private async _lookupAsDirectory(uri: vscode.Uri): Promise<Directory> {
    const entry = await this._lookup(uri);
    if (entry instanceof Directory) {
      return entry;
    }
    throw vscode.FileSystemError.FileNotADirectory(uri);
  }

  private async _lookupAsFile(uri: vscode.Uri): Promise<File> {
    const { query } = url.parse(decodeURIComponent(uri.toString()), true);
    const csp = query.csp === "" || query.csp === "1";
    const fileName = csp ? uri.path : uri.path.slice(1).replace(/\//g, ".");
    if (fileName.startsWith(".")) {
      throw vscode.FileSystemError.FileNotFound();
    }
    const name = path.basename(uri.path);
    const api = new AtelierAPI(uri);
    return api
      .getDoc(fileName)
      .then(data => data.result)
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
      .then(entry =>
        this._lookupParentDirectory(uri).then(parent => {
          parent.entries.set(name, entry);
          return entry;
        })
      )
      .catch(error => {
        throw vscode.FileSystemError.FileNotFound(uri);
      });
  }

  private async _lookupParentDirectory(uri: vscode.Uri): Promise<Directory> {
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
