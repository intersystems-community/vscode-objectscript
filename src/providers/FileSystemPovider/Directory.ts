import * as vscode from "vscode";

import { File } from "./File";
export class Directory implements vscode.FileStat {
  public type: vscode.FileType;
  public ctime: number;
  public mtime: number;
  public size: number;
  public entries: Map<string, File | Directory>;
  constructor(public name: string, public fullName: string) {
    this.type = vscode.FileType.Directory;
    this.ctime = Date.now();
    this.mtime = Date.now();
    this.size = 0;
    this.entries = new Map();
  }
}
