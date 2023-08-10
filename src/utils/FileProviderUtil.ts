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
  const folderDots = folder.replace(/\//g, ".");
  const project = params.get("project");
  let query: string;
  let parameters: string[];
  if (flat) {
    // Only used by the FileSearchProvider and package/folder delete
    query =
      "SELECT CASE " +
      "WHEN Type = 'CLS' THEN Name||'.cls' " +
      "ELSE Name END Name, Type FROM %Studio.Project_ProjectItemsList(?) " +
      "WHERE (Name %STARTSWITH ? OR Name %STARTSWITH ?) AND (" +
      "(Type = 'MAC' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.mac,*.int,*.inc',1,1,1,1,0,1) AS sod WHERE Name = sod.Name)) OR " +
      "(Type = 'CSP' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1) AS sod WHERE '/'||Name = sod.Name)) OR " +
      "(Type NOT IN ('CLS','PKG','MAC','CSP','DIR','GBL') AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.other',1,1,1,1,0,1) AS sod WHERE Name = sod.Name))) OR " +
      "(Type = 'CLS' AND (Package IS NOT NULL OR (Package IS NULL AND EXISTS (SELECT dcd.ID FROM %Dictionary.ClassDefinition AS dcd WHERE dcd.ID = Name)))) " +
      "UNION " +
      "SELECT SUBSTR(sod.Name,2) AS Name, pil.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,1,1,0,1) AS sod " +
      "JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON " +
      "pil.Type = 'DIR' AND SUBSTR(sod.Name,2) %STARTSWITH ? AND SUBSTR(sod.Name,2) %STARTSWITH pil.Name||'/'";
    parameters = [project, folderDots, folder, folder + "*.cspall", project, folder];
  } else {
    if (folder.length) {
      const l = String(folder.length + 1); // Need the + 1 because SUBSTR is 1 indexed
      query =
        "SELECT sod.Name, pil.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,1,0,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?) AS pil ON " +
        "(pil.Type = 'MAC' AND ?||sod.Name = pil.Name) OR " +
        "(pil.Type = 'CLS' AND ?||sod.Name = pil.Name||'.cls') OR (pil.Type = 'PKG' AND ?||sod.Name = pil.Name) OR " +
        "((pil.Type = 'CLS' OR pil.Type = 'PKG') AND pil.Name %STARTSWITH ?||sod.Name||'.') " +
        "WHERE pil.Type = 'MAC' OR pil.Type = 'CLS' OR pil.Type = 'PKG' UNION SELECT sod.Name, pil.Type FROM " +
        "%Library.RoutineMgr_StudioOpenDialog(?,1,1,1,0,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON " +
        "(pil.Type = 'DIR' AND ?||sod.Name %STARTSWITH pil.Name||'/') OR (pil.Type = 'CSP' AND ?||sod.Name = pil.Name) " +
        "UNION SELECT $PIECE(SUBSTR(Name,?),'/') AS Name, Type FROM %Studio.Project_ProjectItemsList(?,1) WHERE (" +
        "Type = 'DIR' AND $LENGTH($PIECE(SUBSTR(Name,?),'/')) > 0 AND Name %STARTSWITH ? AND EXISTS " +
        "(SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,0,0,1) AS sod WHERE Name %STARTSWITH sod.Name||'/' OR Name = sod.Name)) OR (" +
        "Type = 'CSP' AND Name %STARTSWITH ? AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1) AS sod WHERE Name = sod.Name)) " +
        "UNION SELECT CASE WHEN $LENGTH(SUBSTR(sod.Name,?),'.') > 2 THEN $PIECE(SUBSTR(sod.Name,?),'.') ELSE SUBSTR(sod.Name,?) END Name, pil.Type FROM " +
        "%Library.RoutineMgr_StudioOpenDialog(?,1,1,1,1,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON " +
        "$PIECE(sod.Name,'.',1,$LENGTH(sod.Name,'.')-1) = $PIECE(pil.Name,'.',1,$LENGTH(pil.Name,'.')-1) AND UPPER($PIECE(sod.Name,'.',$LENGTH(sod.Name,'.'))) = $PIECE(pil.Name,'.',$LENGTH(pil.Name,'.'))";
      parameters = [
        folderDots.slice(0, -1) + "/*",
        project,
        folderDots,
        folderDots,
        folderDots,
        folderDots,
        folder + "*",
        project,
        folder,
        folder,
        l,
        project,
        l,
        folder,
        folder,
        l,
        l,
        l,
        folderDots + "*.other",
        project,
      ];
    } else {
      const nameCol =
        "CASE WHEN Type = 'CSP' OR Type = 'DIR' THEN $PIECE(Name,'/') " +
        "WHEN (Type != 'CSP' AND Type != 'DIR' AND $LENGTH(Name,'.') > 2 AND UPPER($PIECE(Name,'.',$LENGTH(Name,'.'))) != 'DFI') " +
        "OR Type = 'CLS' OR Type = 'PKG' THEN $PIECE(Name,'.') ELSE Name END";
      query =
        `SELECT DISTINCT BY (${nameCol}) ${nameCol} ` +
        "Name, Type FROM %Studio.Project_ProjectItemsList(?,1) AS pil WHERE " +
        "(Type = 'MAC' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.mac,*.int,*.inc',1,1,1,1,0,1) AS sod WHERE pil.Name = sod.Name)) OR " +
        "(Type = 'CSP' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1) AS sod WHERE pil.Name = sod.Name)) OR " +
        "(Type NOT IN ('CLS','PKG','MAC','CSP','DIR','GBL') AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.other',1,1,1,1,0,1) AS sod WHERE " +
        "$PIECE(sod.Name,'.',1,$LENGTH(sod.Name,'.')-1) = $PIECE(pil.Name,'.',1,$LENGTH(pil.Name,'.')-1) AND UPPER($PIECE(sod.Name,'.',$LENGTH(sod.Name,'.'))) = $PIECE(pil.Name,'.',$LENGTH(pil.Name,'.')))) OR " +
        "(Type = 'CLS' AND EXISTS (SELECT dcd.ID FROM %Dictionary.ClassDefinition AS dcd WHERE dcd.ID = pil.Name)) OR " +
        "(Type = 'PKG' AND EXISTS (SELECT dcd.ID FROM %Dictionary.ClassDefinition AS dcd WHERE dcd.ID %STARTSWITH pil.Name||'.')) OR " +
        "(Type = 'DIR' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,0,0,1) AS sod WHERE pil.Name %STARTSWITH sod.Name||'/' OR pil.Name = sod.Name))";
      parameters = [project];
    }
  }
  return api.actionQuery(query, parameters).then((data) => data.result.content);
}

