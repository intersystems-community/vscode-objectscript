import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, filesystemSchemas } from "../extension";
import { outputChannel, outputConsole, getServerName } from "../utils";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { ClassNode } from "../explorer/models/classNode";
import { PackageNode } from "../explorer/models/packageNode";
import { RoutineNode } from "../explorer/models/routineNode";
import { importAndCompile } from "./compile";
import { ProjectNode } from "../explorer/models/projectNode";
import { openCustomEditors } from "../providers/RuleEditorProvider";
import { UserAction } from "../api/atelier";

export let documentBeingProcessed: vscode.TextDocument = null;

export enum OtherStudioAction {
  AttemptedEdit = 0,
  CreatedNewDocument = 1,
  DeletedDocument = 2,
  OpenedDocument = 3,
  ClosedDocument = 4,
  ConnectedToNewNamespace = 5,
  ImportListOfDocuments = 6,
  FirstTimeDocumentSave = 7,
}

export enum StudioMenuType {
  Main = "main",
  Context = "context",
}

interface StudioAction extends vscode.QuickPickItem {
  id: string;
  save: number;
}

function getOtherStudioActionLabel(action: OtherStudioAction): string {
  let label = "";
  switch (action) {
    case OtherStudioAction.AttemptedEdit:
      label = "Attempted Edit";
      break;
    case OtherStudioAction.CreatedNewDocument:
      label = "Created New Document";
      break;
    case OtherStudioAction.DeletedDocument:
      label = "Deleted Document";
      break;
    case OtherStudioAction.OpenedDocument:
      label = "Opened Document";
      break;
    case OtherStudioAction.ClosedDocument:
      label = "Closed Document";
      break;
    case OtherStudioAction.ConnectedToNewNamespace:
      label = "Changed Namespace";
      break;
    case OtherStudioAction.ImportListOfDocuments:
      label = "Import List of Documents";
      break;
    case OtherStudioAction.FirstTimeDocumentSave:
      label = "Saved Document to Server for the First Time";
      break;
  }
  return label;
}

// Used to avoid triggering the edit listener when files are reloaded by an extension
const suppressEditListenerMap = new Map<string, boolean>();

export class StudioActions {
  private uri: vscode.Uri;
  private api: AtelierAPI;
  private name: string;
  public projectEditAnswer?: string;

  public constructor(uriOrNode?: vscode.Uri | PackageNode | ClassNode | RoutineNode) {
    if (uriOrNode instanceof vscode.Uri) {
      this.uri = uriOrNode;
      this.name = getServerName(uriOrNode);
      this.api = new AtelierAPI(uriOrNode);
    } else if (uriOrNode) {
      this.api = new AtelierAPI(uriOrNode.workspaceFolderUri || uriOrNode.workspaceFolder);
      this.api.setNamespace(uriOrNode.namespace);
      this.name = uriOrNode instanceof PackageNode ? uriOrNode.fullName + ".PKG" : uriOrNode.fullName;
    } else {
      this.api = new AtelierAPI();
    }
  }

  /** Fire UserAction 6 on server `api` for document list `documents` */
  public async fireImportUserAction(api: AtelierAPI, documents: string[]): Promise<void> {
    this.api = api;
    this.name = documents.join(",");
    return this.userAction(
      {
        id: OtherStudioAction.ImportListOfDocuments.toString(),
        label: getOtherStudioActionLabel(OtherStudioAction.ImportListOfDocuments),
      },
      false,
      "",
      "",
      1
    );
  }

  /** Fire UserAction `id` on server `api` for project `name`. */
  public async fireProjectUserAction(api: AtelierAPI, name: string, id: OtherStudioAction): Promise<void> {
    const scope = api.wsOrFile instanceof vscode.Uri ? api.wsOrFile : this.uri;
    if (
      vscode.workspace.getConfiguration("objectscript.serverSourceControl", scope)?.get("disableOtherActionTriggers")
    ) {
      this.projectEditAnswer = "1";
      return;
    }
    this.api = api;
    this.name = `${name}.PRJ`;
    return this.userAction(
      {
        id: id.toString(),
        label: getOtherStudioActionLabel(id),
      },
      false,
      "",
      "",
      1
    );
  }

