import * as vscode from "vscode";
import { Formatter } from "./Formatter";

export class CodeActionProvider implements vscode.CodeActionProvider {
  private _formatter: Formatter;
  public constructor() {
    this._formatter = new Formatter();
  }

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const codeActions: vscode.CodeAction[] = [];
    context.diagnostics.forEach(diagnostic => {
      if (diagnostic.code === "$zobjxxx") {
        const text = document.getText(diagnostic.range).toLowerCase();
        let replacement = "";
        switch (text) {
          case "$zobjclassmethod":
            replacement = "$classmethod";
            break;
          case "$zobjmethod":
            replacement = "$method";
            break;
          case "$zobjproperty":
            replacement = "$property";
            break;
          case "$zobjclass":
            replacement = "$classname";
            break;
          default:
        }
        if (replacement.length) {
          replacement = this._formatter.function(replacement);
          codeActions.push(this.createFix(document, diagnostic.range, replacement));
        }
      }
    });
    return codeActions;
  }

  private createFix(document: vscode.TextDocument, range: vscode.Range, replacement: string): vscode.CodeAction {
    const fix = new vscode.CodeAction(`Replace with ${replacement}`, vscode.CodeActionKind.QuickFix);
    fix.edit = new vscode.WorkspaceEdit();
    fix.edit.replace(document.uri, range, replacement);
    return fix;
  }
}
