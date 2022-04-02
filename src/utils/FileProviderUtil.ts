import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { ProjectItem } from "../commands/project";

export async function projectContentsFromUri(uri: vscode.Uri, overrideFlat?: boolean): Promise<ProjectItem[]> {
  const api = new AtelierAPI(uri);
  if (!api.active) {
    return;
  }
  const params = new URLSearchParams(uri.query);
  const flat = overrideFlat ?? false;
  let folder = !uri.path.endsWith("/") ? uri.path + "/" : uri.path;
  folder = folder.startsWith("/") ? folder.slice(1) : folder;
  if (folder == "/") {
    // Treat this the same as an empty folder
    folder = "";
  }
  const project = params.get("project");
  let query: string;
  let parameters: string[];
  if (flat) {
    // Only used by the FileSearchProvider
    const l = String(folder.length + 1); // Need the + 1 because SUBSTR is 1 indexed
    query =
      "SELECT CASE " +
      "WHEN Type = 'CLS' THEN SUBSTR(Name,?)||'.cls' " +
      "ELSE SUBSTR(Name,?) END Name, Type FROM %Studio.Project_ProjectItemsList(?) " +
      "WHERE (Name %STARTSWITH ? OR Name %STARTSWITH ?) AND (" +
      "((Type = 'MAC' OR Type = 'OTH' OR Type = 'CSP') AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name,1,1,1,1,0,1))) OR " +
      "(Type = 'CLS' AND (Package IS NOT NULL OR (Package IS NULL AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name||'.cls',1,1,1,1,0,1)))))) " +
      "UNION " +
      "SELECT SUBSTR(sod.Name,?+1) AS Name, pil.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,1,1,0,1) AS sod " +
      "JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON " +
      "pil.Type = 'DIR' AND SUBSTR(sod.Name,2) %STARTSWITH ? AND SUBSTR(sod.Name,2) %STARTSWITH pil.Name||'/'";
    parameters = [l, l, project, folder.replace(/\//g, "."), folder, l, folder + "*.cspall", project, folder];
  } else {
    if (folder.length) {
      const l = String(folder.length + 1); // Need the + 1 because SUBSTR is 1 indexed
      query =
        "SELECT sod.Name, pil.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,1,0,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?) AS pil ON " +
        "((pil.Type = 'MAC' OR pil.Type = 'OTH') AND ?||sod.Name = pil.Name) OR (pil.Type = 'CLS' AND ?||sod.Name = pil.Name||'.cls') " +
        "WHERE pil.Type = 'MAC' OR pil.Type = 'OTH' OR pil.Type = 'CLS' UNION SELECT sod.Name, pil.Type FROM " +
        "%Library.RoutineMgr_StudioOpenDialog(?,1,1,1,0,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON " +
        "(pil.Type = 'DIR' AND ?||sod.Name %STARTSWITH pil.Name||'/') OR (pil.Type = 'CSP' AND ?||sod.Name = pil.Name) " +
        "UNION SELECT $PIECE(SUBSTR(Name,?),'/') AS Name, Type FROM %Studio.Project_ProjectItemsList(?,1) WHERE Type = 'DIR' " +
        "AND $LENGTH($PIECE(SUBSTR(Name,?),'/')) > 0 AND Name %STARTSWITH ? AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name||'/*.cspall',1,1,1,1,0,1))";
      parameters = [
        folder.replace(/\//g, ".").slice(0, -1) + "/*",
        project,
        folder.replace(/\//g, "."),
        folder.replace(/\//g, "."),
        folder + "*",
        project,
        folder,
        folder,
        l,
        project,
        l,
        folder,
      ];
    } else {
      query =
        "SELECT DISTINCT BY (Name) CASE " +
        "WHEN Type = 'CSP' OR Type = 'DIR' THEN $PIECE(Name,'/') " +
        "WHEN (Type != 'CSP' AND Type != 'DIR' AND $LENGTH(Name,'.') > 2) OR Type = 'CLS' OR Type = 'PKG' THEN $PIECE(Name,'.') " +
        "ELSE Name END Name, Type FROM %Studio.Project_ProjectItemsList(?,1) WHERE " +
        "((Type = 'MAC' OR Type = 'OTH' OR Type = 'CSP') AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name,1,1,1,1,0,1))) OR " +
        "(Type = 'CLS' AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name||'.cls',1,1,1,1,0,1))) OR " +
        "(Type = 'PKG' AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name||'/*.cls',1,1,1,0,0,1))) OR " +
        "(Type = 'DIR' AND EXISTS (SELECT Size FROM %Library.RoutineMgr_StudioOpenDialog(Name||'/*.cspall',1,1,1,1,0,1)))";
      parameters = [project];
    }
  }
  return api.actionQuery(query, parameters).then((data) => data.result.content);
}

export function fileSpecFromURI(uri: vscode.Uri, overrideType?: string): string {
  const params = new URLSearchParams(uri.query);
  const csp = params.has("csp") && ["", "1"].includes(params.get("csp"));
  const type =
    overrideType && overrideType != ""
      ? overrideType
      : params.has("type") && params.get("type").length
      ? params.get("type")
      : csp
      ? "csp"
      : "all";

  const folder = !csp
    ? uri.path.replace(/\//g, ".")
    : uri.path === "/"
    ? ""
    : uri.path.endsWith("/")
    ? uri.path
    : uri.path + "/";
  // The query filter represents the studio spec to be used,
  // overrides.filter represents the SQL query that will be passed to the server

  let specOpts = "";
  // If filter is specified on the URI, use it
  if (params.has("filter") && params.get("filter").length) {
    specOpts = params.get("filter");
    if (!csp) {
      // always exclude Studio projects, since we can't do anything with them
      specOpts += ",'*.prj";
    }
  } // otherwise, reference the type to get the desired files.
  else if (csp) {
    specOpts = folder.length > 1 ? "*" : "*.cspall";
  } else if (type === "rtn") {
    specOpts = "*.inc,*.mac,*.int";
  } else if (type === "cls") {
    specOpts = "*.cls";
  } else {
    specOpts = "*.cls,*.inc,*.mac,*.int";
  }
  return csp ? folder + specOpts : folder.length > 1 ? folder.slice(1) + "/" + specOpts : specOpts;
}

export function studioOpenDialogFromURI(
  uri: vscode.Uri,
  overrides: { flat?: boolean; filter?: string; type?: string } = { flat: false, filter: "", type: "" }
): Promise<any> {
  const api = new AtelierAPI(uri);
  if (!api.active) {
    return;
  }
  const sql = `SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?)`;
  const params = new URLSearchParams(uri.query);
  const csp = params.has("csp") && ["", "1"].includes(params.get("csp"));
  const spec = fileSpecFromURI(uri, overrides.type);
  const notStudio = "0";
  const dir = "1";
  const orderBy = "1";
  const generated = params.has("generated") && params.get("generated").length ? params.get("generated") : "0";
  const system =
    params.has("system") && params.get("system").length ? params.get("system") : api.ns === "%SYS" ? "1" : "0";
  let flat = !csp && params.has("flat") && params.get("flat").length ? params.get("flat") : "0";
  if (overrides && overrides.flat) {
    flat = "1";
  }
  return api.actionQuery(sql, [spec, dir, orderBy, system, flat, notStudio, generated, overrides.filter]);
}
