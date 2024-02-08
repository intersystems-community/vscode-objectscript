import * as vscode from "vscode";
import cmd = require("node-cmd");
import util = require("util");
import { gte } from "semver";

import { fileExists, outputChannel } from "../utils";
import { clsLangId, cspLangId } from "../extension";

/** Run a command using `node-cmd` and return a Promise */
const runCmd = util.promisify(cmd.run);

/** The languages supported by the Language Server's `isclexer.node` parser library. */
const languages = {
  CLS: 3,
  COS: 1,
  XML: 9,
  CSS: 15,
  HTML: 5,
  JAVA: 13,
  JAVASCRIPT: 11,
  SQL: 2,
  PYTHON: 7,
};

/**
 * Convert the registry's `0x00BBGGRR` COLORREF to the CSS-style `#RRGGBB` used by VS Code.
 */
function registryToCSS(regColor: string): string {
  const tmp = regColor.slice(2).padStart(8, "0");
  return `#${tmp.slice(6)}${tmp.slice(4, 6)}${tmp.slice(2, 4)}`;
}

/**
 * * Read Studio snippets from file paths stored in the registry.
 * * Convert them to VS Code JSON format.
 * * Store them in global snippets file `isc-studio.code-snippets`.
 */
export async function loadStudioSnippets(): Promise<void> {
  // Check that we're on windows
  if (process.platform != "win32") {
    vscode.window.showErrorMessage("Loading Studio snippets is only supported on Windows.", "Dismiss");
    return;
  }
  vscode.window
    .withProgress<vscode.Uri | string>(
      {
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: "Loading Studio snippets",
      },
      async (): Promise<vscode.Uri | string> => {
        // Read Studio snippet file paths from Windows registry
        const files: vscode.Uri[] = [];
        const keyRegex = /^USER[1-3] location$/;
        const sep = "    ";
        const regKey = "HKEY_CURRENT_USER\\SOFTWARE\\InterSystems\\Cache Studio\\Code Snippets";
        const regData: string = await runCmd(`reg query "${regKey}" /f location`);
        for (const line of regData.split("\r\n")) {
          const lineArr = line.trim().split(sep);
          if (lineArr.length >= 3 && keyRegex.test(lineArr[0])) {
            // This line contains one of the 3 file paths
            const studioUri = vscode.Uri.file(lineArr.slice(2).join(sep));
            // Check that the file exists
            if (await fileExists(studioUri)) {
              files.push(studioUri);
            }
          }
        }

        if (files.length > 0) {
          const textDecoder = new TextDecoder();
          const vscodeUri = vscode.Uri.file(
            `${process.env.APPDATA}\\Code${
              vscode.env.appName.includes("Insiders") ? " - Insiders" : ""
            }\\User\\snippets\\isc-studio.code-snippets`
          );
          // Check if the destination file exists
          if (await fileExists(vscodeUri)) {
            const overwrite = await vscode.window.showWarningMessage(
              `Snippets file ${vscodeUri.fsPath} already exists. Overwrite it?`,
              "Yes",
              "No"
            );
            if (overwrite != "Yes") {
              return "Load of Studio snippets aborted by the user.";
            }
          }
          const vscodeSnippets = {};
          for (const file of files) {
            // Read the file and convert its snippets to VS Code format
            textDecoder
              .decode(await vscode.workspace.fs.readFile(file))
              // $CHAR(1) is the delimiter between snippets
              .split(String.fromCharCode(1))
              .forEach((studioSnippet) => {
                // $CHAR(2) is the delimiter between snippet parts: Name_$CHAR(2)_Language_$CHAR(2)_Body
                const parts = studioSnippet.split(String.fromCharCode(2));
                // Skip snippets that are malformed
                if (parts.length < 3) {
                  return;
                }
                // Trim whitespace from the Name and Language
                parts[0] = parts[0].trim();
                parts[1] = parts[1].trim();
                // Only convert snippets for COS, UDL and HTML
                if (["1", "3", "5"].includes(parts[1])) {
                  vscodeSnippets[parts[0]] = {
                    // Use the first word of Name as the prefix
                    // Use ... as the separator (like default Studio snippets) if it's present, else space
                    prefix: parts[0].includes("...") ? parts[0].split("...")[0] : parts[0].split(" ")[0],
                    // Need to escape any $ within the body
                    body: parts.slice(2).join(String.fromCharCode(2)).replace(/\$/g, "\\$").split(/\r?\n/),
                    // Use Name as the description since Studio doesn't support snippet descriptions/documentation
                    description: parts[0],
                    // Use Language to determine the scope
                    scope:
                      parts[1] == "5"
                        ? cspLangId
                        : parts[1] == "3"
                        ? clsLangId
                        : "objectscript,objectscript-int,objectscript-macros,objectscript-class,objectscript-csp",
                  };
                }
              });
          }
          // Write the converted Studio snippets to the file
          await vscode.workspace.fs.writeFile(
            vscodeUri,
            new TextEncoder().encode(JSON.stringify(vscodeSnippets, null, 2))
          );
          // Return the uri we wrote to
          return vscodeUri;
        } else {
          return "There are no user defined Studio snippet files to load from.";
        }
      }
    )
    .then(
      (uriOrReason: vscode.Uri | string) => {
        if (uriOrReason instanceof vscode.Uri) {
          // Report success
          vscode.window
            .showInformationMessage(
              `Successfully loaded Studio snippets into global file ${uriOrReason.fsPath}`,
              "Open File",
              "Dismiss"
            )
            .then((answer) => {
              if (answer == "Open File") {
                vscode.window.showTextDocument(uriOrReason, { preview: false });
              }
            });
        } else if (typeof uriOrReason == "string") {
          // Show the user the reason the command was aborted
          vscode.window.showInformationMessage(uriOrReason, "Dismiss");
        }
      },
      (error) => {
        outputChannel.appendLine(
          typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
        );
        vscode.window.showErrorMessage(
          "An error occurred while loading Studio snippets. Check 'ObjectScript' Output channel for details.",
          "Dismiss"
        );
      }
    );
}

