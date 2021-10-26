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
  private readonly _webviewFolderUri: vscode.Uri;
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
    const panel = vscode.window.createWebviewPanel(this.viewType, `Preview ${clsname}.cls`, {preserveFocus: true, viewColumn: vscode.ViewColumn.Beside}, {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [webviewFolderUri],
    });

    this.currentPanel = new DocumaticPreviewPanel(panel, webviewFolderUri, openEditor);
  }

  private constructor(panel: vscode.WebviewPanel, webviewFolderUri: vscode.Uri, editor: vscode.TextEditor) {
    this._panel = panel;
    this._webviewFolderUri = webviewFolderUri;
    this._editor = editor;

    // Update the panel's icon
    this._panel.iconPath = {
      dark: vscode.Uri.joinPath(webviewFolderUri, "preview-dark.svg"),
      light: vscode.Uri.joinPath(webviewFolderUri, "preview-light.svg"),
    };

    // Set the webview's initial content
    this.setWebviewHtml();

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
  private setWebviewHtml() {
    const webview = this._panel.webview;

    // Local path to script and css for the webview
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._webviewFolderUri, "documaticPreview.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._webviewFolderUri, "documaticPreview.css"));

    // Use a nonce to whitelist which scripts can be run
    const nonce = (function () {
      let text = "";
      const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
      }
      return text;
    })();

    // Set the webview's html
    this._panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en-us">
			<head>
				<meta charset="UTF-8">
	
				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
	
				<link href="${styleUri}" rel="stylesheet">
			</head>
			<body>
				<br>
				<h2 id="header"></h2>
				<br>
				<div id="showText"></div>
	
				<script nonce="${nonce}" src="${scriptUri}"></script>
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
          this._panel.title = `Preview ${clsname}.cls`;

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
