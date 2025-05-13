import * as vscode from "vscode";
import path = require("path");
import { config, OBJECTSCRIPTXML_FILE_SCHEMA, xmlContentProvider } from "../extension";
import { AtelierAPI } from "../api";
import { replaceFile, fileExists, getWsFolder, handleError, notIsfs, outputChannel } from "../utils";
import { getFileName } from "./export";

const exportHeader = /^\s*<Export generator="(Cache|IRIS)" version="\d+"/;

export async function previewXMLAsUDL(textEditor: vscode.TextEditor, auto = false): Promise<void> {
  const uri = textEditor.document.uri;
  const content = textEditor.document.getText();
  if (notIsfs(uri) && uri.path.toLowerCase().endsWith("xml") && textEditor.document.lineCount > 2) {
    if (exportHeader.test(textEditor.document.lineAt(1).text)) {
      const api = new AtelierAPI(uri);
      if (!api.active) {
        vscode.window.showErrorMessage(
          "Unsuccessful connection to the server. Please check your server connection settings.",
          "Dismiss"
        );
        return;
      }
      try {
        // Convert the file
        const udlDocs: { name: string; content: string[] }[] = await api
          .cvtXmlUdl(content)
          .then((data) => data.result.content);
        if (udlDocs.length == 0) {
          vscode.window.showErrorMessage(
            `File '${uri.toString(true)}' contains no documents that can be previewed.`,
            "Dismiss"
          );
          return;
        }
        // Prompt the user for documents to preview
        const docsToPreview = await vscode.window.showQuickPick(
          udlDocs.map((d) => {
            return { label: d.name, picked: true };
          }),
          {
            canPickMany: true,
            title: "Select the documents to preview",
          }
        );
        if (docsToPreview == undefined || docsToPreview.length == 0) {
          return;
        }
        const docWhitelist = docsToPreview.map((d) => d.label);
        // Send the UDL text to the content provider
        xmlContentProvider.addUdlDocsForFile(uri.toString(), udlDocs);
        // Open the files
        for (const udlDoc of udlDocs) {
          if (!docWhitelist.includes(udlDoc.name)) continue; // This file wasn't selected
          // await for response so we know when it's safe to clear the provider's cache
          await vscode.window
            .showTextDocument(
              vscode.Uri.from({
                path: udlDoc.name,
                fragment: uri.toString(),
                scheme: OBJECTSCRIPTXML_FILE_SCHEMA,
              }),
              {
                preserveFocus: true,
                preview: false,
                viewColumn: vscode.ViewColumn.Beside,
              }
            )
            .then(
              () => {
                // Don't need return value
              },
              () => {
                // Swallow errors
              }
            );
        }
        // Remove the UDL text from the content provider's cache
        xmlContentProvider.removeUdlDocsForFile(uri.toString());
      } catch (error) {
        handleError(error, "Error executing 'Preview XML as UDL' command.");
      }
    } else if (!auto) {
      vscode.window.showErrorMessage(`XML file '${uri.toString(true)}' is not an InterSystems export.`, "Dismiss");
    }
  }
}

/** Extract the source documents in an XML file as UDL and create the UDL files using the export settings. */
export async function extractXMLFileContents(xmlUri?: vscode.Uri): Promise<void> {
  if (!xmlUri && vscode.window.activeTextEditor) {
    // Check if the active text editor contains an XML file
    const activeDoc = vscode.window.activeTextEditor.document;
    if (notIsfs(activeDoc.uri) && activeDoc.uri.path.toLowerCase().endsWith("xml") && activeDoc.lineCount > 2) {
      // The active text editor contains an XML file, so process it
      xmlUri = activeDoc.uri;
    }
  }
  try {
    // Determine the workspace folder
    let wsFolder: vscode.WorkspaceFolder;
    if (xmlUri) {
      wsFolder = vscode.workspace.getWorkspaceFolder(xmlUri);
    } else {
      // Use the server connection from a workspace folder
      wsFolder = await getWsFolder("Pick the workspace folder to run the command in", false, false, true, true);
      if (!wsFolder) {
        if (wsFolder === undefined) {
          // Strict equality needed because undefined == null
          vscode.window.showErrorMessage(
            "'Extract Documents from XML File...' command requires a non-isfs workspace folder with an active server connection.",
            "Dismiss"
          );
        }
        return;
      }
    }
    if (!wsFolder) return;
    const api = new AtelierAPI(wsFolder.uri);
    if (!xmlUri) {
      // Prompt the user the file to extract
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Extract",
        filters: {
          "XML Files": ["xml"],
        },
        defaultUri: wsFolder.uri,
      });
      if (!Array.isArray(uris) || uris.length == 0) {
        // No file to extract
        return;
      }
      xmlUri = uris[0];
      if (xmlUri.path.split(".").pop().toLowerCase() != "xml") {
        vscode.window.showErrorMessage("The selected file was not XML.", "Dismiss");
        return;
      }
    }
    // Read the XML file
    const xmlContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(xmlUri)).split(/\r?\n/);
    if (xmlContent.length < 3 || !exportHeader.test(xmlContent[1])) {
      vscode.window.showErrorMessage(`XML file '${xmlUri.toString(true)}' is not an InterSystems export.`, "Dismiss");
      return;
    }
    // Convert the file
    const udlDocs: { name: string; content: string[] }[] = await api
      .cvtXmlUdl(xmlContent.join("\n"))
      .then((data) => data.result.content);
    if (udlDocs.length == 0) {
      vscode.window.showErrorMessage(
        `File '${xmlUri.toString(true)}' contains no documents that can be extracted.`,
        "Dismiss"
      );
      return;
    }
    // Prompt the user for documents to extract
    const docsToExtract = await vscode.window.showQuickPick(
      udlDocs.map((d) => {
        return { label: d.name, picked: true };
      }),
      {
        canPickMany: true,
        ignoreFocusOut: true,
        title: "Pick the documents to extract",
        placeHolder: "Files are created using your 'objectscript.export' settings",
      }
    );
    if (docsToExtract == undefined || docsToExtract.length == 0) {
      return;
    }
    const docWhitelist = docsToExtract.map((d) => d.label);
    // Write the UDL files
    const { atelier, folder, addCategory, map } = config("export", wsFolder.name);
    const rootFolder =
      wsFolder.uri.path + (typeof folder == "string" && folder.length ? `/${folder.replaceAll(path.sep, "/")}` : "");
    let errs = 0;
    for (const udlDoc of udlDocs) {
      if (!docWhitelist.includes(udlDoc.name)) continue; // This file wasn't selected
      const fileUri = wsFolder.uri.with({ path: getFileName(rootFolder, udlDoc.name, atelier, addCategory, map, "/") });
      if (await fileExists(fileUri)) {
        outputChannel.appendLine(`File '${fileUri.toString(true)}' already exists.`);
        errs++;
        continue;
      }
      try {
        await replaceFile(fileUri, udlDoc.content);
      } catch (error) {
        outputChannel.appendLine(
          typeof error == "string" ? error : error instanceof Error ? error.toString() : JSON.stringify(error)
        );
        errs++;
      }
    }
    if (errs) {
      vscode.window.showErrorMessage(
        `Failed to write ${errs} file${errs > 1 ? "s" : ""}. Check the 'ObjectScript' Output channel for details.`,
        "Dismiss"
      );
    }
  } catch (error) {
    handleError(error, "Error executing 'Extract Documents from XML File...' command.");
  }
}
