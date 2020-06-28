import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, FILESYSTEM_SCHEMA } from "../extension";
import { outputChannel, outputConsole, currentFile } from "../utils";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { ClassNode } from "../explorer/models/classesNode";
import { PackageNode } from "../explorer/models/packageNode";
import { RoutineNode } from "../explorer/models/routineNode";
import { NodeBase } from "../explorer/models/nodeBase";
import { importAndCompile, loadChanges } from "./compile";

export let documentBeingProcessed: vscode.TextDocument = null;

export enum OtherStudioAction {
  AttemptedEdit = 0,
  CreatedNewDocument = 1,
  DeletedDocument = 2,
  OpenedDocument = 3,
  ClosedDocument = 4,
  ConnectedToNewNamespace = 5,
  FirstTimeDocumentSave = 7,
}

export enum StudioMenuType {
  Main = "main",
  Context = "context",
}

interface StudioAction extends vscode.QuickPickItem {
  name: string;
  id: string;
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
    case OtherStudioAction.FirstTimeDocumentSave:
      label = "Saved Document to Server for the First Time";
      break;
  }
  return label;
}

class StudioActions {
  private uri: vscode.Uri;
  private api: AtelierAPI;
  private name: string;

  public constructor(uriOrNode?: vscode.Uri | PackageNode | ClassNode | RoutineNode) {
    if (uriOrNode instanceof vscode.Uri) {
      const uri: vscode.Uri = uriOrNode;
      this.uri = uri;
      this.name = this.uri.path.slice(1).replace(/\//g, ".");
      this.api = new AtelierAPI(uri.authority);
    } else if (uriOrNode) {
      const node: NodeBase = uriOrNode;
      this.api = new AtelierAPI();
      this.name = node instanceof PackageNode ? node.fullName + ".PKG" : node.fullName;
    } else {
      this.api = new AtelierAPI();
    }
  }

  public processUserAction(userAction): Thenable<any> {
    const serverAction = parseInt(userAction.action || 0, 10);
    const { target, errorText } = userAction;
    if (errorText !== "") {
      outputChannel.appendLine(errorText);
      outputChannel.show();
    }
    if (userAction.reload) {
      const document = vscode.window.activeTextEditor.document;
      loadChanges([currentFile(document)]);
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
      case 2: // Run a CSP page/Template. The Target is the full url to the CSP page/Template
        return new Promise((resolve) => {
          let answer = "2";
          const conn = config().conn;
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
            }
          });
          panel.onDidDispose(() => resolve(answer));

          const url = new URL(`http://${conn.host}:${conn.port}${target}`);
          const api = new AtelierAPI();
          api
            .actionQuery("select %Atelier_v1_Utils.General_GetCSPToken(?) token", [url.toString()])
            .then((tokenObj) => {
              const csptoken = tokenObj.result.content[0].token;
              url.searchParams.set("CSPCHD", csptoken);
              url.searchParams.set("Namespace", conn.ns);
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
      case 3: // Run an EXE on the client.
        throw new Error("Not supported");
      case 4: {
        // Insert the text in Target in the current document at the current selection point
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          editor.edit((editBuilder) => {
            editBuilder.replace(editor.selection, target);
          });
        }
        return;
      }
      case 5: // Studio will open the documents listed in Target
        target.split(",").forEach((element) => {
          let classname = element;
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
                  const cursor = newEditor.selection.active;
                  const newPosition = cursor.with(i + offset, 0);
                  newEditor.selection = new vscode.Selection(newPosition, newPosition);
                  break;
                }
              }
            }
          });
        });
        return;
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
        throw new Error("Not supported");
    }
  }

  private userAction(action, afterUserAction = false, answer = "", msg = "", type = 0): Thenable<void> {
    if (!action) {
      return;
    }
    const func = afterUserAction ? "AfterUserAction(?, ?, ?, ?, ?)" : "UserAction(?, ?, ?, ?)";
    const query = `select * from %Atelier_v1_Utils.Extension_${func}`;
    let selectedText = "";
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      selectedText = editor.document.getText(selection);
    }

    const parameters = afterUserAction
      ? [type.toString(), action.id, this.name, answer, msg]
      : [type.toString(), action.id, this.name, selectedText];

    return vscode.window.withProgress(
      {
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: `Executing user action: ${action.label}`,
      },
      () =>
        this.api
          .actionQuery(query, parameters)
          .then(async (data) => {
            if (action.save) {
              await this.processSaveFlag(action.save);
            }
            outputConsole(data.console);
            return data.result.content.pop();
          })
          .then(this.processUserAction)
          .then((answer) => {
            if (answer) {
              return answer.msg || answer.msg === ""
                ? this.userAction(action, true, answer.answer, answer.msg, type)
                : this.userAction(action, true, answer, "", type);
            }
          })
          .catch((err) => {
            console.log(err);
            outputChannel.appendLine(`Studio Action "${action.label}" not supported`);
            outputChannel.show();
          })
    );
  }

  private prepareMenuItems(menus, sourceControl: boolean): any[] {
    return menus
      .filter((menu) => sourceControl == (menu.id === "%SourceMenu" || menu.id === "%SourceContext"))
      .reduce(
        (list, sub) =>
          list.concat(
            sub.items
              .filter((el) => el.id !== "" && el.separator == 0)
              .filter((el) => el.enabled == 1)
              .map((el) => ({
                ...el,
                id: `${sub.id},${el.id}`,
                label: el.name.replace("&", ""),
                itemId: el.id,
                type: sub.type,
                description: sub.name.replace("&", ""),
              }))
          ),
        []
      );
  }

  public getMenu(menuType: StudioMenuType, sourceControl: boolean): Thenable<any> {
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

  public fireOtherStudioAction(action: OtherStudioAction) {
    const actionObject = {
      id: action.toString(),
      label: getOtherStudioActionLabel(action),
    };
    if (action === OtherStudioAction.AttemptedEdit) {
      const query = "select * from %Atelier_v1_Utils.Extension_GetStatus(?)";
      this.api.actionQuery(query, [this.name]).then((statusObj) => {
        const docStatus = statusObj.result.content.pop();
        if (!docStatus.editable) {
          vscode.commands.executeCommand("undo");
          this.userAction(actionObject, false, "", "", 1);
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
}

export async function mainCommandMenu(uri?: vscode.Uri): Promise<any> {
  return _mainMenu(false, uri);
}

export async function mainSourceControlMenu(uri?: vscode.Uri): Promise<any> {
  return _mainMenu(true, uri);
}

async function _mainMenu(sourceControl: boolean, uri?: vscode.Uri): Promise<any> {
  uri = uri || vscode.window.activeTextEditor?.document.uri;
  if (uri && uri.scheme !== FILESYSTEM_SCHEMA) {
    return;
  }
  const studioActions = new StudioActions(uri);
  return studioActions && studioActions.getMenu(StudioMenuType.Main, sourceControl);
}

export async function contextCommandMenu(node: PackageNode | ClassNode | RoutineNode): Promise<any> {
  return _contextMenu(false, node);
}

export async function contextSourceControlMenu(node: PackageNode | ClassNode | RoutineNode): Promise<any> {
  return _contextMenu(true, node);
}

export async function _contextMenu(sourceControl: boolean, node: PackageNode | ClassNode | RoutineNode): Promise<any> {
  const nodeOrUri = node || vscode.window.activeTextEditor?.document.uri;
  if (!nodeOrUri || (nodeOrUri instanceof vscode.Uri && nodeOrUri.scheme !== FILESYSTEM_SCHEMA)) {
    return;
  }
  const studioActions = new StudioActions(nodeOrUri);
  return studioActions && studioActions.getMenu(StudioMenuType.Context, sourceControl);
}

export async function fireOtherStudioAction(action: OtherStudioAction, uri?: vscode.Uri): Promise<void> {
  const studioActions = new StudioActions(uri);
  return studioActions && studioActions.fireOtherStudioAction(action);
}
