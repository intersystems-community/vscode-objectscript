// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: fetch } = require("node-fetch-cjs");
import * as httpModule from "http";
import * as httpsModule from "https";

import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { cspAppsForUri, outputChannel } from "../utils";

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
  /** Selected web application */
  webApp: string;
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

  public static async create(extensionUri: vscode.Uri): Promise<void> {
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

    // Build the list of all non-CSP web apps
    const cspWebApps: string[] = cspAppsForUri(openEditor.document.uri);
    const allWebApps: string[] | null = await api
      .actionQuery("CALL %CSP.Apps_CSPAppList()", [])
      .then((data) => data.result.content.map((obj) => obj.AppUrl))
      .catch((error) => {
        let errorMsg = "Failed to fetch the list of web applications from the server.";
        if (error && error.errorText && error.errorText !== "") {
          outputChannel.appendLine("\n" + error.errorText);
          outputChannel.show(true);
          errorMsg += " Check 'ObjectScript' output channel for details.";
        }
        vscode.window.showErrorMessage(errorMsg, "Dimiss");
        return null;
      });
    if (allWebApps == null) {
      return;
    }
    const restWebApps = allWebApps.filter((app) => !cspWebApps.includes(app));
    if (restWebApps.length == 0) {
      vscode.window.showErrorMessage("No REST web applications are configured in the server's namespace.", "Dismiss");
      return;
    }
    //restWebApps.push("aaaaaafffffffffffffffffffffffffff","Kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk","b","c","d","e","f","g","h","i");
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

    // Get the full path to the folder containing our webview files
    const webviewFolderUri: vscode.Uri = vscode.Uri.joinPath(extensionUri, "webview");

    // Create the webview panel
    const panel = vscode.window.createWebviewPanel(
      this._viewType,
      this._viewTitle,
      { preserveFocus: false, viewColumn: vscode.ViewColumn.Active },
      {
        enableScripts: true,
        localResourceRoots: [webviewFolderUri],
      }
    );

    this._file = openEditor.document.uri;
    this.currentPanel = new RESTDebugPanel(panel, webviewFolderUri, api, restWebApps);
  }

  private constructor(panel: vscode.WebviewPanel, webviewFolderUri: vscode.Uri, api: AtelierAPI, webApps: string[]) {
    this._panel = panel;
    const serverInfo = `${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
      api.config.pathPrefix
    }`;

    // Get the path to the @vscode/webview-ui-toolkit minimized js
    const toolkitUri = this._panel.webview.asWebviewUri(vscode.Uri.joinPath(webviewFolderUri, "toolkit-1.2.1.min.js"));

    // Set the webview's content
    this._panel.webview.html = `
			<!DOCTYPE html>
			<html lang="en-us">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script type="module" src="${toolkitUri}"></script>
        <title>${RESTDebugPanel._viewTitle}</title>
        <style>
          .path-grid {
            display: grid;
            grid-template-columns: 1fr 20fr;
            column-gap: 0.5rem;
          }      
          .component-container > * {
            margin: 0.5rem 0;
          }
          vscode-text-area, vscode-text-field {
            width: 100%;
          }
          vscode-panels {
            display: contents;
          }
          .path-grid-container {
            display: flex;
            flex-direction: row;
            align-items: flex-start;
            justify-content: flex-start;
          }
          #webApp {
            max-width: 45vw;
          }
          #button {
            margin-top: 1rem;
          }
        </style>
			</head>
			<body>
        <h1>${RESTDebugPanel._viewTitle}</h1>
        <form id="form"> 
          <p>
            Use the tabs below to specify the REST request method, path, headers, query parameters and body.
            Click the 'Start Debugging' button to send the REST request and start the debugging session.
          </p>
          <vscode-panels id="panels" activeid="methodPathTab" aria-label="Method & Path, Headers, Query Parameters and Body">
            <vscode-panel-tab id="methodPathTab">METHOD & PATH</vscode-panel-tab>
            <vscode-panel-tab id="headersTab">HEADERS</vscode-panel-tab>
            <vscode-panel-tab id="paramsTab">QUERY PARAMETERS</vscode-panel-tab>
            <vscode-panel-tab id="bodyTab">BODY</vscode-panel-tab>
            <vscode-panel-view id="methodPathView">
              <section class="component-container">
                <p>
                  Select a method for this request, then select the web application
                  to use from the dropdown and enter the rest of the path in the input field
                  next to the dropdown. The connection information of the server definition
                  is shown for clarity but it cannot be edited.
                </p>
                <vscode-radio-group id="method" orientation="horizontal">
                  <vscode-radio checked value="GET">GET</vscode-radio>
                  <vscode-radio value="POST">POST</vscode-radio>
                  <vscode-radio value="PUT">PUT</vscode-radio>
                  <vscode-radio value="PATCH">PATCH</vscode-radio>
                  <vscode-radio value="DELETE">DELETE</vscode-radio>
                  <vscode-radio value="HEAD">HEAD</vscode-radio>
                  <vscode-radio value="OPTIONS">OPTIONS</vscode-radio>
                </vscode-radio-group>
                <vscode-text-field readonly id="serverInfo"></vscode-text-field>
                <section class="path-grid">
                  <section class="path-grid-container">
                    <vscode-dropdown id="webApp" position="below"></vscode-dropdown>
                  </section>
                  <section class="path-grid-container">
                    <vscode-text-field id="path" placeholder="/path"></vscode-text-field>
                  </section>
                </section>
              </section>
            </vscode-panel-view>
            <vscode-panel-view id="headersView">
              <section class="component-container">
                <p>
                  Enter your HTTP headers below, one per line, using the format 'HEADER: value'.
                  If no 'Authorization' header is present, the username and password of the server connection will be used.
                  If you provide a body, the 'Content-Type' header will be set automatically.
                  To disable a header, add a hash (#) to the start of that line.
                </p>
                <vscode-text-area id="headersText" resize="vertical" placeholder="HEADER: value\n# INACTIVE_HEADER: value" rows="5"></vscode-text-area>
              </section>
            </vscode-panel-view>
            <vscode-panel-view id="paramsView">
              <section class="component-container">
                <p>
                  Enter your query parameters below, one per line, using the format 'param=1'.
                  To disable a query parameter, add a hash (#) to the start of that line.
                </p>
                <vscode-text-area id="paramsText" resize="vertical" placeholder="param=1\n# inactive-param=1" rows="5"></vscode-text-area>
              </section>
            </vscode-panel-view>
            <vscode-panel-view id="bodyView">
              <section class="component-container">
                <p>
                  To provide a request body, select the type of the body content
                  and enter the content in the text box that appears. 
                </p>
                <vscode-radio-group id="bodyType" orientation="horizontal">
                  <vscode-radio checked value="No Body">No Body</vscode-radio>
                  <vscode-radio value="JSON">JSON</vscode-radio>
                  <vscode-radio value="Text">Text</vscode-radio>
                  <vscode-radio value="XML">XML</vscode-radio>
                  <vscode-radio value="HTML">HTML</vscode-radio>
                </vscode-radio-group>
                <vscode-text-area id="bodyContent" resize="vertical" rows="10" hidden></vscode-text-area>
              </section>
            </vscode-panel-view>
          </vscode-panels>
        </form>
        <vscode-divider></vscode-divider>
        <vscode-button id="button" appearance="primary" type="button">Start Debugging</vscode-button>
        <script>
          const vscode = acquireVsCodeApi();
          const form = document.getElementById("form");
          const method = document.getElementById("method");
          const serverInfo = document.getElementById("serverInfo");
          const path = document.getElementById("path");
          const headersText = document.getElementById("headersText");
          const paramsText = document.getElementById("paramsText");
          const bodyType = document.getElementById("bodyType");
          const bodyContent = document.getElementById("bodyContent");
          const button = document.getElementById("button");
          const webApp = document.getElementById("webApp");
          const formFields = [method, serverInfo, path, headersText, paramsText, bodyType, bodyContent, webApp];

          const setFormData = (data) => {
            formFields.forEach((field) => {
              if (data[field.id] && field.value != data[field.id]) {
                field.value = data[field.id];
              }
              if (field.id == "webApp" && webApp.children.length == 0) {
                // Create options and set the initial value
                data.webApps.forEach((webAppStr, idx) => {
                  const option = document.createElement("vscode-option");
                  option.innerText = webAppStr;
                  option.setAttribute("value",webAppStr);
                  if (idx == 0) {
                    option.setAttribute("selected",true);
                  }
                  webApp.appendChild(option);
                  if (idx == 0) {
                    webApp.value = webAppStr;
                  }
                });
                if (data.webApp != undefined && data.webApp != "" && data.webApps.includes(data.webApp)) {
                  webApp.value = data.webApp;
                }
                // Update width of dropdown
                const longest = data.webApps.reduce((a,b) => a.length > b.length ? a : b);
                const context = document.createElement("canvas").getContext("2d");
                context.font = window.getComputedStyle(webApp,null).getPropertyValue("font");
                webApp.style.width = Math.ceil(context.measureText(longest).width) + "px";
              }
            });
            form.dispatchEvent(new Event("change"));
          }
          const getFormData = () => {
            const data = {};
            formFields.forEach((field) => {
              if (field.id != "serverInfo" && field.value != undefined) {
                data[field.id] = field.value;
              }
            });
            return data;
          }

          window.onmessage = (event) => setFormData(event.data);
          button.onclick = () => {
            vscode.postMessage({
              submitted: true,
              ...getFormData()
            });
          }
          form.onchange = (event) => {
            if (event.target.id != "panels") {
              const data = getFormData();
              if (
                Object.keys(data).length == formFields.length - 1 &&
                data.webApp != "" && data.method != "" && data.bodyType != ""
              ) {
                vscode.postMessage({
                  submitted: false,
                  ...data
                });
              }
            }
          }
          bodyType.onchange = () => {
            if (bodyType.value == "No Body") {
              bodyContent.setAttribute("hidden","hidden");
            } else {
              bodyContent.removeAttribute("hidden");
            }
          }
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
                headers[line.slice(0, line.indexOf(":")).trim()] = line.slice(line.indexOf(":") + 1).trim();
              }
            });
            if (
              headers["Authorization"] == undefined &&
              typeof api.config.username === "string" &&
              typeof api.config.password === "string"
            ) {
              // Use the server connection's auth if the user didn't specify any
              headers["Authorization"] = `Basic ${Buffer.from(`${api.config.username}:${api.config.password}`).toString(
                "base64"
              )}`;
            }
            const hasBody =
              typeof message.bodyContent == "string" && message.bodyContent != "" && message.bodyType != "No Body";
            if (hasBody) {
              // Set the Content-Type header using bodyType
              switch (message.bodyType) {
                case "JSON":
                  headers["Content-Type"] = "application/json";
                  break;
                case "XML":
                  headers["Content-Type"] = "application/xml";
                  break;
                case "Text":
                  headers["Content-Type"] = "text/plain";
                  break;
                case "HTML":
                  headers["Content-Type"] = "text/html";
                  break;
              }
            }
            const agent = new (api.config.https ? httpsModule : httpModule).Agent({
              keepAlive: true,
              maxSockets: 10,
              rejectUnauthorized: api.config.https && vscode.workspace.getConfiguration("http").get("proxyStrictSSL"),
            });

            // Send the request
            fetch(`${encodeURI(`${serverInfo}${message.webApp}${path}`)}?${urlParams.toString()}`, {
              method: message.method,
              agent,
              body: hasBody ? message.bodyContent : undefined,
              headers,
            }).catch((error) => {
              outputChannel.appendLine(
                typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
              );
              vscode.window.showErrorMessage(
                "Failed to send debugee REST request. Check 'ObjectScript' Output channel for details.",
                "Dismiss"
              );
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
            let errorMsg = "Failed to start debugging.";
            if (error && error.errorText && error.errorText !== "") {
              outputChannel.appendLine("\n" + error.errorText);
              outputChannel.show(true);
              errorMsg += " Check 'ObjectScript' output channel for details.";
            }
            return vscode.window.showErrorMessage(errorMsg, "Dismiss");
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
            webApps,
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
