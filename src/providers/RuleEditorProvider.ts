import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { compile, loadChanges } from "../commands/compile";
import { cspAppsForUri, CurrentFile, currentFile, outputChannel } from "../utils";

/**
 * The URI strings for all documents that are open in a custom editor.
 */
export const openCustomEditors: string[] = [];

export class RuleEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly _webapp: string = "/ui/interop/rule-editor";

  private static _errorMessage(message: string) {
    return vscode.window
      .showErrorMessage(message, {
        modal: true,
        detail: "Please re-open this file using VS Code's default text editor.",
      })
      .then(() => vscode.commands.executeCommand<void>("workbench.action.reopenWithEditor"));
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    // Check that document is a class
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
    // Check the server has the webapp for the angular rule editor
    if (!cspAppsForUri(document.uri).includes(RuleEditorProvider._webapp)) {
      return RuleEditorProvider._errorMessage("The server does not support the Angular Rule Editor.");
    }
    // Check that class exists on the server and is a rule class
    const queryData = await api.actionQuery("SELECT Super FROM %Dictionary.ClassDefinition WHERE Name = ?", [
      className,
    ]);
    if (
      queryData.result.content.length &&
      !queryData.result.content[0].Super.split(",").includes("Ens.Rule.Definition")
    ) {
      // Class exists but is not a rule class
      return RuleEditorProvider._errorMessage(`${file.name} is not a rule definition class.`);
    } else if (queryData.result.content.length == 0) {
      // Class doesn't exist on the server
      return RuleEditorProvider._errorMessage(`${file.name} does not exist on the server.`);
    }

    // Add this document to the array of open custom editors
    openCustomEditors.push(document.uri.toString());

    // const targetOrigin = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port};
    // const iframeUri = `${targetOrigin}${api.config.pathPrefix}${RuleEditorProvider._webapp}/index.html?VSCODE=1&rule=${file.name.slice(0,-4)}`;
    const targetOrigin = `http://localhost:4202`;
    const iframeUri = `${targetOrigin}?VSCODE=1&rule=${className}`;
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
    let ignoreChanges = false;
    let documentWasDirty = false;
    let editorCompatible = false;
    const contentDisposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (document.uri.toString() == e.document.uri.toString()) {
        if (e.reason == vscode.TextDocumentChangeReason.Undo) {
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
        } else if (e.reason == vscode.TextDocumentChangeReason.Redo) {
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
        } else if (!ignoreChanges && !e.document.isDirty && documentWasDirty) {
          // User reverted the file
          webviewPanel.webview.postMessage({
            direction: "editor",
            type: "revert",
          });
        }
        documentWasDirty = e.document.isDirty;
      }
    });
    const saveDisposable = vscode.workspace.onDidSaveTextDocument((td) => {
      if (document.uri.toString() == td.uri.toString()) {
        // User saved the file
        webviewPanel.webview.postMessage({
          direction: "editor",
          type: "save",
        });
      }
    });
    webviewPanel.webview.onDidReceiveMessage((e) => {
      switch (e.type) {
        case "compatible":
          editorCompatible = true;
          return;
        case "badrule":
          RuleEditorProvider._errorMessage(e.reason);
          return;
        case "loaded":
          if (!editorCompatible) {
            RuleEditorProvider._errorMessage("This server's Angular Rule Editor is not supported in VS Code.");
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
          if (e.dirty) {
            // Make a trivial edit so the document appears dirty
            const edit = new vscode.WorkspaceEdit();
            edit.insert(document.uri, document.lineAt(document.lineCount - 1).range.end, " ");
            vscode.workspace.applyEdit(edit);
          } else {
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
            // Compile the class, which automatically loads any changes
            compile([file]);
          } else {
            // Just load changes
            loadChanges([file]);
          }
          return;
      }
    });
    webviewPanel.onDidDispose(() => {
      contentDisposable.dispose();
      saveDisposable.dispose();
      if (document.isDirty) {
        // Revert so document is clean
        vscode.commands.executeCommand("workbench.action.files.revert");
      }
      const idx = openCustomEditors.findIndex((e) => e == document.uri.toString());
      if (idx >= 0) {
        // Remove this document from the array of open custom editors
        openCustomEditors.splice(idx, 1);
      }
    });
  }
}

interface BplDoc extends CurrentFile {
  dispose: () => {
    // Nothing to dispose
  };
}

export class BplEditorProvider implements vscode.CustomEditorProvider {
  private _panel: vscode.WebviewPanel;
  private static readonly _title: string = "Business Process Designer";
  //private static readonly _urlPath: string = "/csp/interop/EnsPortal.BPLEditor.zen";

  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<BplDoc> {
    // Ignore the context because we don't support backing up unpersisted changes
    return vscode.workspace.openTextDocument(uri).then((doc) => <BplDoc>currentFile(doc));
  }

