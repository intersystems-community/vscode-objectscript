import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { cspAppsForApi, handleError } from ".";

interface DocumentPickerItem extends vscode.QuickPickItem {
  /** The full name of this item, including its parent(s). */
  fullName: string;
}

function createMultiSelectItem(
  item: { Name: string; Type: number },
  parent?: string,
  parentPad?: number
): DocumentPickerItem {
  const result: DocumentPickerItem = { label: item.Name, fullName: item.Name };
  // Add the icon
  if (item.Type == 0) {
    if (item.Name.endsWith(".inc")) {
      result.label = "$(file-symlink-file) " + result.label;
    } else if (item.Name.endsWith(".int") || item.Name.endsWith(".mac")) {
      result.label = "$(note) " + result.label;
    } else {
      result.label = "$(symbol-misc) " + result.label;
    }
  } else if (item.Type == 10) {
    result.label = "$(folder) " + result.label;
  } else if (item.Type == 9) {
    result.label = "$(package) " + result.label;
  } else if (item.Type == 4) {
    result.label = "$(symbol-class) " + result.label;
  } else {
    result.label = "$(symbol-file) " + result.label;
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
  if (item.Type == 9 || item.Type == 10) {
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

function createSingleSelectItem(
  item: { Name: string; Type: number },
  parent?: string,
  delimiter?: string
): DocumentPickerItem {
  const result: DocumentPickerItem = { label: item.Name, fullName: item.Name };
  // Add the icon
  if (item.Type == 0) {
    if (item.Name.endsWith(".inc")) {
      result.label = "$(file-symlink-file) " + result.label;
    } else if (item.Name.endsWith(".int") || item.Name.endsWith(".mac")) {
      result.label = "$(note) " + result.label;
    } else {
      result.label = "$(symbol-misc) " + result.label;
    }
  } else if (item.Type == 4) {
    result.label = "$(symbol-class) " + result.label;
  } else if (![9, 10].includes(item.Type)) {
    result.label = "$(symbol-file) " + result.label;
  }
  if (parent) {
    // Update the full name if this is a nested item
    result.fullName = parent + delimiter + item.Name;
  }
  return result;
}

/**
 * Prompts the user to select documents in server-namespace `api`
 * using a custom multi-select QuickPick. An optional prompt will customize the title.
 */
export async function pickDocuments(api: AtelierAPI, prompt?: string): Promise<string[]> {
  let sys: "0" | "1" = "0";
  let gen: "0" | "1" = "0";
  let map: "0" | "1" = "1";
  const query = "SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?,,0,?)";
  const webApps = cspAppsForApi(api);
  const webAppRootItems = webApps.map((app: string) => {
    return {
      label: "$(folder) " + app,
      fullName: app,
      buttons: [
        {
          iconPath: new vscode.ThemeIcon("chevron-right"),
          tooltip: "Expand",
        },
      ],
    };
  });

  return new Promise<string[]>((resolve) => {
    let result: string[] = [];
    const quickPick = vscode.window.createQuickPick<DocumentPickerItem>();
    quickPick.title = `Select documents in namespace '${api.ns}' on server '${api.serverId}'${
      prompt ? " " + prompt : ""
    }`;
    quickPick.ignoreFocusOut = true;
    quickPick.canSelectMany = true;
    quickPick.keepScrollPosition = true;
    quickPick.matchOnDescription = true;
    quickPick.buttons = [
      {
        iconPath: new vscode.ThemeIcon("library"),
        tooltip: "System",
        location: vscode.QuickInputButtonLocation.Input,
        toggle: { checked: false },
      },
      {
        iconPath: new vscode.ThemeIcon("server-process"),
        tooltip: "Generated",
        location: vscode.QuickInputButtonLocation.Input,
        toggle: { checked: false },
      },
      {
        iconPath: new vscode.ThemeIcon("references"),
        tooltip: "Mapped",
        location: vscode.QuickInputButtonLocation.Input,
        toggle: { checked: true },
      },
    ];

    const getRootItems = (): Promise<void> => {
      return api
        .actionQuery(`${query} WHERE Type != 5 AND Type != 10`, ["*", sys, gen, map])
        .then((data) => {
          const rootitems: DocumentPickerItem[] = data.result.content.map((i) => createMultiSelectItem(i));
          const findLastIndex = (): number => {
            let l = rootitems.length;
            while (l--) {
              if (rootitems[l].buttons) return l;
            }
            return -1;
          };
          rootitems.splice(findLastIndex() + 1, 0, ...webAppRootItems);
          return rootitems;
        })
        .then((items) => {
          quickPick.items = items;
          quickPick.busy = false;
          quickPick.enabled = true;
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
      return api
        .actionQuery(query, [`${item.fullName}/*`, sys, gen, map])
        .then((data) => {
          const insertItems: DocumentPickerItem[] = data.result.content.map((i) =>
            createMultiSelectItem(i, item.fullName, item.label.search(/\S/))
          );
          const newItems = [...quickPick.items];
          newItems.splice(itemIdx + 1, 0, ...insertItems);
          quickPick.items = newItems;
          quickPick.selectedItems = selected;
          quickPick.busy = false;
          quickPick.enabled = true;
        })
        .catch((error) => {
          quickPick.hide();
          handleError(error, "Failed to get namespace contents.");
        });
    };

    quickPick.onDidChangeSelection((items) => {
      result = items.map((item) =>
        item.buttons && item.buttons.length
          ? item.fullName.includes("/")
            ? item.fullName + "/*"
            : item.fullName + ".*"
          : item.fullName
      );
    });
    quickPick.onDidTriggerButton((button) => {
      quickPick.busy = true;
      quickPick.enabled = false;
      if (button.tooltip == "System") {
        sys = button.toggle.checked ? "1" : "0";
      } else if (button.tooltip == "Generated") {
        gen = button.toggle.checked ? "1" : "0";
      } else {
        map = button.toggle.checked ? "1" : "0";
      }
      // Refresh the items list
      getRootItems();
    });
    quickPick.onDidTriggerItemButton((event) => {
      quickPick.busy = true;
      quickPick.enabled = false;
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
        quickPick.enabled = true;
      }
    });
    quickPick.onDidChangeValue((filter: string) => {
      if (filter.endsWith(".") || filter.endsWith("/")) {
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
          quickPick.enabled = false;
          expandItem(itemIdx);
        }
      }
    });
    quickPick.onDidAccept(async () => {
      quickPick.busy = true;
      quickPick.enabled = false;
      const pkgDir = result.filter((e) => e.endsWith("*"));
      if (pkgDir.length) {
        // Expand packages/folders
        const resolved: string[] = await api
          .actionQuery(
            "SELECT Name FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,1,0,?,,0,?) WHERE Name %PATTERN ?",
            ["*", sys, gen, map, `1(${pkgDir.map((e) => `1"${e.slice(0, -1)}"`).join(",")}).E`]
          )
          .then((data) => data.result.content.map((e) => e.Name))
          .catch((error) => {
            quickPick.hide();
            handleError(error, "Failed to resolve documents in selected packages or folders.");
          });
        // Remove duplicates
        result = [...new Set(resolved.concat(result.filter((e) => !e.endsWith("*"))))];
      }
      resolve(result);
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve([]);
      quickPick.dispose();
    });
    quickPick.busy = true;
    quickPick.enabled = false;
    quickPick.show();
    getRootItems();
  });
}

/**
 * Prompts the user to select a single document in server-namespace `api`
 * using a custom QuickPick. An optional prompt will customize the title.
 */
export async function pickDocument(api: AtelierAPI, prompt?: string): Promise<string> {
  let sys: "0" | "1" = "0";
  let gen: "0" | "1" = "0";
  let map: "0" | "1" = "1";
  const query = "SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?,,0,?)";
  const webApps = cspAppsForApi(api);
  const webAppRootItems = webApps.map((app: string) => {
    return {
      label: app,
      fullName: app,
    };
  });

  return new Promise<string>((resolve) => {
    const quickPick = vscode.window.createQuickPick<DocumentPickerItem>();
    quickPick.title = `${prompt ? prompt : "Select a document"} in namespace '${api.ns}' on server '${api.serverId}'`;
    quickPick.ignoreFocusOut = true;
    quickPick.buttons = [
      {
        iconPath: new vscode.ThemeIcon("library"),
        tooltip: "System",
        location: vscode.QuickInputButtonLocation.Input,
        toggle: { checked: false },
      },
      {
        iconPath: new vscode.ThemeIcon("server-process"),
        tooltip: "Generated",
        location: vscode.QuickInputButtonLocation.Input,
        toggle: { checked: false },
      },
      {
        iconPath: new vscode.ThemeIcon("references"),
        tooltip: "Mapped",
        location: vscode.QuickInputButtonLocation.Input,
        toggle: { checked: true },
      },
    ];

    const getRootItems = (): Promise<void> => {
      return api
        .actionQuery(`${query} WHERE Type != 5 AND Type != 10`, ["*,'*.prj", sys, gen, map])
        .then((data) => {
          const rootitems: DocumentPickerItem[] = data.result.content.map((i) => createSingleSelectItem(i));
          const findLastIndex = (): number => {
            let l = rootitems.length;
            while (l--) {
              if (!rootitems[l].label.startsWith("$(")) return l;
            }
            return -1;
          };
          rootitems.splice(findLastIndex() + 1, 0, ...webAppRootItems);
          return rootitems;
        })
        .then((items) => {
          quickPick.items = items;
          quickPick.selectedItems = [];
          quickPick.value = "";
          quickPick.busy = false;
          quickPick.enabled = true;
        })
        .catch((error) => {
          quickPick.hide();
          handleError(error, "Failed to get namespace contents.");
        });
    };

    quickPick.onDidTriggerButton((button) => {
      quickPick.busy = true;
      quickPick.enabled = false;
      if (button.tooltip == "System") {
        sys = button.toggle.checked ? "1" : "0";
      } else if (button.tooltip == "Generated") {
        gen = button.toggle.checked ? "1" : "0";
      } else {
        map = button.toggle.checked ? "1" : "0";
      }
      // Refresh the items list
      getRootItems();
    });
    quickPick.onDidAccept(() => {
      quickPick.busy = true;
      quickPick.enabled = false;
      const item = quickPick.selectedItems[0];
      if (!item || item.label.startsWith("$(")) {
        let doc = item?.fullName ?? quickPick.value.trim();
        if (!item) {
          // The document name came from the value text, so validate it first
          // Normalize the file extension case for classes and routines
          doc = [".cls", ".mac", ".int", ".inc"].includes(doc.slice(-4).toLowerCase())
            ? doc.slice(0, -3) + doc.slice(-3).toLowerCase()
            : doc;
          // Expand the short form of %Library classes to the long form
          doc =
            doc.startsWith("%") && doc.split(".").length == 2 && doc.slice(-4) == ".cls"
              ? `%Library.${doc.slice(1)}`
              : doc;
          api
            .headDoc(doc)
            .then(() => resolve(doc))
            .catch((error) => {
              vscode.window.showErrorMessage(
                error?.statusCode == 400
                  ? `'${doc}' is an invalid document name.`
                  : error?.statusCode == 404
                    ? `Document '${doc}' does not exist.`
                    : `Internal Server Error encountered trying to validate document '${doc}'.`,
                "Dismiss"
              );
              resolve(undefined);
            })
            .finally(() => quickPick.hide());
        } else {
          // The document name came from an item so no validation is required
          resolve(doc);
          quickPick.hide();
        }
      } else {
        // Replace the items with the folder's contents
        if (item.fullName == "") {
          getRootItems();
        } else {
          api
            .actionQuery(query, [`${item.fullName}/*`, sys, gen, map])
            .then((data) => {
              const delim = item.fullName.includes("/") ? "/" : ".";
              const newItems: DocumentPickerItem[] = data.result.content.map((i) =>
                createSingleSelectItem(i, item.fullName, delim)
              );
              let parentFullName =
                delim == "/" && webApps.includes(item.fullName)
                  ? ""
                  : item.fullName.split(delim).slice(0, -1).join(delim);
              if (parentFullName == "/") parentFullName = "";
              quickPick.items = [{ label: "..", fullName: parentFullName }].concat(newItems);
              quickPick.value = "";
              quickPick.selectedItems = [];
              quickPick.busy = false;
              quickPick.enabled = true;
            })
            .catch((error) => {
              quickPick.hide();
              handleError(error, "Failed to get namespace contents.");
            });
        }
      }
    });
    quickPick.onDidHide(() => {
      resolve(undefined);
      quickPick.dispose();
    });
    quickPick.busy = true;
    quickPick.enabled = false;
    quickPick.show();
    getRootItems();
  });
}
