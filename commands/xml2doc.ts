import * as vscode from "vscode";
import { config, OBJECTSCRIPTXML_FILE_SCHEMA } from "../extension";
import { XmlContentProvider } from "../providers/XmlContentProvider";

export async function xml2doc(context: vscode.ExtensionContext, textEditor: vscode.TextEditor): Promise<void> {
  const xmlContentProvider: XmlContentProvider = context.workspaceState.get("xmlContentProvider");
  if (!config("conn").active) {
    return;
  }

  const uri = textEditor.document.uri;
  if (uri.scheme === "file" && uri.fsPath.toLowerCase().endsWith("xml")) {
    let line = textEditor.document.lineAt(1).text;
    if (line.match(/<Export generator="(Cache|IRIS)"/)) {
      line = textEditor.document.lineAt(2).text;
      const className = line.match('Class name="([^"]+)"');
      let fileName = "";
      if (className) {
        fileName = className[1] + ".cls";
      }
      if (fileName !== "") {
        const previewUri = vscode.Uri.file(fileName).with({
          fragment: uri.fsPath,
          scheme: OBJECTSCRIPTXML_FILE_SCHEMA,
        });
        xmlContentProvider.update(previewUri);
        vscode.window.showTextDocument(previewUri, {
          preserveFocus: true,
          preview: true,
          viewColumn: Math.max(vscode.ViewColumn.Active, 2),
        });
      }
    }
  }
}
