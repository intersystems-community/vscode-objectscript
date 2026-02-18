import axios from "axios";
import * as httpsModule from "https";
import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { handleError, webviewCSS } from "../utils";
import { iscIcon } from "../extension";

interface WebviewMessage {
  /** Whether this message was triggered by the user pressing the 'Start Debugging' button */
  submitted: boolean;
  /** REST method */
  method: string;
  /** URL path */
  path: string;
  /** Request headers raw text */
  headersText: string;
  /** Query parameters raw text */
  paramsText: string;
  /** Type of `bodyContent` */
  bodyType: string;
  /** Request body */
  bodyContent: string;
}

/**
 * Manages REST debugging webviews.
 */
export class RESTDebugPanel {
  private static readonly _viewType = "isc-rest-debug";
  private static readonly _viewTitle = "Debug REST Service";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  /** The previous state of the webview. */
  private static _cache: WebviewMessage;

  /** The file that the `_panel` was opened by. */
  private static _file: vscode.Uri | undefined;

  /**
   * Track the currently open panel. Only allow a single panel to exist at a time.
   */
  public static currentPanel: RESTDebugPanel | undefined;

  public static async create(): Promise<void> {
    // Get the open document and check that it's an InterSystems file
    const openEditor = vscode.window.activeTextEditor;
    if (openEditor === undefined) {
      // Need an open document to get connection info from
      vscode.window.showErrorMessage(
        "REST service debugging webview requires an InterSystems file in the active editor.",
        "Dismiss"
      );
      return;
    }
    if (
      !(
        openEditor.document.languageId.startsWith("objectscript") &&
        !openEditor.document.languageId.endsWith("-injection")
      )
    ) {
      // Open editor is not an InterSystems file
      vscode.window.showErrorMessage(
        "REST service debugging webview requires an InterSystems file in the active editor.",
        "Dismiss"
      );
      return;
    }
    const api = new AtelierAPI(openEditor.document.uri);
    if (!api.active) {
      vscode.window.showErrorMessage("REST service debugging webview requires an active server connection.", "Dismiss");
      return;
    }
    if (api.config.apiVersion < 2) {
      vscode.window.showErrorMessage(
        "REST service debugging webview requires Atelier API version 2 or above.",
        "Dismiss"
      );
      return;
    }

    if (this.currentPanel !== undefined) {
      // Can only have one panel open at once
      if (!this.currentPanel._panel.visible) {
        if (openEditor.document.uri.toString() == this._file.toString()) {
          // The open panel is for this document, so show it
          this.currentPanel._panel.reveal(vscode.ViewColumn.Active);
          return;
        } else {
          // The open panel is for another document, so create a new one
          this.currentPanel.dispose();
        }
      } else {
        return;
      }
    }

    // Create the webview panel
    const panel = vscode.window.createWebviewPanel(
      this._viewType,
      this._viewTitle,
      { preserveFocus: false, viewColumn: vscode.ViewColumn.Active },
      {
        enableScripts: true,
        localResourceRoots: [],
      }
    );
    panel.iconPath = iscIcon;

    this._file = openEditor.document.uri;
    this.currentPanel = new RESTDebugPanel(panel, api);
  }

