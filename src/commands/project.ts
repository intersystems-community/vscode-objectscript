import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, filesystemSchemas, projectsExplorerProvider, schemas } from "../extension";
import { compareConns } from "../providers/DocumentContentProvider";
import { isfsDocumentName } from "../providers/FileSystemProvider/FileSystemProvider";
import { getWsServerConnection, handleError, notIsfs, notNull } from "../utils";
import { exportList } from "./export";
import { OtherStudioAction, StudioActions } from "./studio";
import { NodeBase, ProjectNode, ProjectRootNode, RoutineNode, CSPFileNode, ClassNode } from "../explorer/nodes";
import { isfsConfig } from "../utils/FileProviderUtil";

export interface ProjectItem {
  Name: string;
  Type: string;
}

export async function pickProject(api: AtelierAPI): Promise<string | undefined> {
  const ns = api.config.ns.toUpperCase();
  const projects: vscode.QuickPickItem[] = await api
    .actionQuery("SELECT Name, Description FROM %Studio.Project", [])
    .then((data) =>
      data.result.content.map((prj) => {
        return { label: prj.Name, detail: prj.Description };
      })
    );
  if (projects.length === 0) {
    const create = await vscode.window.showQuickPick(["Yes", "No"], {
      title: `Namespace ${ns} on server '${api.serverId}' contains no projects. Create one?`,
    });
    if (create == "Yes") {
      return createProject(undefined, api);
    }
    return;
  }
  return new Promise<string | undefined>((resolve) => {
    let result: string;
    let resolveOnHide = true;
    const quickPick = vscode.window.createQuickPick();
    quickPick.title = `Select a project in namespace ${ns} on server '${api.serverId}', or click '+' to add one.`;
    quickPick.items = projects;
    quickPick.buttons = [{ iconPath: new vscode.ThemeIcon("add"), tooltip: "Create new project" }];

    async function addAndResolve() {
      resolveOnHide = false;
      // Create new project
      await createProject(undefined, api).then((value) => {
        if (value) {
          // Resolve and tidy up
          resolve(value);
          quickPick.hide();
          quickPick.dispose();
        }
      });
    }
    quickPick.onDidChangeSelection((items) => {
      result = items[0].label;
    });
    quickPick.onDidChangeValue((value) => {
      if (value === "+") {
        addAndResolve();
      }
    });
    quickPick.onDidTriggerButton((button) => {
      addAndResolve();
    });
    quickPick.onDidAccept(() => {
      resolve(result);
      quickPick.hide();
      quickPick.dispose();
    });
    quickPick.onDidHide(() => {
      // flag used by addAndResolve to prevent resolve here
      if (resolveOnHide) {
        resolve(undefined);
      }
      quickPick.dispose();
    });
    quickPick.show();
  });
}

/**
 * Creates a new project.
 * @param node Argument passed when called as a command.
 * @param api Only passed when called from `pickProject()`. If passed, `node` is ignored.
 */
export async function createProject(node: NodeBase | undefined, api?: AtelierAPI): Promise<string | undefined> {
  if (api == undefined) {
    if (node instanceof NodeBase) {
      api = new AtelierAPI(node.workspaceFolderUri);
      api.setNamespace(node.namespace);
    } else {
      // Have the user pick a server connection
      const connUri = await getWsServerConnection();
      if (connUri == null) return;
      if (connUri == undefined) {
        handleError("No active server connections in the current workspace.", "'Create Project' command failed.");
        return;
      }
      api = new AtelierAPI(connUri);
    }
  }
  const taken: string[] = await api
    .actionQuery("SELECT Name FROM %Studio.Project", [])
    .then((data) => data.result.content.map((prj) => prj.Name.toLowerCase()))
    .catch((error) => {
      handleError(error, `Failed to list projects on server '${api.serverId}'.`);
      return;
    });
  if (!taken) return;
  const name = await vscode.window.showInputBox({
    prompt: "Enter a name for the new project",
    validateInput: (value: string) => {
      if (taken.includes(value.toLowerCase())) {
        return "A project with this name already exists";
      }
      if (value.length > 64) {
        return "Name cannot be longer than 64 characters";
      }
      return null;
    },
  });
  if (name && name.length) {
    const desc = await vscode.window.showInputBox({ prompt: "Optionally, enter a description" });
    if (desc !== undefined) {
      try {
        // Create the project
        await api.actionQuery("INSERT INTO %Studio.Project (Name,Description,LastModified) VALUES (?,?,NOW())", [
          name,
          desc,
        ]);
      } catch (error) {
        handleError(error, `Failed to create project '${name}'.`);
        return;
      }

      // Technically a project is a "document", so tell the server that we created it
      try {
        const studioActions = new StudioActions();
        await studioActions.fireProjectUserAction(api, name, OtherStudioAction.CreatedNewDocument);
        await studioActions.fireProjectUserAction(api, name, OtherStudioAction.FirstTimeDocumentSave);
      } catch (error) {
        handleError(error, `Source control actions failed for project '${name}'.`);
      }

      // Refresh the explorer
      projectsExplorerProvider.refresh();

      return name;
    }
  }
}

