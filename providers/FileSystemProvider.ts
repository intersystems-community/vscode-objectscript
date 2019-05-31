import * as vscode from 'vscode';
import { AtelierAPI } from '../api';
import * as url from 'url';

export class File implements vscode.FileStat {

  type: vscode.FileType;
  ctime: number;
  mtime: number;
  size: number;

  name: string;
  data?: Uint8Array;

  constructor(name: string, ts: string, size: number, data: string) {
    this.type = vscode.FileType.File;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = size;
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
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

  stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
    return this._lookup(uri, false)
  }
  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
    let result: [string, vscode.FileType][] = [];
    return result;
  }
  createDirectory(uri: vscode.Uri): void | Thenable<void> {

  }
  readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
    return this._lookup(uri, false).then((file: File) => file.data)
  }
  writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    this.watch(uri);
    return
  }
  delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {

  }
  rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {

  }
  copy?(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {

  }
  watch(uri: vscode.Uri): vscode.Disposable {
    this._emitter.fire([{
      type: vscode.FileChangeType.Changed,
      uri
    } as vscode.FileChangeEvent]);
    return new vscode.Disposable(() => { });
  }

  private _lookup<T>(uri: vscode.Uri, silent: false): Promise<T | Entry> {
    let fileName = uri.path.split('/')[1];
    const api = new AtelierAPI();
    let query = url.parse(decodeURIComponent(uri.toString()), true).query;
    if (query) {
      if (query.ns && query.ns !== '') {
        let namespace = query.ns.toString();
        api.setNamespace(namespace);
      }
    }
    api.setConnection(uri.authority);
    return api.getDoc(fileName).then(data => data.result)
      .then(({ name, ts, content }) =>
        new File(name, ts, content.join('\n').length, content.join('\n'))
      );
  }
}
