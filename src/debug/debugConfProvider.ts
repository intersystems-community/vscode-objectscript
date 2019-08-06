import vscode = require("vscode");

import {
  CancellationToken,
  DebugConfiguration,
  DebugConfigurationProvider,
  ProviderResult,
  WorkspaceFolder,
} from "vscode";

export class ObjectScriptConfigurationProvider implements DebugConfigurationProvider {
  /**
   * Massage a debug configuration just before a debug session is being launched,
   * e.g. add all missing attributes to the debug configuration.
   */
  public resolveDebugConfiguration(
    folder: WorkspaceFolder | undefined,
    config: DebugConfiguration,
    token?: CancellationToken
  ): ProviderResult<DebugConfiguration> {
    // if launch.json is missing or empty
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === "markdown") {
        config.type = "objectscript";
        config.name = "Launch";
        config.request = "launch";
        config.program = "${file}";
        // config.stopOnEntry = true;
      }
    }

    if (config.request === "launch" && !config.program) {
      return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
        return undefined; // abort launch
      });
    }

    return config;
  }
}
