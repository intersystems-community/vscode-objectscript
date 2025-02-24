import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { getFileName } from "../commands/export";
import { config, FILESYSTEM_SCHEMA, FILESYSTEM_READONLY_SCHEMA, OBJECTSCRIPT_FILE_SCHEMA } from "../extension";
import { currentWorkspaceFolder, isClassOrRtn, notIsfs, uriOfWorkspaceFolder } from "../utils";
import { getUrisForDocument } from "../utils/documentIndex";
import { isfsConfig, IsfsUriParam } from "../utils/FileProviderUtil";

export function compareConns(
  conn1: { ns: any; server: any; host: any; port: any; "docker-compose": any },
  conn2: { ns: any; server: any; host: any; port: any; "docker-compose": any }
): boolean {
  if (conn1.ns === conn2.ns) {
    // Same namespace name
    if (conn1.server && conn2.server) {
      // Both connections name an entry in intersystems.servers
      if (conn1.server === conn2.server) {
        return true;
      }
    } else if (!conn1.server && !conn2.server) {
      if (conn1.port && conn2.port) {
        // Both connections specify a target port
        if (conn1.host === conn2.host && conn1.port === conn2.port) {
          return true;
        }
      } else if (conn1["docker-compose"] && conn2["docker-compose"]) {
        // Both connections specify a docker-compose object
        if (conn1["docker-compose"].service === conn2["docker-compose"].service) {
          // Assume that if the service names match then the connection is to the same place.
          // This may not be true (e.g. if the same service name is used in folder-specific docker-compose files)
          // but it's the best we can do here without more information.
          return true;
        }
      }
    }
  }
  return false;
}

