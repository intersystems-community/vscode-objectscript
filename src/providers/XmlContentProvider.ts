import * as vscode from "vscode";

/** Provides the contents of UDL documents extracted from XML files. */
export class XmlContentProvider implements vscode.TextDocumentContentProvider {
  /** A cache of UDL documents extratced from an XML file. */
  private _udlDocsPerXmlFile: Map<string, { name: string; content: string[] }[]> = new Map();
  private onDidChangeEvent: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();

  public provideTextDocumentContent(uri: vscode.Uri): string | undefined {
    return this._udlDocsPerXmlFile
      .get(uri.fragment)
      ?.find((d) => d.name == uri.path)
      ?.content.join("\n");
  }

  public get onDidChange(): vscode.Event<vscode.Uri> {
    return this.onDidChangeEvent.event;
  }

  /**
   * Add `udlDocs` extracted from XML file `uri` to the cache.
   * Called by `previewXMLAsUDL()`.
   */
  public addUdlDocsForFile(uri: string, udlDocs: { name: string; content: string[] }[]): void {
    this._udlDocsPerXmlFile.set(uri, udlDocs);
  }

  /**
   * Remove UDL documents extracted from XML file `uri` from the cache.
   * Called by `previewXMLAsUDL()`.
   */
  public removeUdlDocsForFile(uri: string): void {
    this._udlDocsPerXmlFile.delete(uri);
  }
}
