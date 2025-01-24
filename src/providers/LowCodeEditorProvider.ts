import * as vscode from "vscode";
import { lt } from "semver";
import { AtelierAPI } from "../api";
import { loadChanges } from "../commands/compile";
import { StudioActions } from "../commands/studio";
import { clsLangId } from "../extension";
import { currentFile, openCustomEditors, outputChannel } from "../utils";

export class LowCodeEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly _rule: string = "/ui/interop/rule-editor";
  private readonly _dtl: string = "/ui/interop/dtl-editor";

  private _errorMessage(detail: string) {
    return vscode.window
      .showErrorMessage("Cannot open Low-Code Editor.", {
        modal: true,
        detail,
      })
      .then(() => vscode.commands.executeCommand<void>("workbench.action.reopenTextEditor"));
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Check that document is a clean, well-formed class
    if (document.languageId != clsLangId) {
      return this._errorMessage(`${document.fileName} is not a class.`);
    }
    if (document.isUntitled) {
      return this._errorMessage(`${document.fileName} is untitled.`);
    }
    if (document.isDirty) {
      return this._errorMessage(`${document.fileName} is dirty.`);
    }
    const file = currentFile(document);
    if (!file) {
      return this._errorMessage(`${document.fileName} is a malformed class definition.`);
    }
    if (!vscode.workspace.fs.isWritableFileSystem(document.uri.scheme)) {
      return this._errorMessage(`File system '${document.uri.scheme}' is read-only.`);
    }

    const className = file.name.slice(0, -4);
    const api = new AtelierAPI(document.uri);
    if (!api.active) {
      return this._errorMessage("Server connection is not active.");
    }
    if (lt(api.config.serverVersion, "2023.1.0")) {
      return this._errorMessage(
        "Opening a low-code editor in VS Code requires InterSystems IRIS version 2023.1 or above."
      );
    }

    // Check that the class exists on the server and is a rule or DTL class
    let webApp: string;
    const queryData = await api.actionQuery(
      "SELECT $LENGTH(rule.Name) AS Rule, $LENGTH(dtl.Name) AS DTL " +
        "FROM %Dictionary.ClassDefinition AS dcd " +
        "LEFT OUTER JOIN %Dictionary.ClassDefinition_SubclassOf('Ens.Rule.Definition') AS rule ON dcd.Name = rule.Name " +
        "LEFT OUTER JOIN %Dictionary.ClassDefinition_SubclassOf('Ens.DataTransformDTL') AS dtl ON dcd.Name = dtl.Name " +
        "WHERE dcd.Name = ?",
      [className]
    );
    if (queryData.result.content.length == 0) {
      // Class doesn't exist on the server
      return this._errorMessage(`${file.name} does not exist on the server.`);
    } else if (queryData.result.content[0].Rule) {
      webApp = this._rule;
    } else if (queryData.result.content[0].DTL) {
      if (lt(api.config.serverVersion, "2025.1.0")) {
        return this._errorMessage(
          "Opening the DTL editor in VS Code requires InterSystems IRIS version 2025.1 or above."
        );
      }
      webApp = this._dtl;
    } else {
      // Class exists but is not a rule or DTL class
      return this._errorMessage(`${className} is neither a rule definition class nor a DTL transformation class.`);
    }

    // Add this document to the array of open custom editors
    const documentUriString = document.uri.toString();
    openCustomEditors.push(documentUriString);

    // Initialize the webview
    const targetOrigin = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}`;
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
        <iframe id="editor" title="Low-Code Editor" src="${targetOrigin}${api.config.pathPrefix}${webApp}/index.html?$NAMESPACE=${api.config.ns.toUpperCase()}&VSCODE=1&${
          webApp == this._rule ? "rule" : "DTL"
        }=${className}" width="100%" height="100%" frameborder="0"></iframe>
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
        case "baddtl":
          this._errorMessage(event.reason);
          return;
        case "loaded":
          if (!editorCompatible) {
            this._errorMessage("This low-code editor does not support embedding in VS Code.");
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