/**
 * * Read Studio syntax and editor background colors from the registry.
 * * Convert the syntax colors to an `editor.semanticTokenColorCustomizations` setting object.
 * * Store the setting object in the user `settings.json` file.
 * * Store the editor background color in the user `settings.json` file under `workbench.colorCustomizations`.
 * * Activate the modified theme.
 */
export async function loadStudioColors(languageServerExt: vscode.Extension<any> | undefined): Promise<void> {
  // Check that we're on windows
  if (process.platform != "win32") {
    vscode.window.showErrorMessage("Loading Studio syntax colors is only supported on Windows.", "Dismiss");
    return;
  }
  // Check that the Language Server is installed
  if (!languageServerExt) {
    vscode.window.showErrorMessage(
      "Loading Studio syntax colors requires the [InterSystems Language Server extension](https://marketplace.visualstudio.com/items?itemName=${extId}).",
      "Dismiss"
    );
    return;
  }
  vscode.window
    .withProgress<void>(
      {
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: "Loading Studio syntax colors",
      },
      async (): Promise<void> => {
        // Make sure Language Server is active
        if (!languageServerExt.isActive) {
          await languageServerExt.activate();
        }
        // Get the semantic tokens legend from the Language Server
        // NOTE: The `vscode.provideDocumentSemanticTokensLegend` command requires the URI of an open document
        // as an argument. To ensure that color loading works regardless of what workspace (if any) is open,
        // I create, open and then delete a temporary MAC routine in a folder that is known to exist so the
        // command always has a file to work with.
        const tempRoutineUri = vscode.Uri.file(
          `${process.env.APPDATA}\\Code${vscode.env.appName.includes("Insiders") ? " - Insiders" : ""}\\User\\temp.mac`
        );
        await vscode.workspace.fs.writeFile(tempRoutineUri, new TextEncoder().encode("ROUTINE temp\n"));
        await vscode.workspace.openTextDocument(tempRoutineUri);
        let legend: vscode.SemanticTokensLegend = await vscode.commands
          .executeCommand<vscode.SemanticTokensLegend>("vscode.provideDocumentSemanticTokensLegend", tempRoutineUri)
          // Swallow any errors
          .then(
            (result) => result,
            () => undefined
          );
        if (!legend) {
          // The Language Server might be active but not ready for requests yet
          // Attempt to get the legend 10 more times at 100 ms intervals
          let numAttempts = 0;
          await new Promise<void>((resolve) => {
            const interval = setInterval(async () => {
              numAttempts++;
              if (numAttempts > 10) {
                clearInterval(interval);
                resolve();
              }
              legend = await vscode.commands
                .executeCommand<vscode.SemanticTokensLegend>(
                  "vscode.provideDocumentSemanticTokensLegend",
                  tempRoutineUri
                )
                // Swallow any errors
                .then(
                  (result) => result,
                  () => undefined
                );
              if (legend) {
                clearInterval(interval);
                resolve();
              }
            }, 100);
          });
        }
        await vscode.workspace.fs.delete(tempRoutineUri, { useTrash: false });
        if (!legend) {
          // This shouldn't happen since we already activated the Language Server
          throw "Failed to get the SemanticTokensLegend from the Language Server extension. Check that it is installed and active.";
        }
        // Find the index of first token for each language in the legend
        const languageOffsets: { [index: number]: number } = {};
        legend.tokenTypes.forEach((token, index) => {
          const [lang, attr] = token.split("_");
          if (attr == "Error") {
            languageOffsets[languages[lang]] = index;
          }
        });
        // Read Studio syntax colors from Windows registry and build the rules object
        let editorBackground = "";
        const rules = {};
        const sep = "    ";
        const langRegex = /^Language(1?[0-9])$/;
        const regKey = "HKEY_CURRENT_USER\\SOFTWARE\\InterSystems\\Cache Studio\\Editor";
        const regData: string = await runCmd(`reg query "${regKey}" /s`);
        let currentLanguage = -1;
        let currentTokenBackground = "";
        for (const line of regData.split("\r\n")) {
          const lineTrim = line.trim();
          if (lineTrim.length == 0) {
            // Skip empty lines
            continue;
          }
          if (!line.startsWith(" ")) {
            // This is a header line so check if it's the start of a Language
            const langMatch = lineTrim.split("\\").pop().match(langRegex);
            if (langMatch != null) {
              currentLanguage = Number(langMatch[1]);
            }
          } else {
            const lineArr = lineTrim.split(sep);
            if (lineArr.length == 3) {
              if (currentLanguage == -1) {
                // Check if this line contains the background color
                if (lineArr[0] == "Background Color") {
                  editorBackground = registryToCSS(lineArr[2]);
                }
              } else {
                // Check if this language is one that we provide tokens for
                if (languageOffsets[currentLanguage] != undefined) {
                  // In the reg query result, the background color always immediately precedes the foreground color
                  if (lineArr[0].startsWith("B")) {
                    // This is a background color
                    currentTokenBackground = lineArr[2];
                  } else {
                    // This is a foreground color
                    const attr = Number(lineArr[0].split(" ").pop());
                    if (
                      // The background color is the default
                      currentTokenBackground == "0x80000005" &&
                      // The foreground color is NOT the default
                      lineArr[2] != "0x80000008" &&
                      // The token isn't whitespace
                      ![1, 2].includes(attr)
                    ) {
                      // Store the color in our rules
                      const token = legend.tokenTypes[languageOffsets[currentLanguage] + attr];
                      if (token != undefined) {
                        rules[token] = registryToCSS(lineArr[2]);
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Determine which theme we should modify and activate
        const darkLight =
          0.2126 * Number(`0x${editorBackground.slice(1, 3)}`) +
            0.7152 * Number(`0x${editorBackground.slice(3, 5)}`) +
            0.0722 * Number(`0x${editorBackground.slice(5)}`) <
          128
            ? "Dark"
            : "Light";
        const themeName = `InterSystems Default ${darkLight}${
          gte(languageServerExt.packageJSON.version, "2.4.0") ? " Modern" : ""
        }`;

        // Modify the theme
        const editorConfig = vscode.workspace.getConfiguration("editor");
        const workbenchConfig = vscode.workspace.getConfiguration("workbench");
        const tokensConfig = editorConfig.get("semanticTokenColorCustomizations");
        tokensConfig[`[${themeName}]`] = { rules };
        await editorConfig.update("semanticTokenColorCustomizations", tokensConfig, true);
        const colorsConfig = workbenchConfig.get("colorCustomizations");
        colorsConfig[`[${themeName}]`] = { "editor.background": editorBackground };
        await workbenchConfig.update("colorCustomizations", colorsConfig, true);

        // Activate it globally
        await workbenchConfig.update("colorTheme", themeName, true);
      }
    )
    .then(
      () => {
        // Report success
        vscode.window
          .showInformationMessage(
            "Successfully loaded Studio syntax colors into User Settings.",
            "Open Settings",
            "Dismiss"
          )
          .then((answer) => {
            if (answer == "Open Settings") {
              vscode.commands.executeCommand("workbench.action.openSettingsJson");
            }
          });
      },
      (error) => {
        outputChannel.appendLine(
          typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
        );
        vscode.window.showErrorMessage(
          "An error occurred while loading Studio syntax colors. Check 'ObjectScript' Output channel for details.",
          "Dismiss"
        );
      }
    );
}