export async function deleteProject(node: ProjectNode | undefined): Promise<any> {
  let api: AtelierAPI;
  let project: string;
  if (node instanceof ProjectNode) {
    api = new AtelierAPI(node.workspaceFolderUri);
    api.setNamespace(node.namespace);
    project = node.label;
  } else {
    // Have the user pick a server connection
    const connUri = await getWsServerConnection();
    if (connUri == null) return;
    if (connUri == undefined) {
      handleError("No active server connections in the current workspace.", "'Delete Project' command failed.");
      return;
    }
    api = new AtelierAPI(connUri);
    project = await pickProject(api);
  }
  if (project == undefined) {
    return;
  }

  try {
    // Ask the user for confirmation
    const answer = await vscode.window.showWarningMessage(`Delete project '${project}'?`, { modal: true }, "Yes", "No");
    if (answer != "Yes") return;
    // Delete the project
    await api.actionQuery("DELETE FROM %Studio.Project WHERE Name = ?", [project]);
  } catch (error) {
    handleError(error, `Failed to delete project '${project}'.`);
    return;
  }

  // Technically a project is a "document", so tell the server that we deleted it
  try {
    await new StudioActions().fireProjectUserAction(api, project, OtherStudioAction.DeletedDocument);
  } catch (error) {
    handleError(error, `'DeletedDocument' source control action failed for project '${project}'.`);
  }

  // Refresh the explorer
  projectsExplorerProvider.refresh();

  // Ask the user if they want us to clean up an orphaned isfs folder
  const prjFolderIdx = isfsFolderForProject(project, api);
  if (prjFolderIdx != -1) {
    const remove = await vscode.window.showInformationMessage(
      `The current workspace contains a server-side folder linked to deleted project '${project}'. Remove this folder?`,
      "Yes",
      "No"
    );
    if (remove == "Yes") {
      vscode.workspace.updateWorkspaceFolders(prjFolderIdx, 1);
    }
  }
}

/**
 * @param Name The name of the item to add.
 * @param Type The type of the item to add. Either "MAC", "CLS", "PKG", "CSP", "DIR" or "OTH".
 * @param items The items currently in the project.
 */
function addProjectItem(
  Name: string,
  Type: string,
  items: ProjectItem[]
): { add: ProjectItem[]; remove: ProjectItem[] } {
  const add: ProjectItem[] = [];
  const remove: ProjectItem[] = [];

  if (Type == "MAC" && !items.some((item) => item.Name.toLowerCase() == Name.toLowerCase())) {
    add.push({ Name, Type });
  } else if (
    Type == "CLS" &&
    // Class isn't included by name
    !items.some((item) => item.Type == "CLS" && item.Name.toLowerCase() == Name.toLowerCase()) &&
    // Class's package isn't included
    !items.some((item) => item.Type == "PKG" && Name.toLowerCase().startsWith(`${item.Name}.`.toLowerCase()))
  ) {
    add.push({ Name, Type });
  } else if (
    Type == "PKG" && // Package or its superpackages aren't included
    !items.some((item) => item.Type == "PKG" && `${Name.toLowerCase()}.`.startsWith(`${item.Name}.`.toLowerCase()))
  ) {
    add.push({ Name, Type });
    // Remove any subpackages or classes that are in this package
    remove.push(
      ...items.filter(
        (item) =>
          (item.Type == "CLS" || item.Type == "PKG") && item.Name.toLowerCase().startsWith(`${Name.toLowerCase()}.`)
      )
    );
  } else if (
    Type == "CSP" &&
    // File isn't included by name
    !items.some((item) => item.Type == "CSP" && item.Name.toLowerCase() == Name.toLowerCase()) &&
    // File's directory isn't included
    !items.some((item) => item.Type == "DIR" && Name.toLowerCase().startsWith(`${item.Name}/`.toLowerCase()))
  ) {
    add.push({ Name, Type });
  } else if (
    Type == "DIR" && // Folder or its parents aren't included
    !items.some((item) => item.Type == "DIR" && `${Name.toLowerCase()}/`.startsWith(`${item.Name}/`.toLowerCase()))
  ) {
    add.push({ Name, Type });
    // Remove any subfolders or CSP items that are in this folder
    remove.push(
      ...items.filter(
        (item) =>
          (item.Type == "CSP" || item.Type == "DIR") && item.Name.toLowerCase().startsWith(`${Name.toLowerCase()}/`)
      )
    );
  } else if (Type == "OTH" && !items.some((item) => item.Name.toLowerCase() == Name.toLowerCase())) {
    add.push({ Name, Type });
  }

  return { add, remove };
}

/**
 * @param Name The name of the item to remove.
 * @param Type The type of the item to remove. Either "MAC", "CLS", "PKG", "CSP", "DIR" or "OTH".
 * @param items The items currently in the project.
 */
