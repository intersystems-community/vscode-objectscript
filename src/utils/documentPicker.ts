import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { outputChannel } from ".";

interface DocumentPickerItem extends vscode.QuickPickItem {
  /** The full name of this item, including its parent(s). */
  fullName: string;
}

function sodItemToDocumentPickerItem(
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

/**
 * Prompts the user to select documents in server-namespace `api`
 * using a custom multi-select QuickPick. An optional prompt will customize the title.
 */
export async function pickDocuments(api: AtelierAPI, prompt?: string): Promise<string[]> {
  let sys: "0" | "1" = "0";
  let gen: "0" | "1" = "0";
  let map: "0" | "1" = "0";
  const query = "SELECT Name, Type FROM %Library.RoutineMgr_StudioOpenDialog(?,1,1,?,0,0,?,,0,?)";
  const parameters = ["*", sys, gen, map];
  const sysBtn = new vscode.ThemeIcon("library");
  const genBtn = new vscode.ThemeIcon("server-process");
  const mapBtn = new vscode.ThemeIcon("references");

  return new Promise<string[]>((resolve) => {
    let result: string[] = [];
    const quickPick = vscode.window.createQuickPick<DocumentPickerItem>();
    quickPick.title = `Select documents in namespace '${api.ns.toUpperCase()}' on server '${api.serverId}'${
      prompt ? " " + prompt : ""
    }`;
    quickPick.ignoreFocusOut = true;
    quickPick.canSelectMany = true;
    quickPick.keepScrollPosition = true;
    quickPick.matchOnDescription = true;
    quickPick.buttons = [
      { iconPath: sysBtn, tooltip: "Show system documents" },
      { iconPath: genBtn, tooltip: "Show generated documents" },
      { iconPath: mapBtn, tooltip: "Show mapped documents" },
    ];

    const getCSPRootItems = (): Promise<DocumentPickerItem[]> => {
      return api.getCSPApps().then((data) =>
        data.result.content.map((app: string) => {
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
        })
      );
    };
    const getRootItems = (): Promise<void> => {
      return api
        .actionQuery(`${query} WHERE Type != 5 AND Type != 10`, parameters)
        .then((data) => {
          const rootitems: DocumentPickerItem[] = data.result.content.map((i) => sodItemToDocumentPickerItem(i));
          return getCSPRootItems().then((csprootitems) => {
            const findLastIndex = (): number => {
              let l = rootitems.length;
              while (l--) {
                if (rootitems[l].buttons) return l;
              }
              return -1;
            };

            rootitems.splice(findLastIndex() + 1, 0, ...csprootitems);
            return rootitems;
          });
        })
        .then((items) => {
          quickPick.items = items;
          quickPick.busy = false;
          quickPick.enabled = true;
        })
        .catch((error) => {
          quickPick.hide();
          let message = `Failed to get namespace contents.`;
          if (error && error.errorText && error.errorText !== "") {
            outputChannel.appendLine("\n" + error.errorText);
            outputChannel.show(true);
            message += " Check 'ObjectScript' output channel for details.";
          }
          vscode.window.showErrorMessage(message, "Dismiss");
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
        .actionQuery(query, [item.fullName + "/*", sys, gen, map])
        .then((data) => {
          const insertItems: DocumentPickerItem[] = data.result.content.map((i) =>
            sodItemToDocumentPickerItem(i, item.fullName, item.label.search(/\S/))
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
          let message = `Failed to get namespace contents.`;
          if (error && error.errorText && error.errorText !== "") {
            outputChannel.appendLine("\n" + error.errorText);
            outputChannel.show(true);
            message += " Check 'ObjectScript' output channel for details.";
          }
          vscode.window.showErrorMessage(message, "Dismiss");
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
      if (button.tooltip.charAt(0) == "S") {
        if (button.tooltip.includes("system")) {
          // Update the button
          quickPick.buttons = [
            { iconPath: sysBtn, tooltip: "Hide system documents" },
            quickPick.buttons[1],
            quickPick.buttons[2],
          ];
          // Change value of correct parameter in array
          sys = "1";
          parameters[1] = sys;
        } else if (button.tooltip.includes("generated")) {
          quickPick.buttons = [
            quickPick.buttons[0],
            { iconPath: genBtn, tooltip: "Hide generated documents" },
            quickPick.buttons[2],
          ];
          gen = "1";
          parameters[2] = gen;
        } else {
          quickPick.buttons = [
            quickPick.buttons[0],
            quickPick.buttons[1],
            { iconPath: mapBtn, tooltip: "Hide mapped documents" },
          ];
          map = "1";
          parameters[3] = map;
        }
      } else {
        if (button.tooltip.includes("system")) {
          quickPick.buttons = [
            { iconPath: sysBtn, tooltip: "Show system documents" },
            quickPick.buttons[1],
            quickPick.buttons[2],
          ];
          sys = "0";
          parameters[1] = sys;
        } else if (button.tooltip.includes("generated")) {
          quickPick.buttons = [
            quickPick.buttons[0],
            { iconPath: genBtn, tooltip: "Show generated documents" },
            quickPick.buttons[2],
          ];
          gen = "0";
          parameters[2] = gen;
        } else {
          quickPick.buttons = [
            quickPick.buttons[0],
            quickPick.buttons[1],
            { iconPath: mapBtn, tooltip: "Show mapped documents" },
          ];
          map = "0";
          parameters[3] = map;
        }
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
            let message = `Failed to resolve documents in selected packages or folders.`;
            if (error && error.errorText && error.errorText !== "") {
              outputChannel.appendLine("\n" + error.errorText);
              outputChannel.show(true);
              message += " Check 'ObjectScript' output channel for details.";
            }
            vscode.window.showErrorMessage(message, "Dismiss");
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
