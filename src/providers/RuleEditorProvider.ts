import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { loadChanges } from "../commands/compile";
import { StudioActions } from "../commands/studio";
import { cspApps } from "../extension";
import { currentFile, outputChannel } from "../utils";

/**
 * The URI strings for all documents that are open in a custom editor.
 */
export const openCustomEditors: string[] = [];

export class RuleEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly _webapp: string = "/ui/interop/rule-editor";

  private static _errorMessage(detail: string) {
    return vscode.window
      .showErrorMessage("Cannot open Rule Editor.", {
        modal: true,
        detail,
      })
      .then(() => vscode.commands.executeCommand<void>("workbench.action.toggleEditorType"));
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Check that document is a clean, well-formed class
    if (document.languageId != "objectscript-class") {
      return RuleEditorProvider._errorMessage(`${document.fileName} is not a class.`);
    }
    if (document.isUntitled) {
      return RuleEditorProvider._errorMessage(`${document.fileName} is untitled.`);
    }
    if (document.isDirty) {
      return RuleEditorProvider._errorMessage(`${document.fileName} is dirty.`);
    }
    const file = currentFile(document);
    if (file == null) {
      return RuleEditorProvider._errorMessage(`${document.fileName} is a malformed class definition.`);
    }

    const className = file.name.slice(0, -4);
    const api = new AtelierAPI(document.uri);
    const documentUriString = document.uri.toString();

    // Check that the server has the webapp for the angular rule editor
    const cspAppsKey = `${api.serverId}:%SYS`.toLowerCase();
    let sysCspApps: string[] | undefined = cspApps.get(cspAppsKey);
    if (sysCspApps == undefined) {
      sysCspApps = await api.getCSPApps(false, "%SYS").then((data) => data.result.content || []);
      cspApps.set(cspAppsKey, sysCspApps);
    }
    if (!sysCspApps.includes(RuleEditorProvider._webapp)) {
      return RuleEditorProvider._errorMessage(`Server '${api.serverId}' does not support the Angular Rule Editor.`);
    }

    // Check that the class exists on the server and is a rule class
    const queryData = await api.actionQuery("SELECT Super FROM %Dictionary.ClassDefinition WHERE Name = ?", [
      className,
    ]);
    if (
      queryData.result.content.length &&
      !queryData.result.content[0].Super.split(",").includes("Ens.Rule.Definition")
    ) {
      // Class exists but is not a rule class
      return RuleEditorProvider._errorMessage(`${className} is not a rule definition class.`);
    } else if (queryData.result.content.length == 0) {
      // Class doesn't exist on the server
      return RuleEditorProvider._errorMessage(`Class ${className} does not exist on the server.`);
    }

    // Add this document to the array of open custom editors
    openCustomEditors.push(documentUriString);

    // Initialize the webview
    const targetOrigin = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}`;
    const iframeUri = `${targetOrigin}${api.config.pathPrefix}${
      RuleEditorProvider._webapp
    }/index.html?$NAMESPACE=${api.config.ns.toUpperCase()}&VSCODE=1&rule=${className}`;
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [],
    };
    webviewPanel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <style type="text/css">
        body, html {
          margin: 0; padding: 0; height: 100%; overflow: hidden;
          background-color: white;
        }
        #content {
          position:absolute; left: 0; right: 0; bottom: 0; top: 0px;
        }
      </style>
      </head>
      <body>
      <div id="content">
        <iframe id="editor" title="Rule Editor" src="${iframeUri}" width="100%" height="100%" frameborder="0"></iframe>
      </div>
      <script>
        (function() {
          const vscode = acquireVsCodeApi();
          const iframe = document.getElementById('editor');

          iframe.onload = () => {
            // Tell VS Code to check if the editor is compatible
            vscode.postMessage({ type: "loaded" });
          }

          window.onmessage = (event) => {
            const data = event.data;
            if (data.direction == 'editor') {
              iframe.contentWindow.postMessage(data, '${targetOrigin}');
            }
            else if (data.direction == 'vscode') {
              vscode.postMessage(data);
            }
          }
        }())
      </script>
      </body>
      </html>
      `;

    // Initialize event handlers
    let ignoreChanges = false;
    let documentWasDirty = false;
    let editorCompatible = false;
    const contentDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
      if (documentUriString == event.document.uri.toString()) {
        if (event.reason == vscode.TextDocumentChangeReason.Undo) {
          if (ignoreChanges) {
            ignoreChanges = false;
          } else {
            // User invoked undo
            webviewPanel.webview.postMessage({
              direction: "editor",
              type: "undo",
            });
            ignoreChanges = true;
            vscode.commands.executeCommand("redo");
          }
        } else if (event.reason == vscode.TextDocumentChangeReason.Redo) {
          if (ignoreChanges) {
            ignoreChanges = false;
          } else {
            // User invoked redo
            webviewPanel.webview.postMessage({
              direction: "editor",
              type: "redo",
            });
            ignoreChanges = true;
            vscode.commands.executeCommand("undo");
          }
        } else if (!ignoreChanges && !event.document.isDirty && documentWasDirty) {
          // User reverted the file
          webviewPanel.webview.postMessage({
            direction: "editor",
            type: "revert",
          });
        }
        documentWasDirty = event.document.isDirty;
      }
    });
    const saveDisposable = vscode.workspace.onDidSaveTextDocument((savedDocument) => {
      if (documentUriString == savedDocument.uri.toString()) {
        // User saved the file
        webviewPanel.webview.postMessage({
          direction: "editor",
          type: "save",
        });
      }
    });
    webviewPanel.webview.onDidReceiveMessage((event) => {
      switch (event.type) {
        case "compatible":
          editorCompatible = true;
          return;
        case "badrule":
          RuleEditorProvider._errorMessage(event.reason);
          return;
        case "loaded":
          if (!editorCompatible) {
            RuleEditorProvider._errorMessage(
              "This server's Angular Rule Editor does not support embedding in VS Code."
            );
          } else {
            // Editor is compatible so send the credentials
            webviewPanel.webview.postMessage({
              direction: "editor",
              type: "auth",
              username: api.config.username,
              password: api.config.password,
            });
          }
          return;
        case "changed":
          if (event.dirty && !document.isDirty) {
            // Make a trivial edit so the document appears dirty
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, document.lineAt(document.lineCount - 1).range.end, " ");
            vscode.workspace.applyEdit(edit);
          } else if (!event.dirty && document.isDirty) {
            // Revert so document is clean
            ignoreChanges = true;
            vscode.commands.executeCommand("workbench.action.files.revert");
          }
          return;
        case "saved":
          if (document.isDirty) {
            // Revert so document is clean
            ignoreChanges = true;
            vscode.commands.executeCommand("workbench.action.files.revert");
          }
          if (vscode.workspace.getConfiguration("objectscript", document.uri).get<boolean>("compileOnSave")) {
            // User requests a post-save compile
            webviewPanel.webview.postMessage({
              direction: "editor",
              type: "compile",
            });
          } else {
            // Load changes
            loadChanges([file]);
          }
          return;
        case "compiled":
          if (document.isDirty) {
            // Revert so document is clean
            ignoreChanges = true;
            vscode.commands.executeCommand("workbench.action.files.revert");
          }
          // Load changes
          loadChanges([file]);
          return;
        case "userAction": {
          // Process the source control user action
          // Should only be action 2 (show web page)
          new StudioActions(document.uri).processUserAction(event.action).then((answer) => {
            if (answer) {
              api
                .actionQuery("SELECT * FROM %Atelier_v1_Utils.Extension_AfterUserAction(?,?,?,?,?)", [
                  "0",
                  event.id,
                  file.name,
                  answer,
                  "",
                ])
                .then((data) => {
                  if (data.result.content.length) {
                    const actionToProcess = data.result.content.pop();
                    if (actionToProcess.reload) {
                      // Revert so document is clean
                      ignoreChanges = true;
                      vscode.commands.executeCommand("workbench.action.files.revert");
                      // Tell the rule editor to reload
                      webviewPanel.webview.postMessage({
                        direction: "editor",
                        type: "revert",
                      });
                    }
                    if (actionToProcess.errorText !== "") {
                      outputChannel.appendLine(
                        `\nError executing AfterUserAction '${event.label}':\n${actionToProcess.errorText}`
                      );
                      outputChannel.show();
                    }
                  }
                })
                .catch((error) => {
                  outputChannel.appendLine(`\nError executing AfterUserAction '${event.label}':`);
                  if (error && error.errorText && error.errorText !== "") {
                    outputChannel.appendLine(error.errorText);
                  } else {
                    outputChannel.appendLine(
                      typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
                    );
                  }
                  outputChannel.show();
                });
            }
          });
          return;
        }
      }
    });
    webviewPanel.onDidDispose(() => {
      contentDisposable.dispose();
      saveDisposable.dispose();
      if (document.isDirty) {
        // Revert so document is clean
        vscode.commands.executeCommand("workbench.action.files.revert");
      }
      const idx = openCustomEditors.findIndex((elem) => elem == documentUriString);
      if (idx >= 0) {
        // Remove this document from the array of open custom editors
        openCustomEditors.splice(idx, 1);
      }
    });
  }
}
