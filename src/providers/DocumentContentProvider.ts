import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as vscode from "vscode";
import { AtelierAPI } from "../api";

import { getFileName } from "../commands/export";
import { config, FILESYSTEM_SCHEMA, FILESYSTEM_READONLY_SCHEMA, OBJECTSCRIPT_FILE_SCHEMA } from "../extension";
import { currentWorkspaceFolder, workspaceFolderUri } from "../utils";

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  public static getAsFile(name: string, workspaceFolder: string): string {
    const { atelier, folder, addCategory } = config("export", workspaceFolder);

    const root = [workspaceFolderUri(workspaceFolder).fsPath, folder].join(path.sep);
    const fileName = getFileName(root, name, atelier, addCategory);
    if (fs.existsSync(fileName)) {
      return fs.realpathSync.native(fileName);
    }
  }

  public static getUri(name: string, workspaceFolder?: string, namespace?: string, vfs?: boolean): vscode.Uri {
    if (vfs === undefined) {
      vfs = config("serverSideEditing");
    }
    let scheme = vfs ? FILESYSTEM_SCHEMA : OBJECTSCRIPT_FILE_SCHEMA;
    workspaceFolder = workspaceFolder && workspaceFolder !== "" ? workspaceFolder : currentWorkspaceFolder();
    const isCsp = name.includes("/");
    const wFolderUri = workspaceFolderUri(workspaceFolder);
    let uri: vscode.Uri;
    if (wFolderUri.scheme === FILESYSTEM_SCHEMA || wFolderUri.scheme === FILESYSTEM_READONLY_SCHEMA) {
      const fileExt = name.split(".").pop();
      const fileName = name
        .split(".")
        .slice(0, -1)
        .join(fileExt.match(/cls/i) ? "/" : ".");
      name = fileName + "." + fileExt;
      uri = wFolderUri.with({
        path: `/${name}`,
      });
      vfs = true;
      scheme = wFolderUri.scheme;
    } else {
      const found = this.getAsFile(name, workspaceFolder);
      if (found) {
        return vscode.Uri.file(found);
      }
      const conn = config("conn", workspaceFolder);
      const { active } = conn;
      if (!active) {
        return null;
      }
      const fileExt = name.split(".").pop();
      const fileName = name
        .split(".")
        .slice(0, -1)
        .join(fileExt.match(/cls/i) ? "/" : ".");
      name = fileName + "." + fileExt;
      uri = vscode.Uri.file(name).with({
        scheme: scheme,
      });
      if (workspaceFolder && workspaceFolder !== "") {
        uri = uri.with({
          authority: workspaceFolder,
        });
      }
    }
    if (namespace && namespace !== "") {
      if (isCsp) {
        uri = uri.with({
          query: `ns=${namespace}&csp=1`,
        });
      } else {
        uri = uri.with({
          query: `ns=${namespace}`,
        });
      }
    }
    return uri;
  }
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    const fileName = uri.path.split("/").slice(1).join(".");
    const api = new AtelierAPI(uri);
    const query = url.parse(decodeURIComponent(uri.toString()), true).query;
    if (query) {
      if (query.ns && query.ns !== "") {
        const namespace = query.ns.toString();
        api.setNamespace(namespace);
      }
    }
    return api.getDoc(fileName).then((data) => {
      return data.result.content.join("\n");
    });
  }

  public update(uri: vscode.Uri, message?: string): void {
    this.onDidChangeEvent.fire(uri);
  }
}
