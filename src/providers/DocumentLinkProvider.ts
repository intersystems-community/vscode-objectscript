import * as vscode from "vscode";
import { DocumentContentProvider } from "./DocumentContentProvider";

interface StudioLink {
  uri: vscode.Uri;
  range: vscode.Range;
  filename: string;
  methodname?: string;
  offset: number;
}

export class DocumentLinkProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<StudioLink[]> {
    // Possible link formats:
    // SomePackage.SomeClass.cls(SomeMethod+offset)
    // SomePackage.SomeClass.cls(offset)
    // SomeRoutine.int(offset)
    const regexs = [/((?:\w|\.)+)\((\w+)\+(\d+)\)/, /((?:\w|\.)+)\((\d+)\)/];
    const documentLinks: StudioLink[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;

      regexs.forEach((regex) => {
        const match = regex.exec(text);
        if (match != null) {
          const filename = match[1];
          let methodname;
          let offset;

          if (match.length >= 4) {
            methodname = match[2];
            offset = parseInt(match[3]);
          } else {
            offset = parseInt(match[2]);
          }

          documentLinks.push({
            range: new vscode.Range(
              new vscode.Position(i, match.index),
              new vscode.Position(i, match.index + match[0].length)
            ),
            uri: DocumentContentProvider.getUri(filename),
            filename,
            methodname,
            offset,
          });
        }
      });
    }
    return documentLinks;
  }

  public async resolveDocumentLink(link: StudioLink, token: vscode.CancellationToken): Promise<vscode.DocumentLink> {
    const editor = await vscode.window.showTextDocument(link.uri);
    let offset = link.offset;

    // add the offset of the method if it is a class
    if (link.methodname) {
      const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", link.uri);
      const method = symbols[0].children.find(
        (info) => (info.detail === "ClassMethod" || info.detail === "Method") && info.name === link.methodname
      );
      offset += method.location.range.start.line + 1;
    }

    // move the cursor
    const cursor = editor.selection.active;
    const newPosition = cursor.with(offset, 0);
    editor.selection = new vscode.Selection(newPosition, newPosition);

    return new vscode.DocumentLink(link.range, link.uri);
  }
}