  private constructor(panel: vscode.WebviewPanel, api: AtelierAPI) {
    this._panel = panel;
    const serverInfo = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
      api.config.pathPrefix
    }`;

    // Set the webview's content
    this._panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en-us">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${RESTDebugPanel._viewTitle}</title>
        <style>${webviewCSS}
          .container > * {
            margin: 0.25rem 0;
          }
          .button-badge {
            background-color: var(--vscode-button-background);
            border: 1px solid var(--vscode-button-background);
            border-radius: 2px;
            box-sizing: border-box;
            color: var(--vscode-button-foreground);
            display: inline-block;
            font-family: var(--vscode-font-family);
            font-size: 11px;
            font-weight: 400;
            line-height: 14px;
            min-width: 18px;
            padding: 2px 3px;
            text-align: center;
            white-space: nowrap;
          }
          .vscode-button {
            align-items: center;
            background-color: var(--vscode-button-background);
            border-color: var(--vscode-button-border, var(--vscode-button-background));
            border-style: solid;
            border-radius: 2px;
            border-width: 1px;
            color: var(--vscode-button-foreground);
            cursor: pointer;
            display: inline-flex;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            font-weight: var(--vscode-font-weight);
            line-height: 22px;
            overflow: hidden;
            padding: 1px 13px;
            user-select: none;
            white-space: nowrap;
          }
          .vscode-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .vscode-button:focus,
          .vscode-button:active {
            outline: none;
          }
          .vscode-button:focus {
            background-color: var(--vscode-button-hoverBackground);
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 2px;
          }
          .vscode-textarea {
            background-color: var(--vscode-settings-textInputBackground);
            border-color: var(--vscode-settings-textInputBorder, var(--vscode-settings-textInputBackground));
            border-radius: 2px;
            border-style: solid;
            border-width: 1px;
            box-sizing: border-box;
            color: var(--vscode-settings-textInputForeground);
            display: inline-block;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            font-weight: var(--vscode-font-weight);
            position: relative;
            width: 100%;
          }
          .vscode-textarea:focus {
            border-color: var(--vscode-focusBorder);
            outline: none;
          }
          .vscode-textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 1;
          }
          #bodyContent {
            display: none;
          }
          input.vscode-textfield {
            background-color: var(--vscode-settings-textInputBackground);
            border-color: var(--vscode-settings-textInputBorder, var(--vscode-settings-textInputBackground));
            border-radius: 2px;
            border-style: solid;
            border-width: 1px;
            box-sizing: border-box;
            color: var(--vscode-settings-textInputForeground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            font-weight: var(--vscode-font-weight);
            line-height: 18px;
            max-width: 100%;
            outline: none;
            position: relative;
            width: 100%;
          }
          input.vscode-textfield {
            display: inline-block;
            padding-bottom: 3px;
            padding-left: 4px;
            padding-right: 4px;
            padding-top: 3px;
          }
          input.vscode-textfield:read-only:not([type="file"]) {
            cursor: not-allowed;
          }
          input.vscode-textfield::placeholder {
            color: var(--vscode-input-placeholderForeground);
            opacity: 1;
          }
          input.vscode-textfield:invalid,
          input.vscode-textfield.invalid {
            background-color: var(--vscode-inputValidation-errorBackground);
            border-color: var(--vscode-inputValidation-errorBorder, #be1100);
          }
          input.vscode-textfield:focus,
          input.vscode-textfield:focus:invalid {
            outline: none;
            border-color: var(--vscode-focusBorder);
          }
          .vscode-radio {
            display: inline-flex;
            position: relative;
            user-select: none;
          }
          .vscode-radio input[type="radio"] {
            clip: rect(0 0 0 0);
            clip-path: inset(50%);
            height: 1px;
            overflow: hidden;
            position: absolute;
            white-space: nowrap;
            width: 1px;
          }
          .vscode-radio .icon {
            align-items: center;
            background-color: var(--vscode-settings-checkboxBackground);
            background-size: 16px;
            border: 1px solid var(--vscode-settings-checkboxBorder);
            border-radius: 100%;
            box-sizing: border-box;
            color: var(--vscode-settings-checkboxForeground);
            display: flex;
            height: 18px;
            justify-content: center;
            margin-left: 0;
            margin-right: 9px;
            padding: 0;
            pointer-events: none;
            position: relative;
            width: 18px;
          }
          .vscode-radio input[type="radio"]:checked + label .icon:before {
            background-color: currentColor;
            border-radius: 4px;
            content: "";
            height: 8px;
            left: 50%;
            margin: -4px 0 0 -4px;
            position: absolute;
            top: 50%;
            width: 8px;
          }
          .vscode-radio input[type="radio"]:focus + label .icon {
            border-color: var(--vscode-focusBorder);
          }
          .vscode-radio label {
            cursor: pointer;
            display: inline-flex;
            line-height: 18px;
          }
          .vscode-radio label .text {
            opacity: 0.9;
          }
          .vscode-radio-group {
            display: flex;
          }
          .vscode-radio-group .vscode-radio {
            display: block;
          }
          .vscode-radio-group .vscode-radio:not(:last-child) {
            margin-right: 20px;
          }
          .vscode-radio-group .vscode-radio {
            margin-top: 0.25rem;
          }
          .header-query {
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-gap: 10px;
          }
          .header-query-box {
            display: grid;
            grid-template-rows: 1fr auto;
          }
          #headersText, #paramsText {
            grid-row: 2;
          }
        </style>
			</head>
			<body>
        <h1>${RESTDebugPanel._viewTitle}</h1>
        <form id="form">
          <p>Use the form below to specify the REST request method, path, headers, query parameters and body.
          Click the <span class="button-badge">Start Debugging</span> button to send the REST request and start the debugging session.</p>
          <hr class="vscode-divider">
          <div class="container">
            <p>Select a method for this request, then enter the path in the bottom input field.
            The connection information of the server definition is shown, but it cannot be edited.</p>
            <div class="vscode-radio-group">
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-get" value="GET" checked>
                <label for="method-get">
                  <span class="icon"></span>
                  <span class="text">GET</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-post" value="POST">
                <label for="method-post">
                  <span class="icon"></span>
                  <span class="text">POST</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-put" value="PUT">
                <label for="method-put">
                  <span class="icon"></span>
                  <span class="text">PUT</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-patch" value="PATCH">
                <label for="method-patch">
                  <span class="icon"></span>
                  <span class="text">PATCH</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-delete" value="DELETE">
                <label for="method-delete">
                  <span class="icon"></span>
                  <span class="text">DELETE</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-head" value="HEAD">
                <label for="method-head">
                  <span class="icon"></span>
                  <span class="text">HEAD</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="method" id="method-options" value="OPTIONS">
                <label for="method-options">
                  <span class="icon"></span>
                  <span class="text">OPTIONS</span>
                </label>
              </div>
            </div>
            <input type="text" class="vscode-textfield" readonly id="serverInfo"></input>
            <input type="text" class="vscode-textfield" id="path" name="path" placeholder="/path" pattern="^/.*$" required></input>
            <div class="header-query">
              <div class="header-query-box">
                <p>Enter your HTTP headers below, one per line, using the format 'HEADER: value'.
                If no 'Authorization' header is present, the username and password of the server connection will be used.
                If you provide a body, the 'Content-Type' header will be set automatically.
                To disable a header, add a hash to the start of that line.</p>
                <textarea id="headersText" name="headersText" resize="vertical" placeholder="HEADER: value\n# INACTIVE-HEADER: value" rows="5" class="vscode-textarea"></textarea>
              </div>
              <div class="header-query-box">
                <p>Enter your query parameters below, one per line, using the format 'param=value'.
                To disable a query parameter, add a hash to the start of that line.</p>
                <textarea id="paramsText" name="paramsText" resize="vertical" placeholder="param=1\n# inactive-param=1" rows="5" class="vscode-textarea"></textarea>
              </div>
            </div>
            <p>To provide a request body, select the type of the body content and enter the content in the text box that appears.</p>
            <div class="vscode-radio-group">
              <div class="vscode-radio">
                <input type="radio" name="bodyType" id="bodyType-no-body" value="No Body" checked onclick="bodyTypeClick(this);">
                <label for="bodyType-no-body">
                  <span class="icon"></span>
                  <span class="text">No Body</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="bodyType" id="bodyType-json" value="JSON" onclick="bodyTypeClick(this);">
                <label for="bodyType-json">
                  <span class="icon"></span>
                  <span class="text">JSON</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="bodyType" id="bodyType-text" value="Plain Text" onclick="bodyTypeClick(this);">
                <label for="bodyType-text">
                  <span class="icon"></span>
                  <span class="text">Plain Text</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="bodyType" id="bodyType-xml" value="XML" onclick="bodyTypeClick(this);">
                <label for="bodyType-xml">
                  <span class="icon"></span>
                  <span class="text">XML</span>
                </label>
              </div>
              <div class="vscode-radio">
                <input type="radio" name="bodyType" id="bodyType-html" value="HTML" onclick="bodyTypeClick(this);">
                <label for="bodyType-html">
                  <span class="icon"></span>
                  <span class="text">HTML</span>
                </label>
              </div>
            </div>
            <textarea id="bodyContent" name="bodyContent" resize="vertical" rows="10" class="vscode-textarea"></textarea>
          </div>
        </form>
        <hr class="vscode-divider">
        <button type="button" class="vscode-button" id="button">Start Debugging</button>
        <script>
          const vscode = acquireVsCodeApi();
          const form = document.getElementById("form");
          const methods = document.getElementsByName("method");
          const serverInfo = document.getElementById("serverInfo");
          const path = document.getElementById("path");
          const headersText = document.getElementById("headersText");
          const paramsText = document.getElementById("paramsText");
          const bodyTypes = document.getElementsByName("bodyType");
          const bodyContent = document.getElementById("bodyContent");
          const button = document.getElementById("button");
          const formFields = [serverInfo, path, headersText, paramsText, bodyContent];
          const sendData = (submitted) => {
            const data = Object.fromEntries(new FormData(form));
            if (
              // Need the + 1 because formFields is missing the two radio groups
              Object.keys(data).length == (formFields.length + 1) &&
              data.method != "" && data.bodyType != "" &&
              (!submitted || (submitted && path.checkValidity()))
            ) {
              vscode.postMessage({
                submitted,
                ...data
              });
            }
          };

          function bodyTypeClick(radio) {
            bodyContent.style.display = (radio.value == "No Body" ? "none" : "inline-block");
          }
          window.onmessage = (event) => {
            const data = event.data, currentVals = new FormData(form);
            formFields.forEach((field) => {
              if (data[field.id] != undefined && currentVals.get(field.id) != data[field.id]) {
                field.value = data[field.id];
              }
            });
            if (data.method != currentVals.method) {
              for (let method of methods) {
                if (method.value == data.method) {
                  method.checked = true;
                  break;
                }
              }
            }
            if (data.bodyType != currentVals.bodyType) {
              for (let bodyType of bodyTypes) {
                if (bodyType.value == data.bodyType) {
                  bodyType.checked = true;
                  break;
                }
              }
              bodyContent.style.display = (data.bodyType == "No Body" ? "none" : "inline-block");
            }
          };
          form.onchange = () => sendData(false);
          button.onclick = () => sendData(true);
          // Bubble change events up to the form
          bodyContent.onchange = headersText.onchange = 
            paramsText.onchange = path.onchange = 
            () => form.dispatchEvent(new Event("change"));
        </script>
			</body>
			</html>`;