export function removeProjectItem(Name: string, Type: string, items: ProjectItem[]): ProjectItem[] {
  const remove: ProjectItem[] = [];

  if (Type == "MAC" && items.some((item) => item.Name.toLowerCase() == Name.toLowerCase())) {
    remove.push({ Name, Type });
  } else if (
    Type == "CLS" &&
    items.some((item) => item.Type == "CLS" && item.Name.toLowerCase() == Name.toLowerCase())
  ) {
    remove.push({ Name, Type });
  } else if (Type == "PKG") {
    if (items.some((item) => item.Type == "PKG" && item.Name.toLowerCase() == Name.toLowerCase())) {
      // Package is included by name
      remove.push({ Name, Type });
    } else {
      // Remove any subpackages or classes that are in this package
      remove.push(
        ...items.filter(
          (item) =>
            (item.Type == "CLS" || item.Type == "PKG") && item.Name.toLowerCase().startsWith(`${Name.toLowerCase()}.`)
        )
      );
    }
  } else if (
    Type == "CSP" &&
    items.some((item) => item.Type == "CSP" && item.Name.toLowerCase() == Name.toLowerCase())
  ) {
    remove.push({ Name, Type });
  } else if (Type == "DIR") {
    if (items.some((item) => item.Type == "DIR" && item.Name.toLowerCase() == Name.toLowerCase())) {
      // Directory is included by name
      remove.push({ Name, Type });
    } else {
      // Remove any subdirectories or files that are in this directory
      remove.push(
        ...items.filter(
          (item) =>
            (item.Type == "CSP" || item.Type == "DIR") && item.Name.toLowerCase().startsWith(`${Name.toLowerCase()}/`)
        )
      );
    }
  } else if (Type == "OTH" && items.some((item) => item.Name.toLowerCase() == Name.toLowerCase())) {
    remove.push({ Name, Type: items.find((item) => item.Name.toLowerCase() == Name.toLowerCase())?.Type ?? Type });
  }

  return remove;
}

interface PickAdditionsItem extends vscode.QuickPickItem {
  /** The full name of this item, including its parent(s). */
  fullName: string;
}

function sodItemToPickAdditionsItem(
  item: { Name: string; Type?: number },
  parent?: string,
  parentPad?: number
): PickAdditionsItem {
  const result: PickAdditionsItem = { label: item.Name, fullName: item.Name };
  // Add the icon
  if (item.Type == undefined || item.Type == 0) {
    if (item.Name.endsWith(".inc")) {
      result.label = "$(file-symlink-file) " + result.label;
    } else if (item.Name.endsWith(".int") || item.Name.endsWith(".mac")) {
      result.label = "$(note) " + result.label;
    } else {
      result.label = "$(symbol-misc) " + result.label;
    }
  } else {
    if (item.Type == 10) {
      result.label = "$(folder) " + result.label;
    } else if (item.Type == 9) {
      result.label = "$(package) " + result.label;
    } else if (item.Type == 4) {
      result.label = "$(symbol-class) " + result.label;
    } else {
      result.label = "$(symbol-file) " + result.label;
    }
  }
  if (parent) {
    // Update the full name and label padding if this is a nested item
    let delim = ".";
    if (parent.includes("/")) {
      delim = "/";
    }
    result.fullName = parent + delim + item.Name;
    result.label = " ".repeat(parentPad + 2) + result.label;
    result.description = result.fullName;
  }
  if (item.Type && (item.Type == 9 || item.Type == 10)) {
    // Add the expand button if this is a package or directory
    result.buttons = [
      {
        iconPath: new vscode.ThemeIcon("chevron-right"),
        tooltip: "Expand",
      },
    ];
  }
  return result;
}

