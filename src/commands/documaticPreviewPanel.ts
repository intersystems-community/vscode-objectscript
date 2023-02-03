import * as vscode from "vscode";

/**
 * The schema of the message that gets sent to the webview.
 */
type WebviewMessage = {
  /** The element (class or class member) that we're previewing documentation for. */
  element: string;
  /** The documentation string for `element`. */
  desc: string;
  /** The uri of the class that we're previewing documentation for. */
  uri: string;
};

/**
 * Manages Class Documentation preview webviews.
 */
export class DocumaticPreviewPanel {
  /** The viewType for Class Documentation preview webviews. */
  private static readonly viewType = "isc-documatic-preview";

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  /** The `TextEditor` of the class document that we're previewing documentation for. */
  private _editor: vscode.TextEditor;

  /** The class definition `DocumentSymbol` for `_editor`. */
  private _rootSymbol: vscode.DocumentSymbol;

  /** The version of the `TextDocument` associated with `_editor` that `_rootSymbol` was calculated for. */
  private _symbolVersion: number;

  /**
   * Track the currently panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: DocumaticPreviewPanel | undefined;

  public static create(extensionUri: vscode.Uri): void {
    // Get the open document and check that it's an ObjectScript class
    const openEditor = vscode.window.activeTextEditor;
    if (openEditor === undefined) {
      // Need an open document to preview
      return;
    }
    const openDoc = openEditor.document;
    if (openDoc.languageId !== "objectscript-class") {
      // Documatic preview is for classes only
      return;
    }
    if (this.currentPanel !== undefined) {
      // Can only have one panel open at once
      if (!this.currentPanel._panel.visible) {
        // The open panel isn't visible, so show it
        this.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
      }
      return;
    }

    // Get the name of the current class
    let clsname = "";
    const match = openDoc.getText().match(/^[ \t]*Class[ \t]+(%?[\p{L}\d]+(?:\.[\p{L}\d]+)+)/imu);
    if (match) {
      [, clsname] = match;
    }
    if (clsname === "") {
      // The class is malformed so we can't preview it
      return;
    }

    // Get the full path to the folder containing our webview files
    const webviewFolderUri: vscode.Uri = vscode.Uri.joinPath(extensionUri, "webview");

    // Create the documatic preview webview
    const panel = vscode.window.createWebviewPanel(
      this.viewType,
      `Doc for ${clsname}.cls`,
      { preserveFocus: true, viewColumn: vscode.ViewColumn.Beside },
      {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [webviewFolderUri],
      }
    );

    this.currentPanel = new DocumaticPreviewPanel(panel, webviewFolderUri, openEditor);
  }

  private constructor(panel: vscode.WebviewPanel, webviewFolderUri: vscode.Uri, editor: vscode.TextEditor) {
    this._panel = panel;
    this._editor = editor;

    // Update the panel's icon
    this._panel.iconPath = {
      dark: vscode.Uri.joinPath(webviewFolderUri, "preview-dark.svg"),
      light: vscode.Uri.joinPath(webviewFolderUri, "preview-light.svg"),
    };

    // Set the webview's initial content
    this.setWebviewHtml(webviewFolderUri);

    // Register handlers
    this.registerEventHandlers();

    // Execute the DocumentSymbolProvider
    vscode.commands
      .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", this._editor.document.uri)
      .then((symbols) => {
        this._rootSymbol = symbols[0];
        this._symbolVersion = this._editor.document.version;

        // Send the initial message to the webview
        this._panel.webview.postMessage(this.createMessage());
      });
  }

  /**
   * Set the static html for the webview.
   */
  private setWebviewHtml(webviewFolderUri: vscode.Uri) {
    // Get the path to the @vscode/webview-ui-toolkit minimized js
    const toolkitUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewFolderUri, "toolkit-1.2.1.min.js"));

    // Set the webview's html
    this._panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en-us">
			<head>
				<meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script type="module" src="${toolkitUri}"></script>
			</head>
			<body>
				<h1 id="header"></h1>
				<vscode-divider></vscode-divider>
				<div id="showText"></div>
				<script>
          const vscode = acquireVsCodeApi();
          const header = document.getElementById("header");
          const showText = document.getElementById("showText");
          const memberregex = new RegExp(
            "(?:<method>([^<>/]*)</method>)|(?:<property>([^<>/]*)</property>)|(?:<query>([^<>/]*)</query>)",
            "gi"
          );
          let classUri;
        
          // Handle messages sent from the extension to the webview
          window.addEventListener("message", (event) => {
            const message = event.data; // The json data that the extension sent
        
            // Update the header to reflect what we're previewing
            header.innerText = message.element;
        
            // Update the uri of the class that we're previewing
            classUri = message.uri;
        
            // Modify the Documatic HTML for previewing and show it
            let modifiedDesc = message.desc;
            let matcharr;
            while ((matcharr = memberregex.exec(message.desc)) !== null) {
              let commandArgs = [classUri];
              if (matcharr[1] !== undefined) {
                // This is a <METHOD> HTML tag
                commandArgs[1] = "method";
                commandArgs[2] = matcharr[1];
              } else if (matcharr[2] !== undefined) {
                // This is a <PROPERTY> HTML tag
                commandArgs[1] = "property";
                commandArgs[2] = matcharr[2];
              } else {
                // This is a <QUERY> HTML tag
                commandArgs[1] = "query";
                commandArgs[2] = matcharr[3];
              }
              const href = "command:intersystems.language-server.showSymbolInClass?" + encodeURIComponent(JSON.stringify(commandArgs));
              const title = "Go to this " + commandArgs[1] + " definition";
              modifiedDesc = modifiedDesc.replace(matcharr[0], '<a href="' + href + '" title="' + title + '">' + commandArgs[2] + '</a>');
            }
            showText.innerHTML = modifiedDesc
              .replace(/<class>|<parameter>/gi, "<b><i>")
              .replace(/<\\/class>|<\\/parameter>/gi, "</i></b>")
              .replace(/<pre>/gi, "<code><pre>")
              .replace(/<\\/pre>/gi, "</pre></code>")
              .replace(/<example(?: +language *= *"?[a-z]+"?)? *>/gi, "<br/><code><pre>")
              .replace(/<\\/example>/gi, "</pre></code>");
        
            // Then persist state information.
            // This state is returned in the call to vscode.getState below when a webview is reloaded.
            vscode.setState({
              header: header.innerText,
              showText: showText.innerHTML,
              uri: classUri,
            });
          });
        
          // Webviews are normally torn down when not visible and re-created when they become visible again.
          // State lets us save information across these re-loads
          const state = vscode.getState();
          if (state) {
            // Fill in webview from the cache
            header.innerText = state.header;
            showText.innerHTML = state.showText;
            classUri = state.uri;
          }
        </script>
			</body>
			</html>`;
  }

  /**
   * Clean up disposables.
   */
  public dispose(): void {
    DocumaticPreviewPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disp = this._disposables.pop();
      if (disp) {
        disp.dispose();
      }
    }
  }

  /**
   * Create the message to send to the webview.
   */
  private createMessage(): WebviewMessage {
    // Determine which class definition element the cursor is in
    const descLines: string[] = [];
    let previewSymbol = this._rootSymbol.children.find((symbol) =>
      symbol.range.contains(this._editor.selection.active)
    );
    if (previewSymbol !== undefined) {
      // Get the description text for the class member symbol
      for (let line = previewSymbol.range.start.line; line < previewSymbol.selectionRange.start.line; line++) {
        const linetext = this._editor.document.lineAt(line).text;
        if (linetext.startsWith("/// ")) {
          descLines.push(linetext.slice(4));
        } else {
          descLines.push(linetext.slice(3));
        }
      }
    } else {
      // The cursor isn't in a member, so fall back to the class
      previewSymbol = this._rootSymbol;

      // Get the description text for the class
      for (let line = previewSymbol.range.start.line - 1; line >= 0; line--) {
        const linetext = this._editor.document.lineAt(line).text;
        if (linetext.startsWith("/// ")) {
          descLines.push(linetext.slice(4));
        } else if (linetext.startsWith("///")) {
          descLines.push(linetext.slice(3));
        } else {
          break;
        }
      }
      descLines.reverse();
    }

    // Create the message
    return {
      element: `${previewSymbol.detail !== "" ? previewSymbol.detail : "Class"} ${previewSymbol.name}`,
      desc: descLines.join("\n"),
      uri: this._editor.document.uri.toString(),
    };
  }

  /**
   * Register handlers for events that may cause us to update our preview content
   */
  private registerEventHandlers() {
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    vscode.window.onDidChangeActiveTextEditor(
      async (editor: vscode.TextEditor) => {
        if (editor !== undefined && editor.document.languageId === "objectscript-class") {
          // The new active editor is a class, so switch our preview to it

          // Get the name of the current class
          let clsname = "";
          const match = editor.document.getText().match(/^[ \t]*Class[ \t]+(%?[\p{L}\d]+(?:\.[\p{L}\d]+)+)/imu);
          if (match) {
            [, clsname] = match;
          }
          if (clsname === "") {
            // The class is malformed so we can't preview it
            return;
          }

          // Update the editor and panel title
          this._editor = editor;
          this._panel.title = `Doc for ${clsname}.cls`;

          // Update the root DocumentSymbol
          this._rootSymbol = (
            await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
              "vscode.executeDocumentSymbolProvider",
              this._editor.document.uri
            )
          )[0];
          this._symbolVersion = this._editor.document.version;

          // Update the webview content
          this._panel.webview.postMessage(this.createMessage());
        }
      },
      null,
      this._disposables
    );

    vscode.window.onDidChangeTextEditorSelection(
      async (event: vscode.TextEditorSelectionChangeEvent) => {
        if (event.textEditor == this._editor) {
          // The cursor position in our editor changed, so re-compute our preview content
          if (this._editor.document.version > this._symbolVersion) {
            // The content of the TextDocument changed, so update the root DocumentSymbol
            this._rootSymbol = (
              await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                "vscode.executeDocumentSymbolProvider",
                this._editor.document.uri
              )
            )[0];
            this._symbolVersion = this._editor.document.version;
          }

          // Update the webview content
          this._panel.webview.postMessage(this.createMessage());
        }
      },
      null,
      this._disposables
    );
  }
}
