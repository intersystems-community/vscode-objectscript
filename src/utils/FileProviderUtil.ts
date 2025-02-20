import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { ProjectItem } from "../commands/project";

/** `isfs(-readonly)` query parameters that configure the documents shown */
export enum IsfsUriParam {
  Project = "project",
  System = "system",
  Generated = "generated",
  Mapped = "mapped",
  Filter = "filter",
  CSP = "csp",
  NS = "ns",
}

interface IsfsUriConfig {
  system: boolean;
  generated: boolean;
  mapped: boolean;
  filter: string;
  project: string;
  csp: boolean;
  ns?: string;
}

/** Return the values of all configuration query parameters for `uri` */
export function isfsConfig(uri: vscode.Uri): IsfsUriConfig {
  const params = new URLSearchParams(uri.query);
  return {
    system: params.get(IsfsUriParam.System) == "1",
    generated: params.get(IsfsUriParam.Generated) == "1",
    mapped: params.get(IsfsUriParam.Mapped) != "0",
    filter: params.get(IsfsUriParam.Filter) ?? "",
    project: params.get(IsfsUriParam.Project) ?? "",
    csp: ["", "1"].includes(params.get(IsfsUriParam.CSP)),
    ns: params.get(IsfsUriParam.NS) || undefined,
  };
}

export async function projectContentsFromUri(uri: vscode.Uri, flat = false): Promise<ProjectItem[]> {
  const api = new AtelierAPI(uri);
  if (!api.active) {
    return;
  }
  const { project } = isfsConfig(uri);
  let folder = !uri.path.endsWith("/") ? uri.path + "/" : uri.path;
  folder = folder.startsWith("/") ? folder.slice(1) : folder;
  if (folder == "/") {
    // Treat this the same as an empty folder
    folder = "";
  }
  const folderDots = folder.replace(/\//g, ".");
  let query: string;
  let parameters: string[];
  if (flat) {
    // Only used by the FileSearchProvider and package/folder delete
    query =
      "SELECT CASE " +
      "WHEN Type = 'CLS' THEN Name||'.cls' " +
      "ELSE Name END Name, Type FROM %Studio.Project_ProjectItemsList(?) " +
      "WHERE (Name %STARTSWITH ? OR Name %STARTSWITH ?) AND ((" +
      "(Type = 'MAC' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.mac,*.int,*.inc,*.bas,*.mvi',1,1,1,1,0,1) AS sod WHERE Name = sod.Name)) OR " +
      "(Type = 'CSP' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1) AS sod WHERE '/'||Name = sod.Name)) OR " +
      "(Type NOT IN ('CLS','PKG','MAC','CSP','DIR','GBL') AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.other',1,1,1,1,0,1) AS sod WHERE Name = sod.Name))) OR " +
      "(Type = 'CLS' AND (Package IS NOT NULL OR (Package IS NULL AND EXISTS (SELECT dcd.ID FROM %Dictionary.ClassDefinition AS dcd WHERE dcd.ID = Name))))) " +
      "UNION " +
      "SELECT SUBSTR(sod.Name,2) AS Name, pil.Type FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1,?) AS sod " +
      "JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON " +
      "pil.Type = 'DIR' AND SUBSTR(sod.Name,2) %STARTSWITH ? AND SUBSTR(sod.Name,2) %STARTSWITH pil.Name||'/'";
    parameters = [project, folderDots, folder, `Name %STARTSWITH '/${folder}'`, project, folder];
  } else {
    if (folder) {
      const l = String(folder.length + 1); // Need the + 1 because SUBSTR is 1 indexed
      query =
        "SELECT sod.Name, pil.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,1,0,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?) AS pil ON " +
        "(pil.Type = 'CLS' AND ?||sod.Name = pil.Name||'.cls') OR (pil.Type = 'PKG' AND ?||sod.Name = pil.Name) OR " +
        "((pil.Type = 'CLS' OR pil.Type = 'PKG') AND pil.Name %STARTSWITH ?||sod.Name||'.') " +
        "WHERE pil.Type = 'CLS' OR pil.Type = 'PKG' " +
        'UNION SELECT CASE WHEN ($LENGTH(SUBSTR(sod.Name,?),\'.\') > 2 AND NOT (SUBSTR(sod.Name,?) %PATTERN \'.E1"."0.1"G"1N1".int"\')) ' +
        "THEN $PIECE(SUBSTR(sod.Name,?),'.') ELSE SUBSTR(sod.Name,?) END Name, pil.Type FROM " +
        "%Library.RoutineMgr_StudioOpenDialog(?,1,1,1,1,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?) AS pil ON " +
        "pil.Type = 'MAC' AND sod.Name = pil.Name " +
        "UNION SELECT sod.Name, pil.Type FROM " +
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
        l,
        l,
        l,
        l,
        `${folderDots}*.${["mac", "int", "inc", "bas", "mvi"].join(`,${folderDots}*.`)}`,
        project,
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
        "(Type = 'MAC' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.mac,*.int,*.inc,*.bas,*.mvi',1,1,1,1,0,1) AS sod WHERE pil.Name = sod.Name)) OR " +
        "(Type = 'CSP' AND EXISTS (SELECT sod.Size FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1) AS sod WHERE '/'||pil.Name = sod.Name)) OR " +
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
  const { csp, filter } = isfsConfig(uri);

  const folder = !csp
    ? uri.path.replace(/\/$/, "").replace(/\//g, ".")
    : uri.path === "/"
      ? ""
      : uri.path.endsWith("/")
        ? uri.path
        : uri.path + "/";

  // The filter Uri parameter is the first argument to StudioOpenDialog (Spec)
  let specOpts = "";
  if (filter) {
    // Always exclude Studio projects, BPL, and DTL since we can't do anything with them
    specOpts = filter + ",'*.prj,'*.bpl,'*.dtl";
  } else if (csp) {
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
  if (!api.active) return;
  const { system, generated, mapped } = isfsConfig(uri);
  return api.actionQuery("SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?,?,?)", [
    fileSpecFromURI(uri),
    "1", // Dir (1 means ascending order)
    "1", // OrderBy (1 means name, case insensitive)
    system || api.ns == "%SYS" ? "1" : "0",
    overrides?.flat ? "1" : "0",
    "0", // NotStudio (0 means hide globals and OBJ files)
    generated ? "1" : "0",
    overrides.filter,
    "0", // RoundTime (0 means no rounding)
    mapped ? "1" : "0",
  ]);
}
