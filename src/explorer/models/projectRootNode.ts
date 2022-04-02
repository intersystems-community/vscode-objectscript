import { AtelierAPI } from "../../api";
import { ClassNode } from "./classNode";
import { CSPFileNode } from "./cspFileNode";
import { NodeBase } from "./nodeBase";
import { RootNode } from "./rootNode";
import { RoutineNode } from "./routineNode";

export class ProjectRootNode extends RootNode {
  public getChildren(element: NodeBase): Promise<NodeBase[]> {
    const api = new AtelierAPI(this.workspaceFolderUri);
    api.setNamespace(this.namespace);
    let query: string;
    let parameters: string[];
    if (this.fullName.length) {
      const l = String(this.fullName.length + 2);
      if (this.category == "CSP") {
        query =
          "SELECT DISTINCT $PIECE(SUBSTR(sod.Name,?+1),'/') AS Name FROM %Library.RoutineMgr_StudioOpenDialog('*.cspall',1,1,1,1,0,1) AS sod " +
          "JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON SUBSTR(sod.Name,2) %STARTSWITH ? AND (" +
          "(pil.Type = 'DIR' AND SUBSTR(sod.Name,2) %STARTSWITH pil.Name||'/') OR (pil.Type = 'CSP' AND SUBSTR(sod.Name,2) = pil.Name))";
        parameters = [l, this.options.project, this.fullName + "/"];
      } else {
        parameters = [l, l, l, this.options.project, this.fullName + "."];
        if (this.category == "CLS") {
          query =
            "SELECT DISTINCT CASE " +
            "WHEN $LENGTH(SUBSTR(Name,?),'.') > 1 THEN $PIECE(SUBSTR(Name,?),'.') " +
            "ELSE SUBSTR(Name,?)||'.cls' " +
            "END Name FROM %Studio.Project_ProjectItemsList(?) " +
            "WHERE Type = 'CLS' AND Name %STARTSWITH ?";
        } else {
          parameters = [l].concat(parameters);
          query =
            "SELECT DISTINCT CASE " +
            `WHEN $LENGTH(SUBSTR(Name,?),'.') > 2 AND NOT (SUBSTR(Name,?) %PATTERN '.E1"."0.1"G"1N1".int"') THEN $PIECE(SUBSTR(Name,?),'.') ` +
            "ELSE SUBSTR(Name,?) END Name FROM %Studio.Project_ProjectItemsList(?,1) " +
            "WHERE Name %STARTSWITH ? AND ";
          if (this.category == "RTN") {
            query += "Type = 'MAC' AND $PIECE(Name,'.',$LENGTH(Name,'.')) != 'inc'";
          } else if (this.category == "INC") {
            query += "Type = 'MAC' AND $PIECE(Name,'.',$LENGTH(Name,'.')) = 'inc'";
          } else {
            query +=
              "Type != 'DIR' AND Type != 'CSP' AND Type != 'CLS' AND Type != 'PKG' AND Type != 'MAC' AND Type != 'GBL'";
          }
        }
      }
    } else {
      query =
        "SELECT DISTINCT CASE " +
        "WHEN Type = 'CSP' OR Type = 'DIR' THEN $PIECE(Name,'/') " +
        "WHEN (Type != 'CSP' AND Type != 'DIR' AND $LENGTH(Name,'.') > 2) OR Type = 'CLS' OR Type = 'PKG' THEN $PIECE(Name,'.') " +
        "ELSE Name END Name FROM %Studio.Project_ProjectItemsList(?,1) WHERE ";
      parameters = [this.options.project];
      if (this.category == "CLS") {
        query += "Type = 'PKG' OR Type = 'CLS'";
      } else if (this.category == "RTN") {
        query += "Type = 'MAC' AND $PIECE(Name,'.',$LENGTH(Name,'.')) != 'inc'";
      } else if (this.category == "INC") {
        query += "Type = 'MAC' AND $PIECE(Name,'.',$LENGTH(Name,'.')) = 'inc'";
      } else if (this.category == "CSP") {
        query += "Type = 'DIR' OR Type = 'CSP'";
      } else {
        query +=
          "Type != 'DIR' AND Type != 'CSP' AND Type != 'CLS' AND Type != 'PKG' AND Type != 'MAC' AND Type != 'GBL'";
      }
    }
    return api
      .actionQuery(query, parameters)
      .then((data) => data.result.content.map((e) => e.Name))
      .then((entries: string[]) =>
        entries.map((entry) => {
          const fullName = this.fullName.length
            ? `${this.fullName}${this.category == "CSP" ? "/" : "."}${entry}`
            : entry;
          if (this.category == "CSP") {
            if (entry.includes(".")) {
              return new CSPFileNode(entry, fullName, this.options);
            } else {
              return new ProjectRootNode(entry, fullName, "dataNode:cspApplication", this.category, this.options, true);
            }
          } else {
            if (entry.includes(".")) {
              if (["mac", "int", "inc"].includes(entry.split(".").pop().toLowerCase())) {
                return new RoutineNode(entry, fullName, this.options);
              } else {
                return new ClassNode(entry, fullName, this.options);
              }
            } else {
              return new ProjectRootNode(entry, fullName, "dataNode:packageNode", this.category, this.options);
            }
          }
        })
      );
  }
  public getItems4Export(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
