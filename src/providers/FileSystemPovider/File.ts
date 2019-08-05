import * as vscode from "vscode";

export class File implements vscode.FileStat {
  public type: vscode.FileType;
  public ctime: number;
  public mtime: number;
  public size: number;
  public fileName: string;
  public name: string;
  public data?: Uint8Array;
  public constructor(name: string, fileName: string, ts: string, size: number, data: string) {
    this.type = vscode.FileType.File;
    this.ctime = new Date(ts).getTime();
    this.mtime = new Date(ts).getTime();
    this.size = size;
    this.fileName = fileName;
    this.name = name;
    this.data = Buffer.from(data);
  }
}
