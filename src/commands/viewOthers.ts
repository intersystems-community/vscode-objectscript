import * as vscode from "vscode";
import { AtelierAPI } from "../api";
import { config } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { currentFile } from "../utils";

export async function viewOthers(forceEditable = false): Promise<void> {
  const file = currentFile();
  if (!file) {
    return;
  }
  if (file.uri.scheme === "file" && !config("conn").active) {
    return;
  }

  const open = async (item: string, forceEditable: boolean) => {
    const colonidx: number = item.indexOf(":");
    if (colonidx !== -1) {
      // A location is appened to the name of the other document
      const options: vscode.TextDocumentShowOptions = {};

      // Split the document name form the location
      let loc = item.slice(colonidx + 1);
      item = item.slice(0, colonidx);
      let uri: vscode.Uri;
      if (forceEditable) {
        uri = DocumentContentProvider.getUri(item, undefined, undefined, forceEditable);
      } else {
        uri = DocumentContentProvider.getUri(item);
      }

      if (item.endsWith(".cls")) {
        // Locations in classes are of the format method+offset+namespace
        loc = loc.slice(0, loc.lastIndexOf("+"));
        let method = loc.slice(0, loc.lastIndexOf("+"));

        // Properly delimit method name if it contains invalid characters
        if (method.match(/(^([A-Za-z]|%)$)|(^([A-Za-z]|%)([A-Za-z]|\d|[^\x20-\x7F])+$)/g) === null) {
          method = '"' + method.replace(/"/g, '""') + '"';
        }

        // Find the location of the given method in the class
        const symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
          "vscode.executeDocumentSymbolProvider",
          uri
        );
        if (symbols !== undefined) {
          for (const symbol of symbols[0].children) {
            if (symbol.name === method) {
              // This is symbol that the location is in
              const doc = await vscode.workspace.openTextDocument(uri);

              // Need to find the actual start of the method
              for (
                let methodlinenum = symbol.selectionRange.start.line;
                methodlinenum <= symbol.range.end.line;
                methodlinenum++
              ) {
                const methodlinetext: string = doc.lineAt(methodlinenum).text.trim();
                if (methodlinetext.endsWith("{")) {
                  // This is the last line of the method definition, so count from here
                  const selectionline: number = methodlinenum + +loc.slice(loc.lastIndexOf("+") + 1);
                  options.selection = new vscode.Range(selectionline, 0, selectionline, 0);
                  break;
                }
              }
              break;
            }
          }
        }
      } else {
        if (item.endsWith(".mac")) {
          // Locations in MAC routines are of the format +offset+namespace
          loc = loc.slice(0, loc.lastIndexOf("+"));
        }
        // Locations in INT routines are of the format +offset
        const linenum: number = +loc.slice(1);
        options.selection = new vscode.Range(linenum, 0, linenum, 0);
      }
      vscode.window.showTextDocument(uri, options);
    } else {
      let uri: vscode.Uri;
      if (forceEditable) {
        uri = DocumentContentProvider.getUri(item, undefined, undefined, forceEditable);
      } else {
        uri = DocumentContentProvider.getUri(item);
      }
      vscode.window.showTextDocument(uri);
    }
  };

  const getOthers = (info) => {
    return info.result.content[0].others;
  };

  const api = new AtelierAPI(file.uri);
  let indexarg: string = file.name;
  const cursorpos: vscode.Position = vscode.window.activeTextEditor.selection.active;
  const fileExt: string = file.name.split(".").pop().toLowerCase();

  if (api.config.apiVersion >= 4 && (fileExt === "cls" || fileExt === "mac" || fileExt === "int")) {
    // Send the server the current position in the document appended to the name if it supports it
    let symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
      "vscode.executeDocumentSymbolProvider",
      file.uri
    );
    if (symbols !== undefined) {
      if (fileExt === "cls") {
        symbols = symbols[0].children;
      }

      let currentSymbol: vscode.DocumentSymbol;
      for (const symbol of symbols) {
        if (symbol.range.contains(cursorpos)) {
          currentSymbol = symbol;
          break;
        }
      }

      if (
        currentSymbol !== undefined &&
        currentSymbol.kind === vscode.SymbolKind.Method &&
        currentSymbol.detail.toLowerCase() !== "query" &&
        currentSymbol.name.charAt(0) !== '"' &&
        currentSymbol.name.charAt(currentSymbol.name.length - 1) !== '"'
      ) {
        // The current position is in a symbol that we can convert into a label+offset that the server understands
        let offset: number = cursorpos.line - currentSymbol.selectionRange.start.line;

        if (fileExt === "cls") {
          // Need to find the actual start of the method
          const currentdoc: vscode.TextDocument = vscode.window.activeTextEditor.document;
          for (
            let methodlinenum = currentSymbol.selectionRange.start.line;
            methodlinenum <= currentSymbol.range.end.line;
            methodlinenum++
          ) {
            const methodlinetext: string = currentdoc.lineAt(methodlinenum).text.trim();
            if (methodlinetext.endsWith("{")) {
              // This is the last line of the method definition, so count from here
              offset = cursorpos.line - methodlinenum;
              break;
            }
          }
        }

        offset = offset < 0 ? 0 : offset;
        indexarg = indexarg + ":" + currentSymbol.name + "+" + offset;
      }
    }
  }

  return api
    .actionIndex([indexarg])
    .then((info) => {
      const listOthers = getOthers(info) || [];
      if (!listOthers.length) {
        return;
      }
      if (listOthers.length === 1) {
        open(listOthers[0], forceEditable);
      } else {
        vscode.window.showQuickPick(listOthers).then((item) => {
          open(item, forceEditable);
        });
      }
    })
    .catch((err) => console.error(err));
}
