import * as vscode from "vscode";

export class DocumentRangeFormattingEditProvider implements vscode.DocumentRangeFormattingEditProvider {
  public provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    return null;
  }
}
