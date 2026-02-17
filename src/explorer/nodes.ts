import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { cspApps, stringifyError } from "../utils";
import { StudioActions, OtherStudioAction } from "../commands/studio";
import { workspaceState } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

interface NodeOptions {
  generated?: boolean;
  system?: boolean;
  namespace?: string;
  wsFolder: vscode.WorkspaceFolder;
  project?: string;
}

/** Get the URI for this leaf node */
function getLeafNodeUri(node: NodeBase): vscode.Uri {
  return DocumentContentProvider.getUri(node.fullName, undefined, node?.namespace, false, node.wsFolder.uri, true);
}

const inactiveMsg = "Server connection is inactive";

export class NodeBase {
  public readonly options: NodeOptions;
  public readonly label: string;
  public readonly fullName: string;
  /** The workspace folder this node is tied to */
  public readonly wsFolder: vscode.WorkspaceFolder;
  /** The namespace for this node, if it differs from the workspace folder's */
  public readonly namespace?: string;

  protected constructor(label: string, fullName: string, options: NodeOptions) {
    this.options = {
      generated: false,
      ...options,
    };
    this.label = label;
    this.fullName = fullName;
    const { namespace, wsFolder } = options;
    this.wsFolder = wsFolder;
    this.namespace = namespace?.toUpperCase();
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      label: this.label,
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    return [];
  }

  public async getItemsForExport(): Promise<string[]> {
    return [this.fullName];
  }
}

export class RootNode extends NodeBase {
  public readonly contextValue: string;
  private readonly _category: string;
  private readonly isCsp: boolean;
  private readonly iconPath: vscode.ThemeIcon;

  public constructor(
    label: string,
    fullName: string,
    contextValue: string,
    category: string,
    options: NodeOptions,
    isCsp = false,
    iconPath?: vscode.ThemeIcon
  ) {
    super(label, fullName, options);
    this.contextValue = contextValue;
    this._category = category;
    this.isCsp = isCsp;
    this.iconPath = iconPath;
  }

  public get category(): string {
    return this._category;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: this.label,
      tooltip: this.isCsp ? this.fullName : undefined,
      iconPath: this.iconPath,
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    const path = this instanceof PackageNode || this.isCsp ? this.fullName + "/" : "";
    return this.getList(path, this._category, false)
      .then((data) =>
        data
          .filter((el) => {
            if (this._category === "OTH") {
              return el.Type === "100";
            } else if (this._category === "CSP") {
              return el.Type === "10" || el.Type === "5";
            } else {
              return true;
            }
          })
          .map((el) => {
            switch (el.Type) {
              case "9":
                return new PackageNode(el.Name, el.fullName, this._category, this.options);
              case "4":
              case "100":
                return new ClassNode(el.Name, el.fullName, this.options);
              case "5":
                return new CSPFileNode(el.Name, el.fullName, this.options);
              case "0":
              case "1":
              case "2":
              case "3":
              case "11":
                return new RoutineNode(el.Name, el.fullName, this.options);
              case "10":
                return new RootNode(
                  el.Name,
                  el.fullName,
                  "dataNode:cspApplication",
                  this._category,
                  this.options,
                  true
                );
              default:
                return null;
            }
          })
          .filter((el) => el !== null)
      )
      .catch((error) => [
        error == inactiveMsg
          ? new InactiveNode("", "", { wsFolder: this.wsFolder })
          : new ErrorNode(stringifyError(error), "", { wsFolder: this.wsFolder }),
      ]);
  }

  public async getList(
    path: string,
    category: string,
    flat: boolean
  ): Promise<{ Name: string; Type: string; fullName: string }[]> {
    const sql = "SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?)";
    let spec = "";
    switch (category) {
      case "CLS":
        spec = "*.cls";
        break;
      case "RTN":
        spec = "*.mac,*.int,*.bas,*.mvb,*.mvi";
        break;
      case "INC":
        spec = "*.inc";
        break;
      case "ALL":
        spec = "*.cls,*.mac,*.int,*.inc";
        break;
      case "CSP":
        spec = "*";
        break;
      case "OTH":
        spec = "*.other,'*.bpl,'*.dtl";
        break;
      default:
        return;
    }
    const direction = "1";
    const orderBy = "1"; // by Name
    const notStudio = "0";
    const generated = this.options.generated ? "1" : "0";

    spec = path + spec;

    const systemFiles = this.options.system || this.namespace === "%SYS" ? "1" : "0";

    const api = new AtelierAPI(this.wsFolder.uri);
    if (!api.active) throw inactiveMsg;
    if (this.namespace) api.setNamespace(this.namespace);
    if (category == "CSP" && path == "") {
      // Use the results from the getCSPApps() API
      const cspAppsKey =
        `${api.config.host}:${api.config.port}${api.config.pathPrefix}[${api.config.ns}]`.toLowerCase();
      let nsCspApps: string[] | undefined = cspApps.get(cspAppsKey);
      if (nsCspApps == undefined) {
        nsCspApps = await api.getCSPApps().then((data) => data.result.content || []);
        cspApps.set(cspAppsKey, nsCspApps);
      }
      return nsCspApps.map((cspApp) => {
        return { Name: cspApp.slice(1), fullName: cspApp.slice(1), Type: "10" };
      });
    } else {
      // Use StudioOpenDialog
      return api
        .actionQuery(sql, [spec, direction, orderBy, systemFiles, flat ? "1" : "0", notStudio, generated])
        .then((data) => {
          const content = data.result.content;
          return content;
        })
        .then((data) =>
          data.map((el: { Name: string; Type: number }) => {
            let fullName = el.Name;
            if (this instanceof PackageNode) {
              fullName = this.fullName + "." + el.Name;
            } else if (this.isCsp) {
              fullName = this.fullName + "/" + el.Name;
            }
            return {
              Name: el.Name,
              Type: String(el.Type),
              fullName,
            };
          })
        );
    }
  }

