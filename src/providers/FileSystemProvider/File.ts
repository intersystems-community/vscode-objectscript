import * as vscode from "vscode";

export class File implements vscode.FileStat {
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
