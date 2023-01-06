import * as vscode from "vscode";
import { currentFile } from "../utils";

export class FileDecorationProvider implements vscode.FileDecorationProvider {
  private _genBadge = String.fromCharCode(9965); // Gear
  private _genTooltip = "Generated";
  onDidChangeFileDecorations: vscode.Event<vscode.Uri>;

  emitter = new vscode.EventEmitter<vscode.Uri>();

  public constructor() {
    this.onDidChangeFileDecorations = this.emitter.event;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    let result: vscode.FileDecoration | undefined = undefined;

    // Only provide decorations for files that are open and not untitled
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() == uri.toString());
    if (
      doc != undefined &&
      !doc.isUntitled &&
      ["objectscript", "objectscript-class", "objectscript-int", "objectscript-macros"].includes(doc.languageId) &&
      vscode.workspace
        .getConfiguration("objectscript", vscode.workspace.getWorkspaceFolder(uri))
        .get<boolean>("showGeneratedFileDecorations")
    ) {
      // Use the file's contents to check if it's generated
      if (doc.languageId == "objectscript-class") {
        for (let line = 0; line < doc.lineCount; line++) {
          const lineText = doc.lineAt(line).text;
          if (lineText.startsWith("Class ")) {
            const clsMatch = lineText.match(/[[, ]{1}GeneratedBy *= *([^,\] ]+)/i);
            if (clsMatch) {
              // This class is generated
              result = new vscode.FileDecoration(this._genBadge, `${this._genTooltip} by ${clsMatch[1]}`);
            }
            break;
          }
        }
      } else {
        const firstLine = doc.lineAt(0).text;
        if (firstLine.startsWith("ROUTINE ") && firstLine.includes("Generated]")) {
          // This routine is generated
          let tooltip = this._genTooltip;
          const file = currentFile(doc)?.name;
          if (file) {
            const macMatch = file.match(/^(.*)\.G[0-9]+\.mac$/);
            const intMatch = file.match(/^(.*)\.[0-9]+\.int$/);
            if (macMatch) {
              tooltip += ` by ${macMatch[1]}.cls`;
            } else if (intMatch) {
              tooltip += ` by ${intMatch[1]}.cls`;
            } else if (doc.languageId == "objectscript-int") {
              tooltip += ` by ${file.slice(0, -3)}mac`;
            }
          }
          result = new vscode.FileDecoration(this._genBadge, tooltip);
        }
      }
    }

    return result;
  }
}