  public getItemsForExport(): Promise<string[]> {
    const path = this instanceof PackageNode || this.isCsp ? this.fullName + "/" : "";
    const cat = this.isCsp ? "CSP" : "ALL";
    return this.getList(path, cat, true).then((data) => data.map((el) => el.Name));
  }
}

export class ClassNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:classNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const serverCopyUri = getLeafNodeUri(this);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open Class",
      },
      contextValue: "dataNode:classNode",
      label: `${displayName}`,
      tooltip: this.fullName,
    };
  }
}

export class CSPFileNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:cspFileNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const serverCopyUri = getLeafNodeUri(this);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open File",
      },
      contextValue: CSPFileNode.contextValue,
      label: `${displayName}`,
      tooltip: this.fullName,
    };
  }
}

export class PackageNode extends RootNode {
  public constructor(label: string, fullName: string, category: string, options: NodeOptions) {
    super(label, fullName, "dataNode:packageNode", category, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: this.contextValue,
      label: `${displayName}`,
      tooltip: this.fullName,
    };
  }

  public getClasses(): string[] {
    return [];
  }
}

export class RoutineNode extends NodeBase {
  public static readonly contextValue: string = "dataNode:routineNode";
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }

  public getTreeItem(): vscode.TreeItem {
    const displayName: string = this.label;
    const serverCopyUri = getLeafNodeUri(this);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open Routine",
      },
      contextValue: "dataNode:routineNode",
      label: `${displayName}`,
      tooltip: this.fullName,
    };
  }
}

export class WorkspaceNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;
  public uniqueId: string;
  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, options: NodeOptions) {
    super(label, label, options);
    this.uniqueId = `serverNode:${this.namespace}:${this.namespace ? ":extra:" : ""}`;
    this.options.generated = workspaceState.get(`ExplorerGenerated:${this.uniqueId}`);
    this.options.system = workspaceState.get(`ExplorerSystem:${this.uniqueId}`);
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    const flags = [];
    this.options.generated && flags.push(":generated:");
    this.options.system && flags.push(":system:");
    const api = new AtelierAPI(this.wsFolder.uri);
    let label: string;
    if (this.namespace) {
      api.setNamespace(this.namespace);
      label = api.connInfo;
    } else {
      label = `${this.label} (${api.connInfo})`;
    }
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `${this.uniqueId}${flags.join("")}`,
      label,
      iconPath: new vscode.ThemeIcon(this.namespace ? "database" : "server-environment"),
    };
  }

  public async getChildren(_element: NodeBase): Promise<NodeBase[]> {
    if (!new AtelierAPI(this.wsFolder.uri).active) return [new InactiveNode("", "", { wsFolder: this.wsFolder })];
    const children = [];
    let node: RootNode;

    node = new RootNode(
      "Classes",
      "",
      "dataRootNode:classesRootNode",
      "CLS",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-class")
    );
    children.push(node);

    node = new RootNode(
      "Routines",
      "",
      "dataRootNode:routinesRootNode",
      "RTN",
      this.options,
      false,
      new vscode.ThemeIcon("note")
    );
    children.push(node);

    node = new RootNode(
      "Includes",
      "",
      "dataRootNode:routinesRootNode",
      "INC",
      this.options,
      false,
      new vscode.ThemeIcon("file-symlink-file")
    );
    children.push(node);

    node = new RootNode(
      "CSP Files",
      "",
      "dataRootNode:cspRootNode",
      "CSP",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-file")
    );
    children.push(node);

    node = new RootNode(
      "Other",
      "",
      "dataRootNode:otherRootNode",
      "OTH",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-misc")
    );
    children.push(node);

    return children;
  }
}