  public processUserAction(userAction: UserAction): Thenable<any> {
    const serverAction = userAction.action;
    const { target, errorText } = userAction;
    if (errorText !== "") {
      outputChannel.appendLine(errorText);
      outputChannel.show();
    }
    if (config().studioActionDebugOutput) {
      outputChannel.appendLine(JSON.stringify(userAction));
    }
    switch (serverAction) {
      case 0:
        /// do nothing
        break;
      case 1: // Display the default Studio dialog with a yes/no/cancel button.
        return vscode.window
          .showWarningMessage(target, { modal: true }, "Yes", "No")
          .then((answer) => (answer === "Yes" ? "1" : answer === "No" ? "0" : "2"));
      case 2: // Run a CSP page/Template. The Target is the full path of CSP page/template on the connected server
        return new Promise((resolve) => {
          let answer = "2";
          const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
          const panel = vscode.window.createWebviewPanel(
            "studioactionwebview",
            "Studio Extension Page",
            column || vscode.ViewColumn.One,
            {
              enableScripts: true,
            }
          );
          panel.webview.onDidReceiveMessage((message) => {
            if (message.result && message.result === "done") {
              answer = "1";
              panel.dispose();
            } else if (typeof message.href == "string") {
              const linkUri = vscode.Uri.parse(message.href);
              // Only open http(s) links
              if (/^https?$/.test(linkUri.scheme)) vscode.env.openExternal(linkUri);
            }
          });
          panel.onDidDispose(() => resolve(answer));

          const config = this.api.config;
          const url = new URL(
            `${config.https ? "https" : "http"}://${config.host}:${config.port}${config.pathPrefix}${target}`
          );

          // Do this ourself instead of using our new getCSPToken wrapper function, because that function reuses tokens which causes issues with
          // webview when server is 2020.1.1 or greater, as session cookie scope is typically Strict, meaning that the webview
          // cannot store the cookie. Consequence is web sessions may build up (they get a 900 second timeout)
          this.api.actionQuery("select %Atelier_v1_Utils.General_GetCSPToken(?) token", [target]).then((tokenObj) => {
            const csptoken = tokenObj.result.content[0].token;
            url.searchParams.set("CSPCHD", csptoken);
            url.searchParams.set("CSPSHARE", "1");
            url.searchParams.set("Namespace", this.api.config.ns);
            panel.webview.html = `
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
                  <iframe src="${url.toString()}" width="100%" height="100%" frameborder="0"></iframe>
                </div>
                <script>
                  const vscode = acquireVsCodeApi();
                  window.addEventListener("message", receiveMessage, false);
                  function receiveMessage(event) {
                    vscode.postMessage(event.data);
                  }
                </script>
              </body>
              </html>
              `;
          });
        });
      case 3: {
        // Run an EXE on the client.
        const urlRegex = /^(ht|f)tp(s?):\/\//gim;
        if (target.search(urlRegex) === 0) {
          // Allow target that is a URL to be opened in an external browser
          vscode.env.openExternal(vscode.Uri.parse(target));
          break;
        } else {
          throw new Error("processUserAction: Run EXE (Action=3) not supported");
        }
      }
      case 4: {
        // Insert the text in Target in the current document at the current selection point
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            editBuilder.replace(editor.selection, target);
          });
        }
        break;
      }
      case 5: // Studio will open the documents listed in Target
        target.split(",").forEach((element) => {
          let classname: string = element;
          let method: string;
          let offset = 0;
          if (element.includes(":")) {
            [classname, method] = element.split(":");
            if (method.includes("+")) {
              offset = +method.split("+")[1];
              method = method.split("+")[0];
            }
          }

          const splitClassname = classname.split(".");
          const filetype = splitClassname[splitClassname.length - 1];
          const isCorrectMethod = (text: string) =>
            filetype === "cls" ? text.match("Method " + method) : text.startsWith(method);

          const uri = DocumentContentProvider.getUri(classname);
          vscode.window.showTextDocument(uri, { preview: false }).then((newEditor) => {
            if (method) {
              const document = newEditor.document;
              for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                if (isCorrectMethod(line.text)) {
                  if (!line.text.endsWith("{")) offset++;
                  const targetLine = document.lineAt(i + offset);
                  const range = new vscode.Range(targetLine.range.start, targetLine.range.start);
                  newEditor.selection = new vscode.Selection(range.start, range.start);
                  newEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                  break;
                }
              }
            }
          });
        });
        break;
      case 6: // Display an alert dialog in Studio with the text from the Target variable.
        return vscode.window.showWarningMessage(target, { modal: true });
      case 7: // Display a dialog with a textbox and Yes/No/Cancel buttons.
        return vscode.window
          .showInputBox({
            prompt: target,
          })
          .then((msg) => {
            return {
              msg: msg ? msg : "",
              answer: msg ? 1 : 2,
            };
          });
      default:
        throw new Error(`processUserAction: ${userAction} not supported`);
    }
    return Promise.resolve();
  }

  private userAction(action, afterUserAction = false, answer = "", msg = "", type = 0): Thenable<void> {
    if (!action || action.id == "") {
      return;
    }
    const func = afterUserAction ? "AfterUserAction(?, ?, ?, ?, ?)" : "UserAction(?, ?, ?, ?)";
    const query = `select * from %Atelier_v1_Utils.Extension_${func}`;
    let selectedText = "";
    const editor = vscode.window.activeTextEditor;
    if (editor && action.id != "6" /* No selection for import list */) {
      const selection = editor.selection;
      selectedText = editor.document.getText(selection);
    }

    const parameters = afterUserAction
      ? [type.toString(), action.id, this.name, answer, msg]
      : [type.toString(), action.id, this.name, selectedText];

    if (config().studioActionDebugOutput) {
      outputChannel.appendLine(`${query.slice(0, query.indexOf("("))}(${JSON.stringify(parameters).slice(1, -1)})`);
    }

    return vscode.window.withProgress(
      {
        cancellable: false,
        location: vscode.ProgressLocation.Window,
        title: `Executing ${afterUserAction ? "After" : ""}UserAction: ${action.label}`,
      },
      () =>
        new Promise((resolve, reject) => {
          this.api
            .actionQuery(query, parameters)
            .then(async (data) => {
              if (action.save && action.id != "6" /* No save for import list */) {
                await this.processSaveFlag(action.save);
              }
              if (!afterUserAction) {
                outputConsole(data.console);
              }
              if (!data.result.content.length) {
                // Nothing to do. Most likely no source control class is enabled.
                this.projectEditAnswer = "1";
                return;
              }
              const actionToProcess: UserAction = data.result.content.pop();

              if (actionToProcess.reload) {
                // Avoid the reload triggering the edit listener here
                suppressEditListenerMap.set(this.uri.toString(), true);
                await vscode.commands.executeCommand("workbench.action.files.revert", this.uri);
              }

              const attemptedEditLabel = getOtherStudioActionLabel(OtherStudioAction.AttemptedEdit);
              if (afterUserAction && actionToProcess.errorText !== "") {
                if (action.label === attemptedEditLabel) {
                  if (this.name.toUpperCase().endsWith(".PRJ")) {
                    // Store the "answer" so the caller knows there was an error
                    this.projectEditAnswer = "-1";
                  } else if (this.uri) {
                    // Only revert if we have a URI
                    suppressEditListenerMap.set(this.uri.toString(), true);
                    await vscode.commands.executeCommand("workbench.action.files.revert", this.uri);
                  }
                }
                outputChannel.appendLine(actionToProcess.errorText);
                outputChannel.show(true);
              }
              if (actionToProcess && !afterUserAction) {
                const answer = await this.processUserAction(actionToProcess);
                // call AfterUserAction only if there is a valid answer
                if (action.label === attemptedEditLabel) {
                  if (answer != "1" && this.uri) {
                    // Only revert if we have a URI
                    suppressEditListenerMap.set(this.uri.toString(), true);
                    await vscode.commands.executeCommand("workbench.action.files.revert", this.uri);
                  }
                  if (this.name.toUpperCase().endsWith(".PRJ")) {
                    // Store the answer. No answer means "allow the edit".
                    this.projectEditAnswer = answer ?? "1";
                  }
                }
                if (answer) {
                  answer.msg || answer.msg === ""
                    ? this.userAction(action, true, answer.answer, answer.msg, type)
                    : this.userAction(action, true, answer, "", type);
                }
              }
            })
            .then(() => resolve())
            .catch((err) => {
              outputChannel.appendLine(
                `Executing Studio Action "${action.label}" on ${this.api.config.host}:${this.api.config.port}${
                  this.api.config.pathPrefix
                }[${this.api.config.ns}] failed${
                  err.errorText && err.errorText !== "" ? " with the following error:" : "."
                }`
              );
              if (err.errorText && err.errorText !== "") {
                outputChannel.appendLine("\n" + err.errorText);
              }
              outputChannel.show(true);
              reject();
            });
        })
    );
  }

  private prepareMenuItems(menus, sourceControl: boolean): StudioAction[] {
    return menus
      .filter((menu) => sourceControl == (menu.id === "%SourceMenu" || menu.id === "%SourceContext"))
      .reduce(
        (list, sub) =>
          list.concat(
            sub.items
              .filter((el) => el.id !== "")
              .filter((el) => el.separator == 1 || el.enabled == 1)
              .map((el) =>
                el.separator == 1
                  ? {
                      label: "",
                      description: "---",
                      id: "",
                      save: 0,
                    }
                  : {
                      label: el.name.replace("&", ""),
                      description: sub.name.replace("&", ""),
                      id: `${sub.id},${el.id}`,
                      save: el.save,
                    }
              )
          ),
        []
      );
  }

  public getMenu(menuType: StudioMenuType, sourceControl: boolean): Thenable<void> {
    let selectedText = "";
    const editor = vscode.window.activeTextEditor;
    if (this.uri && editor) {
      const selection = editor.selection;
      selectedText = editor.document.getText(selection);
    }

    const query = "select * from %Atelier_v1_Utils.Extension_GetMenus(?,?,?)";
    const parameters = [menuType, this.name, selectedText];

    return this.api
      .actionQuery(query, parameters)
      .then((data) => data.result.content)
      .then((menus) => this.prepareMenuItems(menus, sourceControl))
      .then((menuItems) => {
        return vscode.window.showQuickPick<StudioAction>(menuItems, {
          canPickMany: false,
          placeHolder: `Pick server-side command to perform${this.name ? " on " + this.name : ""}`,
        });
      })
      .then((action) => this.userAction(action));
  }

  public fireOtherStudioAction(action: OtherStudioAction, userAction?: UserAction): void {
    const actionObject = {
      id: action.toString(),
      label: getOtherStudioActionLabel(action),
    };
    if (action === OtherStudioAction.AttemptedEdit) {
      // Check to see if this "attempted edit" was an action by this extension due to a reload.
      // There's no way to detect at a higher level from the event.
      if (suppressEditListenerMap.has(this.uri.toString())) {
        suppressEditListenerMap.delete(this.uri.toString());
        return;
      }
      const query = "select * from %Atelier_v1_Utils.Extension_GetStatus(?)";
      this.api.actionQuery(query, [this.name]).then((statusObj) => {
        const docStatus = statusObj.result.content.pop();
        if (docStatus && !docStatus.editable) {
          this.userAction(actionObject, false, "", "", 1);
        }
      });
    } else if (userAction) {
      this.processUserAction(userAction).then((answer) => {
        if (answer) {
          answer.msg || answer.msg === ""
            ? this.userAction(actionObject, true, answer.answer, answer.msg, 1)
            : this.userAction(actionObject, true, answer, "", 1);
        }
      });
    } else {
      this.userAction(actionObject, false, "", "", 1);
    }
  }

  private async processSaveFlag(saveFlag: number) {
    const bitString = saveFlag.toString().padStart(3, "0");
    const saveAndCompile = async (document: vscode.TextDocument) => {
      if (document.isDirty) {
        // Prevent onDidSave from compiling the file
        // in order to await the importAndCompile function
        documentBeingProcessed = document;
        await document.save();
        await importAndCompile(false, document);
        documentBeingProcessed = null;
      }
    };

    // Save the current document
    if (bitString.charAt(0) === "1") {
      await saveAndCompile(vscode.window.activeTextEditor.document);
    }

    // Save all documents
    if (bitString.charAt(2) === "1") {
      for (const document of vscode.workspace.textDocuments) {
        await saveAndCompile(document);
      }
    }
  }

  public async isSourceControlEnabled(): Promise<boolean> {
    return this.api
      .actionQuery("SELECT %Atelier_v1_Utils.Extension_ExtensionEnabled() AS Enabled", [])
      .then((data) => data.result.content)
      .then((content) => (content && content.length ? content[0]?.Enabled ?? false : false))
      .catch(() => false); // Treat any errors as "no source control"
  }

  public getServerInfo(): { server: string; namespace: string } {
    return {
      server: `${this.api.config.host}:${this.api.config.port}${this.api.config.pathPrefix}`,
      namespace: this.api.config.ns,
    };
  }
}