  resolveCustomEditor(
    document: BplDoc,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    // TODO: Validate that this document is a rule class and that the angular rule editor is present?
    // TODO: If validation fails, show an error message insteadof iframe?

    // Resolve a server connection for this class
    const api = new AtelierAPI(document.uri);
    // if (!api.active) {
    //   vscode.window.showErrorMessage(`The ${this._title} requires an active server connection.`, "Dismiss");
    //   return;
    // }

    // Do this ourself instead of using our new getCSPToken wrapper function, because that function reuses tokens which causes issues with
    // webview when server is 2020.1.1 or greater, as session cookie scope is typically Strict, meaning that the webview
    // cannot store the cookie. Consequence is web sessions may build up (they get a 900 second timeout)
    api
      .actionQuery("select %Atelier_v1_Utils.General_GetCSPToken(?) token", ["/ui/interop/rule-editor/index.html"]) //BplEditorProvider._urlPath])
      .then((tokenObj) => {
        const csptoken = tokenObj.result.content[0].token;
        // const editorUrl = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
        //   api.config.pathPrefix
        // }${BplEditorProvider._urlPath}?BP=${document.name.slice(0, -4)}.BPL&CSPCHD=${csptoken}&CSPSHARE=1&STUDIO=1`;
        const editorUrl = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
          api.config.pathPrefix
        }/ui/interop/rule-editor/index.html?$NAMESPACE=INTEROP&rule=User.myrule&CSPCHD=${csptoken}&CSPSHARE=1`;
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
          <iframe id="editor" title="${BplEditorProvider._title}" src="${editorUrl}" width="100%" height="100%" frameborder="0"></iframe>
        </div>
        <script>
          const vscode = acquireVsCodeApi();

          window.onload = (event) => {
            // Tell VS Code to check if the editor is compatible
            vscode.postMessage({loaded: true});
          }

          var port;
          window.onmessage = (event) => {
            const data = event.data;
            const iframe = document.getElementById('editor').contentWindow;
            if (data.direction === "toEditor") {
              if (data.usePort === true) {
                port.postMessage(event.data);
                port = null;
              } else {
                iframe.postMessage(data, '*');
              }
            }
            else if (data.direction === "toVSCode") {
              vscode.postMessage(data);
              if (data.usePort === true) {
                port = event.ports[0];
              }
            }
          }
        </script>
        </body>
        </html>
        `;
      });

    let pageCompatible = false;
    webviewPanel.webview.onDidReceiveMessage((message) => {
      if (message.confirm) {
        vscode.window
          .showWarningMessage(message.confirm, { modal: true }, "OK")
          .then((answer) =>
            webviewPanel.webview.postMessage({ direction: "toEditor", answer: answer === "OK", usePort: true })
          );
      } else if (message.alert) {
        vscode.window.showWarningMessage(message.alert, { modal: true }, "Dismiss");
      } else if (message.vscodeCompatible === true) {
        pageCompatible = true;
      } else if (message.saveError) {
        vscode.window.showErrorMessage(message.saveError, "Dismiss");
      } else if (message.infoMessage) {
        vscode.window.showInformationMessage(message.infoMessage, "Dismiss");
      } else if (message.saved) {
        if (vscode.workspace.getConfiguration("objectscript", document.uri).get<boolean>("compileOnSave")) {
          // Compile the document, which automatically loads any changes
          compile([document]);
        } else {
          // Just load changes
          loadChanges([document]);
        }
      } else if (message.loaded) {
        if (!pageCompatible) {
          vscode.window
            .showErrorMessage(
              `This server's ${BplEditorProvider._title} is not supported in VS Code.`,
              {
                modal: true,
                detail: "Please re-open this file using VS Code's default text editor.",
              },
              "Dismiss"
            )
            .then(() => vscode.commands.executeCommand("workbench.action.reopenWithEditor"));
        }
      }
    });

    this._panel = webviewPanel;
  }

  async saveCustomDocument(document: BplDoc, cancellation: vscode.CancellationToken): Promise<void> {
    // Send a message to the webview to trigger a save
    outputChannel.appendLine(`called save on ${document.uri.toString(true)}`);
    return this._panel.webview.postMessage({ direction: "toEditor", save: 1 }).then(() => {
      // Do nothing because return type is void
      // Somehow wait to return until save response message is sent?
    });
  }

  async revertCustomDocument(document: BplDoc, cancellation: vscode.CancellationToken): Promise<void> {
    // Send a message to the webview to trigger an iframe reload
    return this._panel.webview.postMessage({ direction: "toEditor", reload: 1 }).then(() => {
      // Do nothing because return type is void
    });
  }

  saveCustomDocumentAs(
    document: BplDoc,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Thenable<void> {
    throw `Save As is not supported for the ${BplEditorProvider._title}.`;
  }

  backupCustomDocument(
    document: BplDoc,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Thenable<vscode.CustomDocumentBackup> {
    // Return a meaningless value because the document will never be "dirty" and therefore will not have anything to back up
    return Promise.resolve({
      id: "",
      delete: () => {
        // Nothing to delete
      },
    });
  }

  // This will never be fired
  onDidChangeCustomDocument: vscode.Event<vscode.CustomDocumentContentChangeEvent<BplDoc>>;
}
