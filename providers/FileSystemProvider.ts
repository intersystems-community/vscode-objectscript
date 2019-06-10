import * as vscode from 'vscode';
import { AtelierAPI } from '../api';
import * as path from 'path';

export class File implements vscode.FileStat {

  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  fileName: string;
  name: string;
  data?: Uint8Array;

  constructor(name: string, fileName: string, ts: string, size: number, data: string) {
    this.type = vscode.FileType.File;
    this.ctime = new Date(ts).getTime();
    this.mtime = new Date(ts).getTime();
    this.size = size;
    this.fileName = fileName;
    this.name = name;
    this.data = Buffer.from(data);
  }
}


export class Directory implements vscode.FileStat {

  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  name: string;
  entries: Map<string, File | Directory>;

  constructor(name: string) {
    this.type = vscode.FileType.Directory;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.name = name;
    this.entries = new Map();
  }
}

export type Entry = File | Directory;

export class FileSystemProvider implements vscode.FileSystemProvider {

  root = new Directory('');

  stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    return this._lookup(uri)
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    let api = new AtelierAPI(uri);
    let parent = await this._lookupAsDirectory(uri);
    let sql = `CALL %Library.RoutineMgr_StudioOpenDialog(?,,,,,,0)`
    let folder = uri.path === '/' ? '/' : uri.path.replace(/\//g, '.') + '/'
    let spec = folder.slice(1) + '*.cls,*.int';
    return api.actionQuery(sql, [spec])
      .then(data => data.result.content || [])
      .then(data => data.map(item => {
        let name = item.Name
        if (item.IsDirectory.length) {
          parent.entries.set(name, new Directory(name))
          return [name, vscode.FileType.Directory]
        } else {
          return [name, vscode.FileType.File]
        }
      }))
      .catch(error => {
        console.error(error)
      });
  }

  createDirectory(uri: vscode.Uri): void | Thenable<void> {
    let basename = path.posix.basename(uri.path);
    let dirname = uri.with({ path: path.posix.dirname(uri.path) });
    return this._lookupAsDirectory(dirname)
      .then(parent => {
        let entry = new Directory(basename);
        parent.entries.set(entry.name, entry);
        parent.mtime = Date.now();
        parent.size += 1;
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri: dirname }, { type: vscode.FileChangeType.Created, uri });
      });

  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    return this._lookupAsFile(uri)
      .then((file: File) => file.data)
  }

  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    let fileName = uri.path.slice(1).replace(/\//g, '.');
    if (fileName.startsWith('.')) {
      return
    }

    return this._lookupAsFile(uri)
      .then(entry => {
        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
      })
  }

  delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {

  }
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {

  }
  copy?(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {

  }

  private async _lookup(uri: vscode.Uri): Promise<Entry> {
    let parts = uri.path.split('/');
    let entry: Entry = this.root;
    for (const part of parts) {
      if (!part) {
        continue;
      }
      let child: Entry | undefined;
      if (entry instanceof Directory) {
        child = entry.entries.get(part);
      }
      if (!child) {
        return this._lookupAsFile(uri);
        // throw vscode.FileSystemError.FileNotFound(uri);
      }
      entry = child;
    }
    return entry;
  }

  private async _lookupAsDirectory(uri: vscode.Uri): Promise<Directory> {
    let entry = await this._lookup(uri);
    if (entry instanceof Directory) {
      return entry;
    }
    throw vscode.FileSystemError.FileNotADirectory(uri);
  }

  private async _lookupAsFile(uri: vscode.Uri): Promise<File> {
    // if (!uri.path.match(/\.\w+$/)) {
    //   return Promise.resolve(new Directory(uri.path))
    // }
    let fileName = uri.path.slice(1).replace(/\//g, '.');
    if (fileName.startsWith('.')) {
      throw vscode.FileSystemError.FileNotFound();
    }
    let name = path.basename(uri.path)
    const api = new AtelierAPI(uri);
    return api.getDoc(fileName).then(data => data.result)
      .then(({ ts, content }) =>
        new File(name, fileName, ts, content.join('\n').length, content.join('\n'))
      )
      .then(entry => this._lookupParentDirectory(uri)
        .then(parent => {
          parent.entries.set(name, entry);
          return entry;
        })
      )
      .catch(error => {
        throw vscode.FileSystemError.FileNotFound();
      });
  }

  private async _lookupParentDirectory(uri: vscode.Uri): Promise<Directory> {
    const dirname = uri.with({ path: path.posix.dirname(uri.path) });
    return await this._lookupAsDirectory(dirname);
  }

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private _bufferedEvents: vscode.FileChangeEvent[] = [];
  private _fireSoonHandle?: NodeJS.Timer;

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  watch(uri: vscode.Uri): vscode.Disposable {
    return new vscode.Disposable(() => { });
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