async function pickAdditions(
  api: AtelierAPI,
  project: string,
  items: ProjectItem[],
  category?: string
): Promise<string[]> {
  let query: string;
  let parameters: string[];
  let sys: "0" | "1" = "0";
  let gen: "0" | "1" = "0";
  if (category == "RTN") {
    query =
      "SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog('*.mac,*.int',1,1,?,1,0,?) " +
      "WHERE Name NOT IN (SELECT Name FROM %Studio.Project_ProjectItemsList(?,1) WHERE Type = 'MAC')";
    parameters = [sys, gen, project];
  } else if (category == "INC") {
    query =
      "SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog('*.inc',1,1,?,1,0,?) " +
      "WHERE Name NOT IN (SELECT Name FROM %Studio.Project_ProjectItemsList(?,1) WHERE Type = 'MAC')";
    parameters = [sys, gen, project];
  } else if (category == "OTH") {
    query =
      "SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog('*.other',1,1,?,1,0,?) " +
      "WHERE Name NOT IN (SELECT Name FROM %Studio.Project_ProjectItemsList(?,1))";
    parameters = [sys, gen, project];
  } else if (category == "CLS") {
    query =
      "SELECT sod.Name, sod.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?) AS sod " +
      "LEFT JOIN %Studio.Project_ProjectItemsList(?) AS pil ON (pil.Type = 'PKG' AND ?||sod.Name = pil.Name) OR " +
      "(pil.Type = 'CLS' AND ?||sod.Name = pil.Name||'.cls') WHERE pil.ID IS NULL";
    parameters = ["*.cls", sys, gen, project, "", ""];
  } else if (category == "CSP") {
    query =
      "SELECT sod.Name, sod.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?) AS sod " +
      "LEFT JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON (pil.Type = 'CSP' OR pil.Type = 'DIR') " +
      "AND ?||sod.Name = pil.Name WHERE pil.ID IS NULL";
    parameters = ["*", sys, gen, project, ""];
  } else {
    query =
      "SELECT Name, NULL AS Type FROM %Library.RoutineMgr_StudioOpenDialog('*.mac,*.int,*.inc,*.other',1,1,?,1,0,?) " +
      "WHERE Name NOT IN (SELECT Name FROM %Studio.Project_ProjectItemsList(?,1)) " +
      "UNION " +
      "SELECT sod.Name, sod.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?) AS sod " +
      "LEFT JOIN %Studio.Project_ProjectItemsList(?) AS pil ON (pil.Type = 'PKG' AND ?||sod.Name = pil.Name) OR " +
      "(pil.Type = 'CLS' AND ?||sod.Name = pil.Name||'.cls') WHERE pil.ID IS NULL";
    parameters = [sys, gen, project, "*.cls", sys, gen, project, "", ""];
  }

  return new Promise<string[]>((resolve) => {
    let result: string[] = [];
    const quickPick = vscode.window.createQuickPick<PickAdditionsItem>();
    quickPick.title = `Select items in namespace '${api.ns.toUpperCase()}' to add to project '${project}'.`;
    quickPick.ignoreFocusOut = true;
    quickPick.canSelectMany = true;
    quickPick.keepScrollPosition = true;
    quickPick.matchOnDescription = true;
    quickPick.buttons = [
      { iconPath: new vscode.ThemeIcon("library"), tooltip: "Show system items" },
      { iconPath: new vscode.ThemeIcon("server-process"), tooltip: "Show generated items" },
    ];

    const getCSPRootItems = (): Promise<PickAdditionsItem[]> => {
      return api.getCSPApps().then((data) =>
        data.result.content
          .map((i: string) => {
            const app = i.slice(1);
            if (!items.some((pi) => pi.Type == "DIR" && pi.Name == app)) {
              return {
                label: "$(folder) " + app,
                fullName: i,
                buttons: [
                  {
                    iconPath: new vscode.ThemeIcon("chevron-right"),
                    tooltip: "Expand",
                  },
                ],
              };
            }
            return null;
          })
          .filter(notNull)
      );
    };
    const getRootItems = (): Promise<void> => {
      let itemsPromise: Promise<PickAdditionsItem[]>;
      if (category != undefined && category != "CSP") {
        itemsPromise = api
          .actionQuery(query, parameters)
          .then((data) => data.result.content.map((i) => sodItemToPickAdditionsItem(i)));
      } else if (category == "CSP") {
        itemsPromise = getCSPRootItems();
      } else {
        itemsPromise = api.actionQuery(query, parameters).then((data) => {
          const rootitems: PickAdditionsItem[] = data.result.content.map((i) => sodItemToPickAdditionsItem(i));
          return getCSPRootItems().then((csprootitems) =>
            rootitems.concat(csprootitems).sort((a, b) => {
              const labelA = a.label.split(" ")[1].toLowerCase();
              const labelB = b.label.split(" ")[1].toLowerCase();
              if (labelA.toLowerCase() < labelB.toLowerCase()) return -1;
              if (labelA.toLowerCase() > labelB.toLowerCase()) return 1;
              return 0;
            })
          );
        });
      }

      return itemsPromise
        .then((items) => {
          quickPick.items = items;
          quickPick.busy = false;
        })
        .catch((error) => {
          quickPick.hide();
          handleError(error, "Failed to get namespace contents.");
        });
    };
    const expandItem = (itemIdx: number): Promise<void> => {
      const selected = quickPick.selectedItems;
      const item = quickPick.items[itemIdx];
      quickPick.items[itemIdx].buttons = [
        {
          iconPath: new vscode.ThemeIcon("chevron-down"),
          tooltip: "Collapse",
        },
      ];
      let tmpQuery = query;
      let tmpParams: string[];
      if (category == "CLS" || !item.fullName.includes("/")) {
        tmpParams = [item.fullName + "/*.cls", sys, gen, project, item.fullName + ".", item.fullName + "."];
      } else {
        tmpParams = [item.fullName + "/*", sys, gen, project, item.fullName.slice(1) + "/"];
      }
      if (category == undefined) {
        if (item.fullName.includes("/")) {
          tmpQuery =
            "SELECT sod.Name, sod.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?) AS sod " +
            "LEFT JOIN %Studio.Project_ProjectItemsList(?,1) AS pil ON (pil.Type = 'CSP' OR pil.Type = 'DIR') " +
            "AND ?||sod.Name = pil.Name WHERE pil.ID IS NULL";
        } else {
          tmpQuery =
            "SELECT sod.Name, sod.Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?) AS sod " +
            "LEFT JOIN %Studio.Project_ProjectItemsList(?) AS pil ON (pil.Type = 'PKG' AND ?||sod.Name = pil.Name) OR " +
            "(pil.Type = 'CLS' AND ?||sod.Name = pil.Name||'.cls') WHERE pil.ID IS NULL";
        }
      }
      if (Array.isArray(tmpParams)) {
        return api
          .actionQuery(tmpQuery, tmpParams)
          .then((data) => {
            const insertItems: PickAdditionsItem[] = data.result.content.map((i) =>
              sodItemToPickAdditionsItem(i, item.fullName, item.label.search(/\S/))
            );
            const newItems = [...quickPick.items];
            newItems.splice(itemIdx + 1, 0, ...insertItems);
            quickPick.items = newItems;
            quickPick.selectedItems = selected;
            quickPick.busy = false;
          })
          .catch((error) => {
            quickPick.hide();
            handleError(error, "Failed to get namespace contents.");
          });
      }
    };

    quickPick.onDidChangeSelection((items) => {
      result = items.map((item) =>
        item.buttons && item.buttons.length && !item.fullName.includes("/") ? item.fullName + ".pkg" : item.fullName
      );
    });
    quickPick.onDidTriggerButton((button) => {
      quickPick.busy = true;
      if (button.tooltip.charAt(0) == "S") {
        if (button.tooltip.includes("system")) {
          // Update the button
          quickPick.buttons = [
            { iconPath: new vscode.ThemeIcon("library"), tooltip: "Hide system items" },
            quickPick.buttons[1],
          ];
          // Change value of correct parameter in array
          sys = "1";
          if (["RTN", "INC", "OTH"].includes(category)) {
            parameters[0] = sys;
          } else if (category != undefined) {
            parameters[1] = sys;
          } else {
            parameters[0] = sys;
            parameters[4] = sys;
          }
        } else {
          quickPick.buttons = [
            quickPick.buttons[0],
            { iconPath: new vscode.ThemeIcon("server-process"), tooltip: "Hide generated items" },
          ];
          gen = "1";
          if (["RTN", "INC", "OTH"].includes(category)) {
            parameters[1] = gen;
          } else if (category != undefined) {
            parameters[2] = gen;
          } else {
            parameters[1] = gen;
            parameters[5] = gen;
          }
        }
      } else {
        if (button.tooltip.includes("system")) {
          quickPick.buttons = [
            { iconPath: new vscode.ThemeIcon("library"), tooltip: "Show system items" },
            quickPick.buttons[1],
          ];
          sys = "0";
          if (["RTN", "INC", "OTH"].includes(category)) {
            parameters[0] = sys;
          } else if (category != undefined) {
            parameters[1] = sys;
          } else {
            parameters[0] = sys;
            parameters[4] = sys;
          }
        } else {
          quickPick.buttons = [
            quickPick.buttons[0],
            { iconPath: new vscode.ThemeIcon("server-process"), tooltip: "Show generated items" },
          ];
          gen = "0";
          if (["RTN", "INC", "OTH"].includes(category)) {
            parameters[1] = gen;
          } else if (category != undefined) {
            parameters[2] = gen;
          } else {
            parameters[1] = gen;
            parameters[5] = gen;
          }
        }
      }
      // Refresh the items list
      getRootItems();
    });
    quickPick.onDidTriggerItemButton((event) => {
      quickPick.busy = true;
      const itemIdx = quickPick.items.findIndex((i) => i.fullName === event.item.fullName);
      if (event.button.tooltip.charAt(0) == "E") {
        // Expand this item
        expandItem(itemIdx);
      } else {
        // Collapse this item
        const selected = quickPick.selectedItems;
        quickPick.items[itemIdx].buttons = [
          {
            iconPath: new vscode.ThemeIcon("chevron-right"),
            tooltip: "Expand",
          },
        ];
        quickPick.items = quickPick.items.filter(
          (i) => !i.fullName.startsWith(event.item.fullName + (event.item.fullName.includes("/") ? "/" : "."))
        );
        quickPick.selectedItems = selected;
        quickPick.busy = false;
      }
    });
    quickPick.onDidChangeValue((filter: string) => {
      if (
        ((category == "CLS" || category == undefined) && filter.endsWith(".")) ||
        ((category == "CSP" || category == undefined) && filter.endsWith("/"))
      ) {
        const itemIdx = quickPick.items.findIndex(
          (i) => i.fullName.toLowerCase() === filter.slice(0, -1).toLowerCase()
        );
        if (
          itemIdx != -1 &&
          quickPick.items[itemIdx].buttons.length &&
          quickPick.items[itemIdx].buttons[0].tooltip.charAt(0) == "E"
        ) {
          // Expand this item
          quickPick.busy = true;
          expandItem(itemIdx);
        }
      }
    });
    quickPick.onDidAccept(() => {
      resolve(result);
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve([]);
      quickPick.dispose();
    });
    quickPick.busy = true;
    quickPick.show();
    getRootItems();
  });
}