export function fileSpecFromURI(uri: vscode.Uri): string {
  const params = new URLSearchParams(uri.query);
  const csp = params.has("csp") && ["", "1"].includes(params.get("csp"));

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
  } else {
    specOpts = "*.cls,*.inc,*.mac,*.int";
  }
  return csp ? folder + specOpts : folder.length > 1 ? folder.slice(1) + "/" + specOpts : specOpts;
}

export function studioOpenDialogFromURI(
  uri: vscode.Uri,
  overrides: { flat?: boolean; filter?: string } = { flat: false, filter: "" }
): Promise<any> {
  const api = new AtelierAPI(uri);
  if (!api.active) {
    return;
  }
  const sql = `SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?,?,?)`;
  const params = new URLSearchParams(uri.query);
  const spec = fileSpecFromURI(uri);
  const notStudio = "0";
  const dir = "1";
  const orderBy = "1";
  const generated = params.has("generated") && params.get("generated").length ? params.get("generated") : "0";
  const system =
    params.has("system") && params.get("system").length ? params.get("system") : api.ns === "%SYS" ? "1" : "0";
  const flat = overrides && overrides.flat ? "1" : "0";
  const mapped = params.has("mapped") && params.get("mapped") == "0" ? "0" : "1";
  return api.actionQuery(sql, [spec, dir, orderBy, system, flat, notStudio, generated, overrides.filter, "0", mapped]);
}
