import * as vscode from "vscode";

export class FileSearchProvider implements vscode.FileSearchProvider {
  /**
   * Provide the set of files that match a certain file path pattern.
   * @param query The parameters for this query.
   * @param options A set of options to consider while searching files.
   * @param token A cancellation token.
   */
  public provideFileSearchResults(
    query: vscode.FileSearchQuery,
    options: vscode.FileSearchOptions,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Uri[]> {
    return [];
  }
}