    // Register event handlers
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        // Save the current state of the UI
        RESTDebugPanel._cache = message;

        if (message.submitted) {
          try {
            // Get a CSP debug ID
            const cspDebugId = await api.getCSPDebugId().then((data) => data.result.content);

            // Make sure the original document is the active text editor
            this._panel.dispose();
            await vscode.window.showTextDocument(RESTDebugPanel._file, {
              preview: false,
              viewColumn: vscode.ViewColumn.Active,
            });

            const path = !message.path.startsWith("/") && message.path != "" ? "/" + message.path : message.path;
            // Convert the raw paramters text to a URI-suitable string
            const urlParams = new URLSearchParams();
            message.paramsText.split(/\r?\n/).forEach((line) => {
              line = line.trim();
              if (line != "" && !line.startsWith("#")) {
                urlParams.append(line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim());
              }
            });
            // Add the CSPDEBUG parameter
            urlParams.set("CSPDEBUG", String(cspDebugId));
            // Convert the raw headers text to an object
            const headers = {};
            message.headersText.split(/\r?\n/).forEach((line) => {
              line = line.trim();
              if (line != "" && !line.startsWith("#")) {
                headers[line.slice(0, line.indexOf(":")).trim().toLowerCase()] = line
                  .slice(line.indexOf(":") + 1)
                  .trim();
              }
            });
            if (
              headers["authorization"] == undefined &&
              typeof api.config.username === "string" &&
              typeof api.config.password === "string"
            ) {
              // Use the server connection's auth if the user didn't specify any
              headers["authorization"] = `Basic ${Buffer.from(`${api.config.username}:${api.config.password}`).toString(
                "base64"
              )}`;
            }
            const hasBody =
              typeof message.bodyContent == "string" && message.bodyContent != "" && message.bodyType != "No Body";
            if (hasBody) {
              // Set the Content-Type header using bodyType
              switch (message.bodyType) {
                case "JSON":
                  headers["content-type"] = "application/json; charset=utf-8";
                  break;
                case "XML":
                  headers["content-type"] = "application/xml; charset=utf-8";
                  break;
                case "Plain Text":
                  headers["content-type"] = "text/plain; charset=utf-8";
                  break;
                case "HTML":
                  headers["content-type"] = "text/html; charset=utf-8";
                  break;
              }
            }
            const httpsAgent = new httpsModule.Agent({
              rejectUnauthorized: vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
            });

            // Send the request
            axios
              .request({
                method: message.method,
                url: `${encodeURI(`${serverInfo}${path}`)}?${urlParams.toString()}`,
                headers,
                data: hasBody ? message.bodyContent : undefined,
                withCredentials: true,
                httpsAgent,
                validateStatus: undefined, // Only reject if we didn't get a response
              })
              .catch((error) => {
                handleError(error, "Failed to send debuggee REST request.");
                vscode.debug.stopDebugging(vscode.debug.activeDebugSession);
              });

            // Wait 500ms to allow the server to associate this request with the CSDPDEBUG id
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Start the debugging session
            await vscode.debug.startDebugging(vscode.workspace.getWorkspaceFolder(RESTDebugPanel._file), {
              type: "objectscript",
              request: "attach",
              name: "REST",
              cspDebugId,
            });
          } catch (error) {
            handleError(error, "Failed to start debugging.");
            return;
          }
        }
      },
      null,
      this._disposables
    );
    this._panel.onDidChangeViewState(
      () => {
        if (this._panel.visible) {
          // Restore the content
          this._panel.webview.postMessage({
            serverInfo,
            ...RESTDebugPanel._cache,
          });
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Clean up disposables.
   */
  public dispose(): void {
    RESTDebugPanel.currentPanel = undefined;

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const disp = this._disposables.pop();
      if (disp) {
        disp.dispose();
      }
    }
  }
}
