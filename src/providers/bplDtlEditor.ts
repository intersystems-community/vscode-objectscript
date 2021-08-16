import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { currentFile } from "../utils/index";
import { DocumentContentProvider } from "./DocumentContentProvider";
import { loadChanges } from "../commands/compile";
import { Response } from "../api/atelier";

// Custom text documents cannot be accessed through vscode.window.activeTextEditor
// so they must be kept track of manually for the view other command
export let currentBplDtlClassDoc: vscode.TextDocument = null;

async function saveBplDtl(content: string[], doc: vscode.TextDocument): Promise<Response<any>> {
  const api = new AtelierAPI(doc.uri);
  const displayName = doc.fileName.slice(1);
  return vscode.window.withProgress(
    {
      cancellable: false,
      location: vscode.ProgressLocation.Notification,
      title: "Compiling: " + displayName,
    },
    () =>
      api.putDoc(
        displayName,
        {
          enc: false,
          content,
          mtime: -1,
        },
        true
      )
  );
}

export class BplDtlEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(): vscode.Disposable {
    const provider = new BplDtlEditorProvider();
    const providerRegistration = vscode.window.registerCustomEditorProvider(BplDtlEditorProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    });
    return providerRegistration;
  }

  public static readonly viewType = "vscode-objectscript.bplDtlEditor";

  private isDirty: boolean;

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const url = await this.getUrl(document);
    if (!url) return;

    const type = document.fileName.substring(document.fileName.length - 3);
    const clsName = document.fileName.substring(1, document.fileName.length - 4) + ".cls";
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const clsUri = DocumentContentProvider.getUri(clsName, workspaceFolder?.name);
    const clsDoc = await vscode.workspace.openTextDocument(clsUri);
    if (!clsDoc) {
      vscode.window.showErrorMessage("The class " + clsName + " could not be found.");
      return;
    }
    const clsFile = currentFile(clsDoc);
    let pageCompatible = false;
    let savedInCls = false;
    this.isDirty = document.isDirty;

    // Webview settings
    webviewPanel.webview.html = this.getHtmlForWebview(url);
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    if (webviewPanel.active) {
      currentBplDtlClassDoc = clsDoc;
    }

    webviewPanel.onDidChangeViewState(async (event) => {
      if (event.webviewPanel.active) {
        currentBplDtlClassDoc = clsDoc;
      }
    });

    // Setup webview to communicate with the iframe
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.confirm) {
        const answer = await vscode.window.showWarningMessage(message.confirm, { modal: true }, "OK");
        webviewPanel.webview.postMessage({ direction: "toEditor", answer: answer === "OK", usePort: true });
      } else if (message.alert) {
        await vscode.window.showWarningMessage(message.alert, { modal: true });
      } else if (message.modified !== undefined) {
        if (message.modified === true && !this.isDirty) {
          this.isDirty = true;
          this.dummyEdit(document);
        } else if (message.modified === false && this.isDirty) {
          this.isDirty = false;
          // sometimes the page reports modified true then false immediately, a timeout is required for that to succeed
          setTimeout(() => vscode.commands.executeCommand("undo"), 100);
        }
      } else if (message.vscodeCompatible === true) {
        pageCompatible = true;
      } else if (message.saveError) {
        vscode.window.showErrorMessage(message.saveError);
      } else if (message.infoMessage) {
        vscode.window.showInformationMessage(message.infoMessage);
      } else if (message.xml) {
        saveBplDtl([message.xml], document).then((response) => {
          if (response.result.status === "") {
            loadChanges([clsFile]);
          }
        });
      } else if (message.loaded) {
        if (!pageCompatible) {
          vscode.window.showErrorMessage(
            `This ${type.toUpperCase()} editor is not compatible with VSCode. See (TODO) to setup VSCode compatibility.`
          );
        }
      } else if (message.viewOther) {
        vscode.commands.executeCommand("vscode-objectscript.viewOthers");
      }
    });

    webviewPanel.onDidChangeViewState(async (e) => {
      const active = e.webviewPanel.active;
      if (active && savedInCls) {
        let shouldReload = true;
        if (this.isDirty) {
          const answer = await vscode.window.showWarningMessage(
            "This file has been changed, would you like to reload it?",
            { modal: true },
            "Yes",
            "No"
          );
          shouldReload = answer === "Yes";
        }

        if (shouldReload) {
          vscode.commands.executeCommand("undo");
          this.isDirty = false;

          webviewPanel.webview.postMessage({ direction: "toEditor", reload: 1 });
          savedInCls = false;
        }
      }
    });

    const saveDocumentSubscription = vscode.workspace.onDidSaveTextDocument((doc) => {
      // send a message to the iframe to reload the editor
      if (doc.uri.toString() === clsUri.toString()) {
        savedInCls = true;
      } else if (doc.uri.toString() === document.uri.toString()) {
        console.log("telling editor to save");
        webviewPanel.webview.postMessage({ direction: "toEditor", save: 1 });
      }
    });

    webviewPanel.onDidDispose(() => saveDocumentSubscription.dispose());
  }

  private getHtmlForWebview(url: URL): string {
    /*
      This webview has an iframe pointing to the correct URL and manages messages between
      VS Code and the iframe.
    */
    return `
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
        <iframe src="${url.toString()}" id="editor" width="100%" height="100%" frameborder="0"></iframe>
        <script>
          (function() {
            const vscode = acquireVsCodeApi();

            // after loading send a message to check for compatibility
            window.onload = (event) => {
              vscode.postMessage({loaded: true});
            }

            // message passing, this code is in between vscode and the zen page, must pass to both
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
          }())
        </script>
      </body>
      </html>
      `;
  }

  private async getUrl(document: vscode.TextDocument): Promise<URL> {
    // the url should be the first line of the file
    const firstLine = document.getText(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)));
    const strippedUri = firstLine.split("&STUDIO=")[0];

    const api = new AtelierAPI(document.uri);
    const { https, host, port, pathPrefix } = api.config;
    const url = new URL(`${https ? "https" : "http"}://${host}:${port}${pathPrefix}${strippedUri}`);

    // add studio mode and a csptoken to the url
    url.searchParams.set("STUDIO", "1");
    url.searchParams.set("CSPSHARE", "1");
    const response = await api.actionQuery("select %Atelier_v1_Utils.General_GetCSPToken(?) csptoken", [strippedUri]);
    const csptoken = response.result.content[0].csptoken;
    url.searchParams.set("CSPCHD", csptoken);

    return url;
  }

  /// Make an edit to indicate unsaved changes
  /// Only applies to the underlying document of the BPL/DTL file not the CLS file
  private async dummyEdit(document: vscode.TextDocument) {
    if (document.isDirty) return;

    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1));

    const insertEdit = new vscode.WorkspaceEdit();
    insertEdit.insert(document.uri, range.start, " ");
    await vscode.workspace.applyEdit(insertEdit);
  }
}
