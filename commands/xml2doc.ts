import * as vscode from 'vscode';
import { OBJECTSCRIPTXML_FILE_SCHEMA, config } from '../extension';
import { XmlContentProvider } from '../providers/XmlContentProvider';

export async function xml2doc(context: vscode.ExtensionContext, textEditor: vscode.TextEditor): Promise<void> {
  const xmlContentProvider: XmlContentProvider = context.workspaceState.get('xmlContentProvider');
  if (!config('conn').active) {
    return;
  }

  let uri = textEditor.document.uri;
  if (uri.scheme === 'file' && uri.fsPath.toLowerCase().endsWith('xml')) {
    let line = textEditor.document.lineAt(1).text;
    if (line.match(/<Export generator="(Cache|IRIS)"/)) {
      line = textEditor.document.lineAt(2).text;
      let className = line.match('Class name="([^"]+)"');
      let fileName = '';
      if (className) {
        fileName = className[1] + '.cls';
      }
      if (fileName !== '') {
        let previewUri = vscode.Uri.file(fileName).with({
          scheme: OBJECTSCRIPTXML_FILE_SCHEMA,
          fragment: uri.fsPath
        });
        xmlContentProvider.update(previewUri);
        vscode.window.showTextDocument(previewUri, {
          viewColumn: Math.max(vscode.ViewColumn.Active, 2),
          preserveFocus: true,
          preview: true
        });
      }
    }
  }
}
