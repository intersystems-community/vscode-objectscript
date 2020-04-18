import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config, FILESYSTEM_SCHEMA } from "../extension";
import { outputChannel } from "../utils";

interface StudioAction extends vscode.QuickPickItem {
  name: string;
  id: string;
}

class StudioActions {
  private uri: vscode.Uri;
  private api: AtelierAPI;
  private name: string;

  public constructor(uri: vscode.Uri) {
    this.uri = uri;
    this.name = this.uri.path.slice(1).replace(/\//g, ".");
    this.api = new AtelierAPI(uri.authority);
  }

  public processUserAction(userAction): Thenable<any> {
    const serverAction = parseInt(userAction.action || 0, 10);
    const { target, errorText } = userAction;
    if (errorText !== "") {
      outputChannel.appendLine(errorText);
      outputChannel.show();
    }
    outputChannel.appendLine(JSON.stringify(userAction));
    switch (serverAction) {
      case 0:
        /// do nothing
        break;
      case 1: // Display the default Studio dialog with a yes/no/cancel button.
        return vscode.window
          .showWarningMessage(target, { modal: true }, "Yes", "No")
          .then(answer => (answer === "Yes" ? "1" : answer === "No" ? "0" : "2"));
      case 2: // Run a CSP page/Template. The Target is the full url to the CSP page/Template
        // Open the target URL in a webview
        const conn = config().conn;
        const column = vscode.window.activeTextEditor
          ? vscode.window.activeTextEditor.viewColumn
          : undefined;
        const panel = vscode.window.createWebviewPanel(
          'studioactionwebview',
          'CSP Page',
          column || vscode.ViewColumn.One,
          {
            enableScripts: true,
          }
        );
        panel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <style type="text/css">
              body, html
              {
                margin: 0; padding: 0; height: 100%; overflow: hidden;
              }
              #content
              {
                position:absolute; left: 0; right: 0; bottom: 0; top: 0px;
              }
            </style>
          </head>
          <body>
            <div id="content">
              <iframe src="http://${conn.host}:${conn.port}${target}" onLoad="checkForCancelState()" width="100%" height="100%" frameborder="0"></iframe>
            </div>
            <script>
              function checkForCancelState() {
                var x = document.getElementsByTagName("BODY")[0];
                console.log(x);
              }
            </script>
          </body>
          </html>
          `;
        panel.onDidDispose(
          () => {
            // fire a cancel answer if the user closes the webview
            return "2";
          }
        );
        // TODO: use panel.dispose() when the cancel text is sent back in the iframe
        break;
        // throw new Error("Not suppoorted");
      case 3: // Run an EXE on the client.
        throw new Error("Not suppoorted");
      case 4: // Insert the text in Target in the current document at the current selection point
        throw new Error("Not suppoorted");
      case 5: // Studio will open the documents listed in Target
        throw new Error("Not suppoorted");
      case 6: // Display an alert dialog in Studio with the text from the Target variable.
        return vscode.window.showWarningMessage(target, { modal: true });
      case 7: // Display a dialog with a textbox and Yes/No/Cancel buttons.
        return vscode.window.showInputBox({
          prompt: target,
        });
      default:
        throw new Error("Not suppoorted");
    }
  }

  private userAction(action, afterUserAction = false, answer = "", msg = ""): Thenable<void> {
    if (!action) {
      return;
    }
    const func = afterUserAction ? "AfterUserAction" : "UserAction";
    const query = `select * from %Atelier_v1_Utils.Extension_${func}(?, ?, ?, ?)`;
    let selectedText = "";
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      selectedText = "";
    }
    const selection = editor.selection;
    selectedText = editor.document.getText(selection);

    const parameters = afterUserAction
      ? ["0", action.id, this.name, answer]
      : ["0", action.id, this.name, selectedText];
    return vscode.window.withProgress(
      {
        cancellable: false,
        location: vscode.ProgressLocation.Notification,
        title: `Executing user action: ${action.label}`,
      },
      () =>
        this.api
          .actionQuery(query, parameters)
          .then(data => data.result.content.pop())
          .then(this.processUserAction)
          .then(answer => {
            if (answer) {
              return this.userAction(action, true, answer);
            }
          })
          .catch(err => {
            outputChannel.appendLine(`Studio Action "${action.label}" not supported`);
            outputChannel.show();
          })
    );
  }

  private constructMenu(menu): any[] {
    return menu
      .reduce(
        (list, sub) =>
          list.concat(
            sub.items
              .filter(el => el.id !== "" && el.separator == 0)
              // .filter(el => el.enabled == 1)
              .map(el => ({
                ...el,
                id: `${sub.id},${el.id}`,
                label: el.name.replace("&", ""),
                itemId: el.id,
                type: sub.type,
              }))
          ),
        []
      )
      .sort((el1, el2) => (el1.type === "main" && el2.type !== el1.type ? -1 : 1))
      .filter((item: any, index: number, self: any) => {
        if (item && item.type === "main") {
          return true;
        }
        return self.findIndex((el): boolean => el.itemId === item.itemId) === index;
      });
  }

  public getMenu(menuType: string): Thenable<any> {
    const query = "select * from %Atelier_v1_Utils.Extension_GetMenus(?,?,?)";
    const parameters = [menuType, this.name, ""];

    return this.api
      .actionQuery(query, parameters)
      .then(data => data.result.content)
      .then(this.constructMenu)
      .then(menuItems => {
        return vscode.window.showQuickPick<StudioAction>(menuItems, { canPickMany: false });
      })
      .then(action => this.userAction(action));
  }
}

// export function contextMenu(uri: vscode.Uri): Promise<void> {
//   return doMenuAction(uri, "context");
// }

export async function mainMenu(uri: vscode.Uri) {
  uri = uri || vscode.window.activeTextEditor.document.uri;
  if (!uri || uri.scheme !== FILESYSTEM_SCHEMA) {
    return;
  }
  const studioActions = new StudioActions(uri);
  return studioActions && studioActions.getMenu("");
}
