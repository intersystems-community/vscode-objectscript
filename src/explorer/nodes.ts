import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { cspApps, currentWorkspaceFolder, notIsfs, uriOfWorkspaceFolder } from "../utils";
import { StudioActions, OtherStudioAction } from "../commands/studio";
import { config, workspaceState } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";

type IconPath =
  | string
  | vscode.Uri
  | {
      light: string | vscode.Uri;
      dark: string | vscode.Uri;
    }
  | vscode.ThemeIcon;

interface NodeOptions {
  extraNode?: boolean;
  generated?: boolean;
  system?: boolean;
  namespace?: string;
  workspaceFolder?: string;
  workspaceFolderUri?: vscode.Uri;
  project?: string;
}

/** Get the URI for this leaf node */
function getLeafNodeUri(node: NodeBase, forceServerCopy = false): vscode.Uri {
  if (node.workspaceFolder == undefined) {
    // Should only be the case for leaf nodes in the projects explorer
    // that are children of an extra server namespace node
    return DocumentContentProvider.getUri(
      node.fullName,
      undefined,
      undefined,
      true,
      node.workspaceFolderUri,
      forceServerCopy
    );
  } else {
    return DocumentContentProvider.getUri(
      node.fullName,
      node.workspaceFolder,
      node.namespace,
      undefined,
      undefined,
      forceServerCopy
    );
  }
}

export class NodeBase {
  public readonly options: NodeOptions;
  public readonly label: string;
  public readonly fullName: string;
  public readonly workspaceFolder: string;
  public readonly conn: any;
  public readonly extraNode: boolean;
  public readonly namespace: string;
  public readonly workspaceFolderUri: vscode.Uri;

  protected constructor(label: string, fullName: string, options: NodeOptions) {
    this.options = {
      generated: false,
      extraNode: false,
      ...options,
    };
    this.label = label;
    this.fullName = fullName;
    const { workspaceFolder, namespace, extraNode, workspaceFolderUri } = options;
    if (workspaceFolderUri) {
      // Used by Projects tree
      this.workspaceFolderUri = workspaceFolderUri;
      this.workspaceFolder = vscode.workspace.getWorkspaceFolder(workspaceFolderUri)?.name;
      const api = new AtelierAPI(workspaceFolderUri);
      this.conn = api.config;
    } else {
      this.workspaceFolder = workspaceFolder || currentWorkspaceFolder();
      this.workspaceFolderUri = uriOfWorkspaceFolder(this.workspaceFolder);
      const api = new AtelierAPI(workspaceFolder);
      this.conn = api.config;
    }
    this.namespace = namespace || this.conn.ns;
    this.extraNode = extraNode;
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

  public async getItems4Export(): Promise<string[]> {
    return [this.fullName];
  }
}

export class RootNode extends NodeBase {
  public readonly contextValue: string;
  private readonly _category: string;
  private readonly isCsp: boolean;
  private readonly iconPath: IconPath;