export class ProjectNode extends NodeBase {
  private description: string;
  public constructor(label: string, options: NodeOptions, description: string) {
    super(label, `${label}.PRJ`, options);
    this.description = description;
  }

  public async getChildren(_element: NodeBase): Promise<NodeBase[]> {
    const children = [];
    let node: ProjectRootNode;

    // Technically a project is a "document", so tell the server that we're opening it
    const api = new AtelierAPI(this.wsFolder.uri);
    if (this.namespace) api.setNamespace(this.namespace);
    await new StudioActions().fireProjectUserAction(api, this.label, OtherStudioAction.OpenedDocument).catch(() => {
      // Swallow error because showing it is more disruptive than using a potentially outdated project definition
    });

    node = new ProjectRootNode(
      "Classes",
      "",
      "dataRootNode:classesRootNode",
      "CLS",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-class")
    );
    children.push(node);

    node = new ProjectRootNode(
      "Routines",
      "",
      "dataRootNode:routinesRootNode",
      "RTN",
      this.options,
      false,
      new vscode.ThemeIcon("note")
    );
    children.push(node);

    node = new ProjectRootNode(
      "Includes",
      "",
      "dataRootNode:routinesRootNode",
      "INC",
      this.options,
      false,
      new vscode.ThemeIcon("file-symlink-file")
    );
    children.push(node);

    node = new ProjectRootNode(
      "CSP Files",
      "",
      "dataRootNode:cspRootNode",
      "CSP",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-file")
    );
    children.push(node);

    node = new ProjectRootNode(
      "Other",
      "",
      "dataRootNode:otherRootNode",
      "OTH",
      this.options,
      false,
      new vscode.ThemeIcon("symbol-misc")
    );
    children.push(node);

    return children;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: "dataNode:projectNode",
      label: this.label,
      tooltip: this.description,
      iconPath: new vscode.ThemeIcon("files"),
    };
  }

  public getItemsForExport(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

export class ProjectRootNode extends RootNode {
  public async getChildren(): Promise<NodeBase[]> {
    const api = new AtelierAPI(this.wsFolder.uri);
    if (!api.active) return [new InactiveNode("", "", { wsFolder: this.wsFolder })];
    if (this.namespace) api.setNamespace(this.namespace);
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
      .then((entries: string[]) => {
        // Sort the files and folders separately an case-insensitively
        const folders: string[] = [];
        const files: string[] = [];
        const collator = new Intl.Collator("en");
        for (const entry of entries) entry.includes(".") ? files.push(entry) : folders.push(entry);
        return [...folders.sort(collator.compare), ...files.sort(collator.compare)];
      })
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
      )
      .catch((error) => [new ErrorNode(stringifyError(error), "", { wsFolder: this.wsFolder })]);
  }
  public getItemsForExport(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

export class ProjectsServerNsNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;

  public constructor(
    label: string,
    eventEmitter: vscode.EventEmitter<NodeBase>,
    wsFolder: vscode.WorkspaceFolder,
    namespace?: string
  ) {
    super(label, label, { wsFolder, namespace });
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `projectsServerNsNode${this.namespace ? ":extra" : ""}`,
      label: this.label,
      iconPath: new vscode.ThemeIcon("server-environment"),
      tooltip: "Explore projects in this server namespace",
    };
  }

  public async getChildren(): Promise<NodeBase[]> {
    const api = new AtelierAPI(this.wsFolder.uri);
    if (!api.active) return [new InactiveNode("", "", { wsFolder: this.wsFolder })];
    if (this.namespace) api.setNamespace(this.namespace);
    return api
      .actionQuery("SELECT Name, Description FROM %Studio.Project", [])
      .then((data) =>
        data.result.content.map(
          (project) => new ProjectNode(project.Name, { project: project.Name, ...this.options }, project.Description)
        )
      )
      .catch((error) => [new ErrorNode(stringifyError(error), "", { wsFolder: this.wsFolder })]);
  }
}

/** Used to show that a server connection is inactive */
class InactiveNode extends NodeBase {
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }
  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: "inactiveNode",
      label: inactiveMsg,
      iconPath: new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground")),
    };
  }
  public getItemsForExport(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

/** Used to bubble up an error to the user */
class ErrorNode extends NodeBase {
  public constructor(label: string, fullName: string, options: NodeOptions) {
    super(label, fullName, options);
  }
  public getTreeItem(): vscode.TreeItem {
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      contextValue: "errorNode",
      label: "Error fetching children",
      tooltip: new vscode.MarkdownString(this.label),
      iconPath: new vscode.ThemeIcon("error", new vscode.ThemeColor("problemsErrorIcon.foreground")),
    };
  }
  public getItemsForExport(): Promise<string[]> {
    return Promise.resolve([]);
  }
}
