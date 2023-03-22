import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtelierAPI } from "../api";

import { getFileName, getFolderName } from "../commands/export";
import { config, FILESYSTEM_SCHEMA, FILESYSTEM_READONLY_SCHEMA, OBJECTSCRIPT_FILE_SCHEMA } from "../extension";
import { currentWorkspaceFolder, uriOfWorkspaceFolder } from "../utils";

export function compareConns(
  conn1: { ns: any; server: any; host: any; port: any },
  conn2: { ns: any; server: any; host: any; port: any }
): boolean {
  if (conn1.ns === conn2.ns) {
    if (conn1.server && conn2.server) {
      if (conn1.server === conn2.server) {
        return true;
      }
    } else if (!conn1.server && !conn2.server) {
      if (conn1.host === conn2.host && conn1.port === conn2.port) {
        return true;
      }
    }
  }
  return false;
}

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  public static getAsFile(name: string, workspaceFolder: string): string {
    const { atelier, folder, addCategory, map } = config("export", workspaceFolder);

    if (!workspaceFolder) {
      return;
    }
    const root = [uriOfWorkspaceFolder(workspaceFolder).fsPath, folder].join(path.sep);
    const fileName = getFileName(root, name, atelier, addCategory, map);
    if (fs.existsSync(fileName)) {
      return fs.realpathSync.native(fileName);
    }
  }

  public static getAsFolder(name: string, workspaceFolder: string, category?: string): string {
    const { atelier, folder, addCategory } = config("export", workspaceFolder);

    if (!workspaceFolder) {
      return;
    }
    const root = [uriOfWorkspaceFolder(workspaceFolder).fsPath, folder].join(path.sep);
    const folderName = getFolderName(root, name, atelier, addCategory ? category : null);
    if (fs.existsSync(folderName)) {
      return fs.realpathSync.native(folderName);
    }
  }

  public static getUri(
    name: string,
    workspaceFolder?: string,
    namespace?: string,
    vfs?: boolean,
    wFolderUri?: vscode.Uri,
    forceServerCopy = false
  ): vscode.Uri {
    if (vfs === undefined) {
      vfs = config("serverSideEditing");
    }
    let scheme = vfs ? FILESYSTEM_SCHEMA : OBJECTSCRIPT_FILE_SCHEMA;
    const isCsp = name.includes("/");

    // if wFolderUri was passed it takes precedence
    if (!wFolderUri) {
      workspaceFolder = workspaceFolder && workspaceFolder !== "" ? workspaceFolder : currentWorkspaceFolder();
      wFolderUri = uriOfWorkspaceFolder(workspaceFolder);
    }
    let uri: vscode.Uri;
    if (wFolderUri && (wFolderUri.scheme === FILESYSTEM_SCHEMA || wFolderUri.scheme === FILESYSTEM_READONLY_SCHEMA)) {
      // Avoid later adding a namespace=XXX queryparam when this is implied by the authority part of the workspace folder uri
      // otherwise stopping at a breakpoint would load a second copy of the file
      const authorityParts = wFolderUri.authority.split(":");
      if (authorityParts.length === 2 && namespace?.toLowerCase() === authorityParts[1]) {
        namespace = "";
      }
      const flat = new URLSearchParams(wFolderUri.query).get("flat") == "1";
      const fileExt = name.split(".").pop();
      const fileName = name
        .split(".")
        .slice(0, -1)
        .join(/cls|mac|int|inc/i.test(fileExt) && !flat ? "/" : ".");
      if (/.\.G?[1-9]\.int$/i.test(name) && !flat) {
        // This is a generated INT file
        name =
          fileName.slice(0, fileName.lastIndexOf("/")) +
          "." +
          fileName.slice(fileName.lastIndexOf("/") + 1) +
          "." +
          fileExt;
      } else {
        name = fileName + "." + fileExt;
      }
      uri = wFolderUri.with({
        path: !name.startsWith("/") ? `/${name}` : name,
      });
      vfs = true;
      scheme = wFolderUri.scheme;
      // If this is a class or routine, remove the CSP query param if it's present
      if (uri.query === "csp" && /cls|mac|int|inc/i.test(fileExt)) {
        uri = uri.with({
          query: "",
        });
      }
    } else {
      const conn = config("conn", workspaceFolder);
      if (!forceServerCopy) {
        // Look for the document in the local file system
        const localFile = this.getAsFile(name, workspaceFolder);
        if (localFile && (!namespace || namespace === conn.ns)) {
          // Exists as a local file and we aren't viewing a different namespace on the same server,
          // so return a file:// uri that will open the local file.
          return vscode.Uri.file(localFile);
        } else {
          // The local file doesn't exist in this folder, so check any other
          // local folders in this workspace if it's a multi-root workspace
          const wFolders = vscode.workspace.workspaceFolders;
          if (wFolders && wFolders.length > 1) {
            // This is a multi-root workspace
            for (const wFolder of wFolders) {
              if (wFolder.uri.scheme === "file" && wFolder.name !== workspaceFolder) {
                // This isn't the folder that we checked originally
                const wFolderConn = config("conn", wFolder.name);
                if (compareConns(conn, wFolderConn) && (!namespace || namespace === wFolderConn.ns)) {
                  // This folder is connected to the same server:ns combination as the original folder
                  const wFolderFile = this.getAsFile(name, wFolder.name);
                  if (wFolderFile) {
                    return vscode.Uri.file(wFolderFile);
                  }
                }
              }
            }
          }
        }
      }

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
    const params = new URLSearchParams(uri.query);
    // Don't modify the query params if project is present
    if (!params.has("project")) {
      if (namespace && namespace !== "") {
        if (isCsp) {
          if (params.has("csp")) {
            params.set("ns", namespace);
            uri = uri.with({
              query: params.toString(),
            });
          } else {
            uri = uri.with({
              query: `ns=${namespace}&csp=1`,
            });
          }
        } else {
          uri = uri.with({
            query: `ns=${namespace}`,
          });
        }
      } else if (isCsp && !params.has("csp")) {
        uri = uri.with({
          query: "csp=1",
        });
      }
    }
    return uri;
  }
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  public async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
    const api = new AtelierAPI(uri);
    const params = new URLSearchParams(uri.query);
    const fileName =
      params.has("csp") && ["", "1"].includes(params.get("csp"))
        ? uri.path.slice(1)
        : uri.path.split("/").slice(1).join(".");
    if (params.has("ns") && params.get("ns") != "") {
      api.setNamespace(params.get("ns"));
    }
    const data = await api.getDoc(fileName);
    if (Buffer.isBuffer(data.result.content)) {
      return "\nThis is a binary file.\n\nTo access its contents, export it to the local file system.";
    } else {
      return data.result.content.join("\n");
    }
  }

  public update(uri: vscode.Uri, message?: string): void {
    this.onDidChangeEvent.fire(uri);
  }
}