  public constructor(
    label: string,
    fullName: string,
    contextValue: string,
    category: string,
    options: NodeOptions,
    isCsp = false,
    iconPath?: IconPath
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
    return this.getItems(path, this._category);
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

    const api = new AtelierAPI(this.workspaceFolder);
    api.setNamespace(this.namespace);
    if (category == "CSP" && path == "") {
      // Use the results from the getCSPApps() API
      const cspAppsKey =
        `${api.config.host}:${api.config.port}${api.config.pathPrefix}:[${api.config.ns}]`.toLowerCase();
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

  public getItems(path: string, category: string): Promise<NodeBase[]> {
    return this.getList(path, category, false).then((data) =>
      data
        .filter((el) => {
          if (category === "OTH") {
            return el.Type === "100";
          } else if (category === "CSP") {
            return el.Type === "10" || el.Type === "5";
          } else {
            return true;
          }
        })
        .map((el) => {
          switch (el.Type) {
            case "9":
              return new PackageNode(el.Name, el.fullName, category, this.options);
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
              return new RootNode(el.Name, el.fullName, "dataNode:cspApplication", this._category, this.options, true);
            default:
              return null;
          }
        })
        .filter((el) => el !== null)
    );
  }

  public getItems4Export(): Promise<string[]> {
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
    const itemUri = getLeafNodeUri(this);
    const isLocalFile = notIsfs(itemUri);
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);
    const serverCopyUri = getLeafNodeUri(this, true);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [isLocalFile && !showServerCopy ? itemUri : serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open Class",
      },
      resourceUri: isLocalFile && !showServerCopy ? itemUri : undefined,
      contextValue: "dataNode:classNode",
      label: `${displayName}`,
      tooltip: isLocalFile && !showServerCopy ? undefined : this.fullName,
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
    const itemUri = getLeafNodeUri(this);
    const isLocalFile = notIsfs(itemUri);
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);
    const serverCopyUri = getLeafNodeUri(this, true);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [isLocalFile && !showServerCopy ? itemUri : serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open File",
      },
      resourceUri: isLocalFile && !showServerCopy ? itemUri : undefined,
      contextValue: CSPFileNode.contextValue,
      label: `${displayName}`,
      tooltip: isLocalFile && !showServerCopy ? undefined : this.fullName,
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
    const itemUri = getLeafNodeUri(this);
    const isLocalFile = notIsfs(itemUri);
    const showServerCopy: boolean = config("explorer.alwaysShowServerCopy", this.workspaceFolder);
    const serverCopyUri = getLeafNodeUri(this, true);

    return {
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      command: {
        arguments: [isLocalFile && !showServerCopy ? itemUri : serverCopyUri, this.options.project, this.fullName],
        command: "vscode-objectscript.explorer.open",
        title: "Open Routine",
      },
      resourceUri: isLocalFile && !showServerCopy ? itemUri : undefined,
      contextValue: "dataNode:routineNode",
      label: `${displayName}`,
      tooltip: isLocalFile && !showServerCopy ? undefined : this.fullName,
    };
  }
}

export class WorkspaceNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;
  public uniqueId: string;
  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, options: NodeOptions) {
    super(label, label, options);
    this.uniqueId = `serverNode:${this.namespace}:${this.extraNode ? ":extra:" : ""}`;
    this.options.generated = workspaceState.get(`ExplorerGenerated:${this.uniqueId}`);
    this.options.system = workspaceState.get(`ExplorerSystem:${this.uniqueId}`);
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    const flags = [];
    this.options.generated && flags.push(":generated:");
    this.options.system && flags.push(":system:");
    const { host, port, docker, dockerService } = this.conn;
    const serverInfo = docker
      ? "docker" + (dockerService ? `:${dockerService}:${port}` : "")
      : `${host}${port ? ":" + port : ""}`;
    const connInfo = this.extraNode
      ? `[${this.namespace}] on ${serverInfo}`
      : `${this.label} (${serverInfo}[${this.namespace}])`;
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `${this.uniqueId}${flags.join("")}`,
      label: connInfo,
      iconPath: new vscode.ThemeIcon(this.extraNode ? "database" : "server-environment"),
    };
  }

  public async getChildren(_element: NodeBase): Promise<NodeBase[]> {
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
    const api = new AtelierAPI(this.workspaceFolderUri);
    api.setNamespace(this.namespace);
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

  public getItems4Export(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

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
      );
  }
  public getItems4Export(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

export class ProjectsServerNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;
  public uniqueId: string;
  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, wsUri: vscode.Uri) {
    super(label, label, { workspaceFolderUri: wsUri });
    this.uniqueId = `projectsServerNode:${this.workspaceFolder}`;
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    const { host, port, pathPrefix, serverName } = this.conn;
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: this.uniqueId,
      label: `${
        serverName && serverName.length ? serverName : `${host}:${port}${pathPrefix}`
      }:${this.namespace.toUpperCase()}`,
      iconPath: new vscode.ThemeIcon("server-environment"),
      tooltip: "Explore projects in this server namespace",
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    const api = new AtelierAPI(this.workspaceFolderUri);
    api.setNamespace(this.namespace);
    return api
      .actionQuery("SELECT Name, Description FROM %Studio.Project", [])
      .then((data) =>
        data.result.content.map(
          (project) => new ProjectNode(project.Name, { project: project.Name, ...this.options }, project.Description)
        )
      );
  }
}

export class ProjectsServerNsNode extends NodeBase {
  public eventEmitter: vscode.EventEmitter<NodeBase>;

  public constructor(label: string, eventEmitter: vscode.EventEmitter<NodeBase>, wsUri: vscode.Uri, extra = false) {
    super(label, label, { workspaceFolderUri: wsUri, extraNode: extra });
    this.eventEmitter = eventEmitter;
  }

  public getTreeItem(): vscode.TreeItem {
    const { host, port, pathPrefix, serverName } = this.conn;
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: `projectsServerNsNode${this.extraNode ? ":extra" : ""}`,
      label: `${
        serverName && serverName.length ? serverName : `${host}:${port}${pathPrefix}`
      }:${this.namespace.toUpperCase()}`,
      iconPath: new vscode.ThemeIcon("server-environment"),
      tooltip: "Explore projects in this server namespace",
    };
  }

  public async getChildren(element: NodeBase): Promise<NodeBase[]> {
    const api = new AtelierAPI(this.workspaceFolderUri);
    api.setNamespace(this.namespace);
    return api
      .actionQuery("SELECT Name, Description FROM %Studio.Project", [])
      .then((data) =>
        data.result.content.map(
          (project) => new ProjectNode(project.Name, { project: project.Name, ...this.options }, project.Description)
        )
      );
  }
}
