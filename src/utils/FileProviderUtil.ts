import * as vscode from "vscode";
import * as url from "url";
import { AtelierAPI } from "../api";

export function studioOpenDialogFromURI(
  uri: vscode.Uri,
  overrides: { flat?: boolean; filter?: string; type?: string } = { flat: false, filter: "", type: "" }
): Promise<any> {
  const api = new AtelierAPI(uri);
  if (!api.active) {
    return;
  }
  const sql = `CALL %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?)`;
  const { query } = url.parse(uri.toString(true), true);
  const csp = query.csp === "" || query.csp === "1";
  const type =
    overrides.type && overrides.type != ""
      ? overrides.type
      : query.type && query.type != ""
      ? query.type.toString()
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
  if (query.filter && query.filter.length) {
    specOpts = query.filter.toString();
    if (!csp) {
      // always exclude Studio projects, since we can't do anything with them
      specOpts += ",'*.prj";
    }
  } // otherwise, reference the type to get the desired files.
  else if (csp) {
    specOpts = "*";
  } else if (type === "rtn") {
    specOpts = "*.inc,*.mac,*.int";
  } else if (type === "cls") {
    specOpts = "*.cls";
  } else {
    specOpts = "*.cls,*.inc,*.mac,*.int";
  }
  const spec = csp ? folder + specOpts : folder.length > 1 ? folder.slice(1) + "/" + specOpts : specOpts;
  const notStudio = "0";
  const dir = "1";
  const orderBy = "1";
  const generated = query.generated && query.generated.length ? query.generated.toString() : "0";
  const system = query.system && query.system.length ? query.system.toString() : api.ns === "%SYS" ? "1" : "0";
  let flat = query.flat && query.flat.length ? query.flat.toString() : "0";
  if (overrides && overrides.flat) flat = "1";
  return api.actionQuery(sql, [spec, dir, orderBy, system, flat, notStudio, generated, overrides.filter]);
}