export async function mainCommandMenu(uri?: vscode.Uri): Promise<void> {
  return _mainMenu(false, uri);
}

export async function mainSourceControlMenu(uri?: vscode.Uri): Promise<void> {
  return _mainMenu(true, uri);
}

async function _mainMenu(sourceControl: boolean, uri?: vscode.Uri): Promise<void> {
  uri = uri || vscode.window.activeTextEditor?.document.uri;
  if (uri && !filesystemSchemas.includes(uri.scheme)) {
    return;
  }
  const studioActions = new StudioActions(uri);
  if (studioActions) {
    if (await studioActions.isSourceControlEnabled()) {
      return studioActions.getMenu(StudioMenuType.Main, sourceControl);
    } else {
      const serverInfo = studioActions.getServerInfo();
      vscode.window.showInformationMessage(
        `No source control class is configured for namespace "${serverInfo.namespace}" on server ${serverInfo.server}.`,
        "Dismiss"
      );
    }
  }
}

export async function contextCommandMenu(node: PackageNode | ClassNode | RoutineNode | ProjectNode): Promise<void> {
  return _contextMenu(false, node);
}

export async function contextSourceControlMenu(
  node: PackageNode | ClassNode | RoutineNode | ProjectNode
): Promise<void> {
  return _contextMenu(true, node);
}

