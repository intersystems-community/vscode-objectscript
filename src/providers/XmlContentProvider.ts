import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { outputChannel } from "../utils";

export class XmlContentProvider implements vscode.TextDocumentContentProvider {
  private _api: AtelierAPI;
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  public constructor() {
    this._api = new AtelierAPI();
  }

  public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    return vscode.workspace
      .openTextDocument(vscode.Uri.file(uri.fragment))
      .then((document) => document.getText())
      .then((text) => {
        return this._api
          .cvtXmlUdl(text)
          .then((data) => data.result.content[0].content.join("\n"))
          .catch((error) => {
            let message = `Failed to convert XML of '${uri.path.slice(1)}' to UDL.`;
            if (error.errorText && error.errorText !== "") {
              outputChannel.appendLine("\n" + error.errorText);
              outputChannel.show(true);
              message += " Check 'ObjectScript' Output channel for details.";
            }
            vscode.window.showErrorMessage(message, "Dismiss");
          });
      });
  }

  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  public update(uri: vscode.Uri, message?: string): void {
    this.onDidChangeEvent.fire(uri);
  }
}
