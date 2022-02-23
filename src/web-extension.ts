// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { getLanguageConfiguration } from "./languageConfiguration";

import { ObjectScriptClassSymbolProvider } from "./providers/ObjectScriptClassSymbolProvider";
import { ObjectScriptRoutineSymbolProvider } from "./providers/ObjectScriptRoutineSymbolProvider";

const documentSelector = (...list: string[]) => list.map((language) => ({ scheme: "file", language }));

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<any> {
  vscode.commands.executeCommand("setContext", "vscode-objectscript.connectActive", false);

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassSymbolProvider()
    ),
    vscode.languages.registerDocumentSymbolProvider(
      documentSelector("objectscript"),
      new ObjectScriptRoutineSymbolProvider()
    ),
    vscode.languages.setLanguageConfiguration("objectscript-class", getLanguageConfiguration("class")),
    vscode.languages.setLanguageConfiguration("objectscript", getLanguageConfiguration("routine")),
    vscode.languages.setLanguageConfiguration("objectscript-int", getLanguageConfiguration("routine")),
    vscode.languages.setLanguageConfiguration("objectscript-macros", getLanguageConfiguration("routine"))
  );
}

export function deactivate(): void {
  // nothing here
}
