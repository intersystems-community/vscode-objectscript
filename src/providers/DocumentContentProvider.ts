import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as vscode from "vscode";
import { AtelierAPI } from "../api";

import { getFileName } from "../commands/export";
import { config, FILESYSTEM_SCHEMA, OBJECTSCRIPT_FILE_SCHEMA } from "../extension";
import { currentWorkspaceFolder, workspaceFolderUri } from "../utils";

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  public static getAsFile(name: string, workspaceFolder: string) {
    const { atelier, folder, addCategory } = config("export", workspaceFolder);

    const root = [workspaceFolderUri(workspaceFolder).fsPath, folder].join(path.sep);
    const fileName = getFileName(root, name, atelier, addCategory);
    if (fs.existsSync(fileName)) {
      return fileName;
    }
  }

  public static getUri(name: string, workspaceFolder?: string, namespace?: string, vfs = true): vscode.Uri {
    workspaceFolder = workspaceFolder && workspaceFolder !== "" ? workspaceFolder : currentWorkspaceFolder();
    const found = this.getAsFile(name, workspaceFolder);
    if (found) {
      return vscode.Uri.file(found);
    }
    const fileName = name
      .split(".")
      .slice(0, -1)
      .join("/");
    const fileExt = name.split(".").pop();
    name = fileName + "." + fileExt;
    let uri = vscode.Uri.file(name).with({
      scheme: vfs ? FILESYSTEM_SCHEMA : OBJECTSCRIPT_FILE_SCHEMA,
    });
    if (workspaceFolder && workspaceFolder !== "") {
      uri = uri.with({
        authority: workspaceFolder,
      });
    }
    if (namespace && namespace !== "") {
      uri = uri.with({
        query: `ns=${namespace}`,
      });
    }
    return uri;
  }
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    const fileName = uri.path.split("/")[1];
    const api = new AtelierAPI();
    const query = url.parse(decodeURIComponent(uri.toString()), true).query;
    if (query) {
      if (query.ns && query.ns !== "") {
        const namespace = query.ns.toString();
        api.setNamespace(namespace);
      }
    }
    api.setConnection(uri.authority);
    return api.getDoc(fileName).then(data => {
      return data.result.content.join("\n");
    });
  }

  public update(uri: vscode.Uri, message?: string): void {
    this.onDidChangeEvent.fire(uri);
  }
}