export async function modifyProject(
  nodeOrUri: NodeBase | vscode.Uri | undefined,
  type: "add" | "remove"
): Promise<any> {
  const args = await handleCommandArg(nodeOrUri).catch((error) => {
    handleError(error, `Failed to modify project.`);
    return;
  });
  if (!args) return;
  const { node, api, project } = args;

  let items: ProjectItem[] = await api
    .actionQuery("SELECT Name, Type FROM %Studio.Project_ProjectItemsList(?,?) WHERE Type != 'GBL'", [project, "1"])
    .then((data) => data.result.content);
  let add: ProjectItem[] = [];
  let remove: ProjectItem[] = [];
  if (type == "add") {
    const category = node !== undefined && node instanceof ProjectRootNode ? node.category : undefined;
    const picks = await pickAdditions(api, project, items, category);
    if (picks !== undefined && picks.length) {
      for (const pick of picks) {
        // Determine the type of this item
        let type: string;
        const ext: string = pick.split(".").pop().toLowerCase();
        if (["mac", "int", "inc"].includes(ext)) {
          type = "MAC";
        } else if (ext == "cls") {
          type = "CLS";
        } else if (ext == "pkg") {
          type = "PKG";
        } else if (pick.includes("/")) {
          if (pick.split("/").pop().includes(".")) {
            type = "CSP";
          } else {
            type = "DIR";
          }
        } else {
          type = "OTH";
        }

        let newAdd: ProjectItem[] = [];
        let newRemove: ProjectItem[] = [];
        const addResult = addProjectItem(
          type == "CLS" || type == "PKG" ? pick.slice(0, -4) : type == "CSP" || type == "DIR" ? pick.slice(1) : pick,
          type,
          items
        );
        newAdd = addResult.add;
        newRemove = addResult.remove;

        // Perform the new adds and removes
        if (newRemove.length) {
          items = items.filter((item) => !newRemove.map((i) => JSON.stringify(i)).includes(JSON.stringify(item)));
        }
        if (newAdd.length) {
          items.push(...newAdd);
        }
        // Add them to the total adds and removes
        add.push(...newAdd);
        remove.push(...newRemove);
      }
      // Remove any elements that are in both the add and remove array
      const intersect = add
        .map((i) => JSON.stringify(i))
        .filter((item) => remove.map((i) => JSON.stringify(i)).includes(item));
      add = add.filter((item) => !intersect.includes(JSON.stringify(item)));
      remove = remove.filter((item) => !intersect.includes(JSON.stringify(item)));
    }
  } else {
    if (node !== undefined && !(node instanceof ProjectNode)) {
      if (node instanceof RoutineNode) {
        remove.push(...removeProjectItem(node.fullName, "MAC", items));
      } else if (node instanceof CSPFileNode) {
        remove.push(
          ...removeProjectItem(node.fullName.startsWith("/") ? node.fullName.slice(1) : node.fullName, "CSP", items)
        );
      } else if (node instanceof ClassNode) {
        if (node.fullName.endsWith(".cls")) {
          remove.push(...removeProjectItem(node.fullName.slice(0, -4), "CLS", items));
        } else {
          remove.push(...removeProjectItem(node.fullName, "OTH", items));
        }
      } else if (node instanceof ProjectRootNode) {
        if (node.category == "CLS") {
          remove.push(...removeProjectItem(node.fullName, "PKG", items));
        } else if (node.category == "CSP") {
          remove.push(
            ...removeProjectItem(node.fullName.startsWith("/") ? node.fullName.slice(1) : node.fullName, "DIR", items)
          );
        } else if (node.category == "OTH") {
          // Remove all items of Type "OTH" with this prefix
          remove.push(
            ...items.filter(
              (item) =>
                item.Name.startsWith(`${node.fullName}.`) && !["CLS", "PKG", "MAC", "CSP", "DIR"].includes(item.Type)
            )
          );
        } else if (node.category == "INC") {
          // Remove all items of Type "MAC" with this prefix and the .inc extension
          remove.push(
            ...items.filter(
              (item) =>
                item.Name.toLowerCase().startsWith(`${node.fullName.toLowerCase()}.`) &&
                item.Name.toLowerCase().endsWith(".inc") &&
                item.Type == "MAC"
            )
          );
        } else {
          // Remove all items of Type "MAC" with this prefix and the .int or .mac extensions
          remove.push(
            ...items.filter(
              (item) =>
                item.Name.toLowerCase().startsWith(`${node.fullName.toLowerCase()}.`) &&
                (item.Name.toLowerCase().endsWith(".int") || item.Name.toLowerCase().endsWith(".mac")) &&
                item.Type == "MAC"
            )
          );
        }
      }
    } else if (
      nodeOrUri instanceof vscode.Uri &&
      !(vscode.workspace.workspaceFolders ?? []).some((wf) => wf.uri.toString() == nodeOrUri.toString())
    ) {
      // Non-root item in files explorer
      if (nodeOrUri.path.includes(".")) {
        // This is a file, so remove it
        const fileName = isfsDocumentName(nodeOrUri);
        let prjFileName = fileName.startsWith("/") ? fileName.slice(1) : fileName;
        const ext = prjFileName.split(".").pop().toLowerCase();
        prjFileName = ext == "cls" ? prjFileName.slice(0, -4) : prjFileName;
        const prjType = fileName.includes("/")
          ? "CSP"
          : ext == "cls"
            ? "CLS"
            : ["mac", "int", "inc"].includes(ext)
              ? "MAC"
              : "OTH";
        remove.push(...removeProjectItem(prjFileName, prjType, items));
      } else {
        // This is a directory, so remove everything in it
        const dir = nodeOrUri.path.startsWith("/") ? nodeOrUri.path.slice(1) : nodeOrUri.path;
        const cspdir = dir.toLowerCase() + "/";
        const cosdir = dir.replace(/\//g, ".").toLowerCase() + ".";
        remove.push(
          ...items.filter(
            (item) => item.Name.toLowerCase().startsWith(cspdir) || item.Name.toLowerCase().startsWith(cosdir)
          )
        );
      }
    } else {
      if (items.length == 0) {
        vscode.window.showInformationMessage(`Project '${project}' is empty.`, "Dismiss");
      } else {
        const removeQPIs = await vscode.window.showQuickPick(
          items.map((item) => {
            return {
              label: item.Type == "CLS" ? `${item.Name}.cls` : item.Type == "PKG" ? `${item.Name}.pkg` : item.Name,
              ...item,
            };
          }),
          {
            canPickMany: true,
            title: `Pick the items to remove from project '${project}'.`,
          }
        );
        if (removeQPIs !== undefined) {
          remove = removeQPIs.map((qpi) => {
            return { Name: qpi.Name, Type: qpi.Type };
          });
        }
      }
    }
  }

  try {
    if (add.length || remove.length) {
      // Technically a project is a "document", so tell the server that we're editing it
      const studioActions = new StudioActions();
      await studioActions.fireProjectUserAction(api, project, OtherStudioAction.AttemptedEdit);
      if (studioActions.projectEditAnswer != "1") {
        // Don't perform the edit
        if (studioActions.projectEditAnswer == "-1") {
          // Source control action failed
          vscode.window.showErrorMessage(
            `'AttemptedEdit' source control action failed for project '${project}'. Check the 'ObjectScript' Output channel for details.`,
            "Dismiss"
          );
        }
        return;
      }
    }

    if (remove.length) {
      // Delete the obsolete items
      await api.actionQuery(
        "DELETE FROM %Studio.ProjectItem WHERE Project = ? AND LOWER(Name||Type) %INLIST $LISTFROMSTRING(?)",
        [
          project,
          remove
            .map((item) => `${item.Name}${item.Type}`)
            .join(",")
            .toLowerCase(),
        ]
      );
    }
    if (add.length) {
      // Add any new items
      await api.actionQuery(
        `INSERT INTO %Studio.ProjectItem (Project,Name,Type) SELECT * FROM (${add
          .map((item) => `SELECT '${project}','${item.Name}','${item.Type}'`)
          .join(" UNION ")})`,
        []
      );
    }
    if (add.length || remove.length) {
      // Update the project's timestamp
      await api.actionQuery("UPDATE %Studio.Project SET LastModified = NOW() WHERE Name = ?", [project]).catch(() => {
        // Swallow error because VS Code doesn't care about the timestamp
      });
      // "Re-open" the project to signal to the source control class that it should reconcile the server version
      // with the version stored in the source control system. This effectively acts like OnAfterSave().
      await new StudioActions().fireProjectUserAction(api, project, OtherStudioAction.OpenedDocument).catch(() => {
        // The modification has already been completed so there's no point in showing this error
      });
    }
  } catch (error) {
    handleError(error, `Failed to modify project '${project}'.`);
    return;
  }

  if (add.length || remove.length) {
    // Refesh the explorer
    projectsExplorerProvider.refresh();

    // Refresh the files explorer if there's an isfs folder for this project
    if (node == undefined && isfsFolderForProject(project, api) != -1) {
      vscode.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
    }
  }
}

export async function exportProjectContents(node: ProjectNode | undefined): Promise<any> {
  let workspaceFolder: string;
  const api = new AtelierAPI(node.workspaceFolderUri);
  api.setNamespace(node.namespace);
  const project = node.label;
  if (notIsfs(node.workspaceFolderUri)) {
    workspaceFolder = node.workspaceFolder;
  } else {
    const conn = config("conn", node.workspaceFolder);
    const workspaceList = vscode.workspace.workspaceFolders
      .filter((folder) => {
        if (schemas.includes(folder.uri.scheme)) {
          return false;
        }
        const wFolderConn = config("conn", folder.name);
        if (!compareConns(conn, wFolderConn)) {
          return false;
        }
        if (!wFolderConn.active) {
          return false;
        }
        if (wFolderConn.ns.toLowerCase() != node.namespace.toLowerCase()) {
          return false;
        }
        return true;
      })
      .map((el) => el.name);
    if (workspaceList.length > 1) {
      const selection = await vscode.window.showQuickPick(workspaceList, {
        title: "Pick the workspace folder to export files to.",
      });
      if (selection === undefined) {
        return;
      }
      workspaceFolder = selection;
    } else if (workspaceList.length === 1) {
      workspaceFolder = workspaceList.pop();
    } else {
      vscode.window.showInformationMessage(
        "There are no folders in the current workspace that code can be exported to.",
        "Dismiss"
      );
      return;
    }
  }
  if (workspaceFolder === undefined) {
    return;
  }
  const exportFiles: string[] = await api
    .actionQuery(
      "SELECT CASE WHEN sod.Name %STARTSWITH '/' THEN SUBSTR(sod.Name,2) ELSE sod.Name END Name " +
        "FROM %Library.RoutineMgr_StudioOpenDialog('*',1,1,1,1,0,1) AS sod JOIN %Studio.Project_ProjectItemsList(?) AS pil " +
        "ON sod.Name = pil.Name OR (pil.Type = 'CLS' AND pil.Name||'.cls' = sod.Name) " +
        "OR (pil.Type = 'CSP' AND pil.Name = SUBSTR(sod.Name,2)) OR (pil.Type = 'DIR' AND sod.Name %STARTSWITH '/'||pil.Name||'/')",
      [project]
    )
    .then((data) => data.result.content.map((e) => e.Name));
  return exportList(exportFiles, workspaceFolder, node.namespace);
}

/**
 * Returns the index of the first isfs folder in this workspace that is linked to `project`.
 */
function isfsFolderForProject(project: string, api: AtelierAPI): number {
  if (!vscode.workspace.workspaceFolders) return -1;
  const { https, host, port, pathPrefix } = api.config;
  return vscode.workspace.workspaceFolders.findIndex((f) => {
    const fApi = new AtelierAPI(f.uri);
    const { https: fHttps, host: fHost, port: fPort, pathPrefix: fPP } = api.config;
    return (
      filesystemSchemas.includes(f.uri.scheme) &&
      isfsConfig(f.uri).project == project &&
      fHost == host &&
      fPort == port &&
      fHttps == https &&
      fPP == pathPrefix &&
      api.ns == fApi.ns
    );
  });
}

/**
 * Special version of `modifyProject()` that is only called when an `isfs` file in a project folder is created.
 */
export async function addIsfsFileToProject(project: string, fileName: string, api: AtelierAPI): Promise<void> {
  let prjFileName = fileName.startsWith("/") ? fileName.slice(1) : fileName;
  const ext = prjFileName.split(".").pop().toLowerCase();
  prjFileName = ext == "cls" ? prjFileName.slice(0, -4) : prjFileName;
  const prjType = fileName.includes("/")
    ? "CSP"
    : ext == "cls"
      ? "CLS"
      : ["mac", "int", "inc"].includes(ext)
        ? "MAC"
        : "OTH";
  const items: ProjectItem[] = await api
    .actionQuery("SELECT Name, Type FROM %Studio.Project_ProjectItemsList(?,?) WHERE Type != 'GBL'", [project, "1"])
    .then((data) => data.result.content);
  let add: ProjectItem[] = [];
  const addResult = addProjectItem(prjFileName, prjType, items);
  add = addResult.add;

  try {
    if (add.length) {
      // Technically a project is a "document", so tell the server that we're editing it
      const studioActions = new StudioActions();
      await studioActions.fireProjectUserAction(api, project, OtherStudioAction.AttemptedEdit);
      if (studioActions.projectEditAnswer != "1") {
        // Don't perform the edit
        if (studioActions.projectEditAnswer == "-1") {
          // Source control action failed
          vscode.window.showErrorMessage(
            `'AttemptedEdit' source control action failed for project '${project}'. Check the 'ObjectScript' Output channel for details.`,
            "Dismiss"
          );
        }
        return;
      }

      // Add any new items
      await api.actionQuery(
        `INSERT INTO %Studio.ProjectItem (Project,Name,Type) SELECT * FROM (${add
          .map((item) => `SELECT '${project}','${item.Name}','${item.Type}'`)
          .join(" UNION ")})`,
        []
      );

      // Update the project's timestamp
      await api.actionQuery("UPDATE %Studio.Project SET LastModified = NOW() WHERE Name = ?", [project]).catch(() => {
        // Swallow error because VS Code doesn't care about the timestamp
      });
    }
  } catch (error) {
    handleError(error, `Failed to modify project '${project}'.`);
  }
}

export function addWorkspaceFolderForProject(node: ProjectNode): void {
  // Check if an isfs folder already exists for this project
  const idx = isfsFolderForProject(node.label, new AtelierAPI(node.workspaceFolderUri));
  // If not, create one
  if (idx != -1) {
    vscode.window.showWarningMessage(`A workspace folder for this project already exists.`, "Dismiss");
    return;
  }
  // Append it to the workspace
  vscode.workspace.updateWorkspaceFolders(
    vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0,
    0,
    {
      uri: vscode.Uri.parse(`isfs://${node.conn.serverName}:${node.namespace}/?project=${node.label}`),
      name: `${node.label} - ${node.conn.serverName}:${node.namespace.toUpperCase()}`,
    }
  );
  // Switch to Explorer view so user sees the outcome
  vscode.commands.executeCommand("workbench.view.explorer");
}

async function handleCommandArg(
  nodeOrUri: NodeBase | vscode.Uri | undefined
): Promise<{ node: NodeBase; api: AtelierAPI; project: string } | undefined> {
  let node: NodeBase;
  let api: AtelierAPI;
  let project: string;
  if (nodeOrUri instanceof NodeBase) {
    // Called from Projects Explorer
    node = nodeOrUri;
    api = new AtelierAPI(node.workspaceFolderUri);
    api.setNamespace(node.namespace);
    project = node.options.project;
  } else if (nodeOrUri instanceof vscode.Uri) {
    // Called from files explorer
    api = new AtelierAPI(nodeOrUri);
    project = isfsConfig(nodeOrUri).project;
  } else {
    // Function was called from the command palette so there's no first argument
    // Have the user pick a server connection
    const connUri = await getWsServerConnection();
    if (connUri == null) return;
    if (connUri == undefined) throw "No active server connections in the current workspace.";
    api = new AtelierAPI(connUri);
  }
  if (!project) {
    project = await pickProject(api);
    if (!project) return;
  }
  return { node, api, project };
}

export async function modifyProjectMetadata(nodeOrUri: NodeBase | vscode.Uri | undefined): Promise<void> {
  const args = await handleCommandArg(nodeOrUri).catch((error) => {
    handleError(error, `Failed to modify project metadata.`);
    return;
  });
  if (!args) return;
  const { api, project } = args;

  try {
    const oldDesc: string = await api
      .actionQuery("SELECT Description FROM %Studio.Project WHERE Name = ?", [project])
      .then((data) => data.result.content[0]?.Description);
    const newDesc = await vscode.window.showInputBox({
      prompt: `Enter a description for project '${project}'`,
      value: oldDesc,
    });
    if (!newDesc || newDesc == oldDesc) return;

    // Technically a project is a "document", so tell the server that we're editing it
    const studioActions = new StudioActions();
    await studioActions.fireProjectUserAction(api, project, OtherStudioAction.AttemptedEdit);
    if (studioActions.projectEditAnswer != "1") {
      // Don't perform the edit
      if (studioActions.projectEditAnswer == "-1") {
        // Source control action failed
        vscode.window.showErrorMessage(
          `'AttemptedEdit' source control action failed for project '${project}'. Check the 'ObjectScript' Output channel for details.`,
          "Dismiss"
        );
      }
      return;
    }

    // Modify the project
    await api.actionQuery("UPDATE %Studio.Project SET Description = ?, LastModified = NOW() WHERE Name = ?", [
      newDesc,
      project,
    ]);

    // "Re-open" the project to signal to the source control class that it should reconcile the server version
    // with the version stored in the source control system. This effectively acts like OnAfterSave().
    await new StudioActions().fireProjectUserAction(api, project, OtherStudioAction.OpenedDocument).catch(() => {
      // The modification has already been completed so there's no point in showing this error
    });

    // Refesh the explorer
    projectsExplorerProvider.refresh();
  } catch (error) {
    handleError(error, `Failed to modify metadata of project '${project}'.`);
  }
}