export class DocumentContentProvider implements vscode.TextDocumentContentProvider {
  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  /** Returns the `Uri` of `name` in `workspaceFolder` if it exists */
  private static findLocalUri(name: string, workspaceFolder: string): vscode.Uri {
    if (!workspaceFolder) return;
    const wsFolder = vscode.workspace.workspaceFolders.find((wf) => wf.name == workspaceFolder);
    if (!wsFolder) return;
    if (!notIsfs(wsFolder.uri)) return;
    const conf = vscode.workspace.getConfiguration("objectscript.export", wsFolder);
    const confFolder = conf.get("folder", "");
    if (isClassOrRtn(name)) {
      // Use the document index to find the local URI
      const uris = getUrisForDocument(name, wsFolder);
      switch (uris.length) {
        case 0:
          // Document doesn't exist in a file
          return;
        case 1:
          // Document exists in exactly one file
          return uris[0];
        default: {
          // Document exists in multiple files, so try to "break the tie" by
          // finding the URI that's "closest" to a point of reference
          let referenceUriParts: string[];
          if (
            vscode.window.activeTextEditor &&
            vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)?.uri.toString() ==
              wsFolder.uri.toString()
          ) {
            // Use the active editor's document for comparison
            const base = vscode.window.activeTextEditor.document.uri.path.slice(wsFolder.uri.path.length);
            referenceUriParts = base.split("/").slice(base.startsWith("/") ? 1 : 0, -1);
          } else {
            // Use the export settings for comparison
            const base = getFileName(confFolder, name, conf.get("atelier"), conf.get("addCategory"), conf.get("map"));
            referenceUriParts = base.split(path.sep).slice(base.startsWith(path.sep) ? 1 : 0, -1);
          }
          return uris.sort((a, b) => {
            const aParts = a.path.split("/").slice(0, -1);
            const bParts = b.path.split("/").slice(0, -1);
            let aSame = 0,
              bSame = 0,
              aDone = false,
              bDone = false;
            for (let i = 0; i < referenceUriParts.length; i++) {
              if (!aDone && aParts[i] != referenceUriParts[i]) aDone = true;
              if (!bDone && bParts[i] != referenceUriParts[i]) bDone = true;
              if (aDone && bDone) break;
              if (!aDone) aSame++;
              if (!bDone) bSame++;
            }
            if (aSame == bSame) {
              return aParts.slice(aSame).length - bParts.slice(bSame).length;
            } else {
              return bSame - aSame;
            }
          })[0];
        }
      }
    } else if (wsFolder.uri.scheme == "file") {
      // Fall back to our old mechanism which only works for "file" scheme
      const fileName = getFileName(
        wsFolder.uri.fsPath + (confFolder.length ? path.sep + confFolder : ""),
        name,
        conf.get("atelier"),
        conf.get("addCategory"),
        conf.get("map")
      );
      if (fs.existsSync(fileName)) return vscode.Uri.file(fileName);
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
    let scheme = vfs ? FILESYSTEM_SCHEMA : OBJECTSCRIPT_FILE_SCHEMA;
    const isCsp = name.includes("/");

    // if wFolderUri was passed it takes precedence
    if (!wFolderUri) {
      workspaceFolder = workspaceFolder && workspaceFolder !== "" ? workspaceFolder : currentWorkspaceFolder();
      wFolderUri = uriOfWorkspaceFolder(workspaceFolder);
    } else if (!workspaceFolder) {
      // Make sure workspaceFolder is set correctly if only wFolderUri was passed
      workspaceFolder = vscode.workspace.workspaceFolders.find(
        (wf) => wf.uri.toString() == wFolderUri.toString()
      )?.name;
    }
    let uri: vscode.Uri;
    if (wFolderUri && (wFolderUri.scheme === FILESYSTEM_SCHEMA || wFolderUri.scheme === FILESYSTEM_READONLY_SCHEMA)) {
      // Avoid later adding a namespace=XXX queryparam when this is implied by the authority part of the workspace folder uri
      // otherwise stopping at a breakpoint would load a second copy of the file
      const authorityParts = wFolderUri.authority.split(":");
      if (authorityParts.length === 2 && namespace?.toLowerCase() === authorityParts[1]) {
        namespace = "";
      }
      const params = new URLSearchParams(wFolderUri.query);
      const cspParam = params.has(IsfsUriParam.CSP) && ["", "1"].includes(params.get(IsfsUriParam.CSP));
      const lastDot = name.lastIndexOf(".");
      let uriPath = isCsp ? name : name.slice(0, lastDot).replace(/\./g, "/") + "." + name.slice(lastDot + 1);
      if (!isCsp && /.\.G?[1-9]\.int$/i.test(name)) {
        // This is a generated INT file
        const lastSlash = uriPath.lastIndexOf("/");
        uriPath = uriPath.slice(0, lastSlash) + "." + uriPath.slice(lastSlash + 1);
      }
      uri = wFolderUri.with({
        path: !uriPath.startsWith("/") ? `/${uriPath}` : uriPath,
      });
      vfs = true;
      scheme = wFolderUri.scheme;
      // If this is not a CSP file, remove the CSP query param if it's present
      if (cspParam && !isCsp) {
        params.delete(IsfsUriParam.CSP);
        uri = uri.with({
          query: params.toString(),
        });
      }
    } else {
      const conn = config("conn", workspaceFolder);
      if (!forceServerCopy) {
        // Look for the document in the local file system
        const localFile = this.findLocalUri(name, workspaceFolder);
        if (localFile && (!namespace || namespace === conn.ns)) {
          // Exists as a local file and we aren't viewing a different namespace on the same server,
          // so return a uri that will open the local file.
          return localFile;
        } else {
          // The local file doesn't exist in this folder, so check any other
          // local folders in this workspace if it's a multi-root workspace
          const wFolders = vscode.workspace.workspaceFolders;
          if (wFolders && wFolders.length > 1) {
            // This is a multi-root workspace
            for (const wFolder of wFolders) {
              if (notIsfs(wFolder.uri) && wFolder.name != workspaceFolder) {
                // This isn't the folder that we checked originally
                const wFolderConn = config("conn", wFolder.name);
                if (compareConns(conn, wFolderConn) && (!namespace || namespace === wFolderConn.ns)) {
                  // This folder is connected to the same server:ns combination as the original folder
                  const wFolderFile = this.findLocalUri(name, wFolder.name);
                  if (wFolderFile) return wFolderFile;
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
    if (!params.has(IsfsUriParam.Project)) {
      if (namespace && namespace !== "") {
        if (isCsp) {
          if (params.has(IsfsUriParam.CSP)) {
            params.set(IsfsUriParam.NS, namespace);
            uri = uri.with({
              query: params.toString(),
            });
          } else {
            uri = uri.with({
              query: `${IsfsUriParam.NS}=${namespace}&${IsfsUriParam.CSP}=1`,
            });
          }
        } else {
          uri = uri.with({
            query: `${IsfsUriParam.NS}=${namespace}`,
          });
        }
      } else if (isCsp && !params.has(IsfsUriParam.CSP)) {
        uri = uri.with({
          query: `${IsfsUriParam.CSP}=1`,
        });
      }
    }
    return uri;
  }
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  public async provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): Promise<string> {
    const api = new AtelierAPI(uri);
    // Even though this is technically an "objectscript" Uri, the query parameters are the same as "isfs"
    const { csp, ns } = isfsConfig(uri);
    const fileName = csp ? uri.path.slice(1) : uri.path.split("/").slice(1).join(".");
    if (ns) api.setNamespace(ns);
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