export async function _contextMenu(sourceControl: boolean, node: PackageNode | ClassNode | RoutineNode): Promise<void> {
  const nodeOrUri = node || vscode.window.activeTextEditor?.document.uri;
  if (!nodeOrUri || (nodeOrUri instanceof vscode.Uri && !filesystemSchemas.includes(nodeOrUri.scheme))) {
    return;
  }
  const studioActions = new StudioActions(nodeOrUri);
  if (studioActions) {
    if (await studioActions.isSourceControlEnabled()) {
      return studioActions.getMenu(StudioMenuType.Context, sourceControl);
    } else {
      const serverInfo = studioActions.getServerInfo();
      vscode.window.showInformationMessage(
        `No source control class is configured for namespace "${serverInfo.namespace}" on server ${serverInfo.server}.`,
        "Dismiss"
      );
    }
  }
}

export async function fireOtherStudioAction(
  action: OtherStudioAction,
  uri?: vscode.Uri,
  userAction?: UserAction
): Promise<void> {
  if (vscode.workspace.getConfiguration("objectscript.serverSourceControl", uri)?.get("disableOtherActionTriggers")) {
    return;
  }
  const studioActions = new StudioActions(uri);
  return (
    studioActions &&
    !openCustomEditors.includes(uri?.toString()) && // The custom editor will handle all server-side source control interactions
    studioActions.fireOtherStudioAction(action, userAction)
  );
}
