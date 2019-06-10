import vscode = require("vscode");
const { workspace, window } = vscode;
export const OBJECTSCRIPT_FILE_SCHEMA = "objectscript";
export const OBJECTSCRIPTXML_FILE_SCHEMA = "objectscriptxml";
export const FILESYSTEM_SCHEMA = "isfs";
export const schemas = [
  OBJECTSCRIPT_FILE_SCHEMA,
  OBJECTSCRIPTXML_FILE_SCHEMA,
  FILESYSTEM_SCHEMA,
];

import {
  importAndCompile,
  importFolder as importFileOrFolder,
  namespaceCompile,
} from "./commands/compile";
import { deleteItem } from "./commands/delete";
import { exportAll, exportExplorerItem } from "./commands/export";
import { serverActions } from "./commands/serverActions";
import { subclass } from "./commands/subclass";
import { superclass } from "./commands/superclass";
import { viewOthers } from "./commands/viewOthers";
import { xml2doc } from "./commands/xml2doc";

import { DocumentContentProvider } from "./providers/DocumentContentProvider";
import { DocumentFormattingEditProvider } from "./providers/DocumentFormattingEditProvider";
import { ObjectScriptClassFoldingRangeProvider } from "./providers/ObjectScriptClassFoldingRangeProvider";
import { ObjectScriptClassSymbolProvider } from "./providers/ObjectScriptClassSymbolProvider";
import { ObjectScriptCompletionItemProvider } from "./providers/ObjectScriptCompletionItemProvider";
import { ObjectScriptDefinitionProvider } from "./providers/ObjectScriptDefinitionProvider";
import { ObjectScriptFoldingRangeProvider } from "./providers/ObjectScriptFoldingRangeProvider";
import { ObjectScriptHoverProvider } from "./providers/ObjectScriptHoverProvider";
import { ObjectScriptRoutineSymbolProvider } from "./providers/ObjectScriptRoutineSymbolProvider";
import { XmlContentProvider } from "./providers/XmlContentProvider";

import { StatusCodeError } from "request-promise/errors";
import { AtelierAPI } from "./api";
import { ObjectScriptExplorerProvider } from "./explorer/explorer";
import { WorkspaceNode } from "./explorer/models/workspaceNode";
import { FileSystemProvider } from "./providers/FileSystemPovider/FileSystemProvider";
import { WorkspaceSymbolProvider } from "./providers/WorkspaceSymbolProvider";
import { currentWorkspaceFolder, outputChannel } from "./utils";
export let fileSystemProvider: FileSystemProvider;
export let explorerProvider: ObjectScriptExplorerProvider;
export let documentContentProvider: DocumentContentProvider;
export let workspaceState: vscode.Memento;
export let extensionContext: vscode.ExtensionContext;

export const config = (setting?: string, workspaceFolderName?: string): any => {
  workspaceFolderName = workspaceFolderName || currentWorkspaceFolder();

  if (["conn", "export"].includes(setting)) {
    if (workspaceFolderName && workspaceFolderName !== "") {
      const workspaceFolder = vscode.workspace.workspaceFolders.find(
        (el) => el.name.toLowerCase() === workspaceFolderName.toLowerCase(),
      );
      return vscode.workspace
        .getConfiguration("objectscript", workspaceFolder.uri)
        .get(setting);
    } else {
      return vscode.workspace
        .getConfiguration("objectscript", null)
        .get(setting);
    }
  }
  if (setting && setting !== "") {
    return vscode.workspace.getConfiguration("objectscript").get(setting);
  }
  return vscode.workspace.getConfiguration("objectscript");
};

export function getXmlUri(uri: vscode.Uri): vscode.Uri {
  if (uri.scheme === OBJECTSCRIPTXML_FILE_SCHEMA) {
    return uri;
  }
  return uri.with({
    path: uri.path,
    scheme: OBJECTSCRIPTXML_FILE_SCHEMA,
  });
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  const languages = require(context.asAbsolutePath("./package.json")).contributes.languages.map((lang) => lang.id);
  workspaceState = context.workspaceState;
  extensionContext = context;
  workspaceState.update("workspaceFolder", "");

  explorerProvider = new ObjectScriptExplorerProvider();
  documentContentProvider = new DocumentContentProvider();
  const xmlContentProvider = new XmlContentProvider();
  context.workspaceState.update("xmlContentProvider", xmlContentProvider);
  fileSystemProvider = new FileSystemProvider();

  vscode.window.registerTreeDataProvider(
    "ObjectScriptExplorer",
    explorerProvider,
  );

  const panel = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
  );
  panel.command = "vscode-objectscript.serverActions";
  panel.show();
  const checkConnection = () => {
    const conn = config("conn");
    const connInfo = `${conn.host}:${conn.port}[${conn.ns}]`;
    panel.text = connInfo;
    panel.tooltip = "";
    vscode.commands.executeCommand(
      "setContext",
      "vscode-objectscript.connectActive",
      conn.active,
    );
    if (!conn.active) {
      panel.text = `${connInfo} - Disabled`;
      return;
    }
    const api = new AtelierAPI(currentWorkspaceFolder());
    api
      .serverInfo()
      .then(async (info) => {
        panel.text = `${connInfo} - Connected`;
        explorerProvider.refresh();
      })
      .catch((error) => {
        let message = error.message;
        if (error instanceof StatusCodeError && error.statusCode === 401) {
          message = "Not Authorized";
          outputChannel.appendLine(
            `Authorization error: please check your username/password in the settings,
            and if you have sufficient privileges on the server.`,
          );
        } else {
          outputChannel.appendLine("Error: " + message);
          outputChannel.appendLine("Please check your network settings in the settings.");
        }
        panel.text = `${connInfo} - ERROR`;
        panel.tooltip = message;
      });
  };
  checkConnection();
  vscode.workspace.onDidChangeConfiguration(() => {
    checkConnection();
  });

  workspace.onDidSaveTextDocument((file) => {
    if (!languages.includes(file.languageId)) {
      return;
    }
    vscode.commands.executeCommand("vscode-objectscript.compile");
  });

  vscode.window.onDidChangeActiveTextEditor((textEditor: vscode.TextEditor) => {
    if (config("autoPreviewXML")) {
      xml2doc(context, textEditor);
    }
  });

  const wordPattern =
    /(\"(?:[^\"]|\"\")*\")|((\${1,3}|[irm]?%|\^|#)?[^`~!\@@#\%\^\&*()-\=+[{\]\}\|\;\:\'\"\,.\<>\/\?_\s]+)/;

  const documentSelector = (...list) =>
    ["file", ...schemas].reduce(
      (acc, scheme) =>
        acc.concat(list.map((language) => ({ scheme, language }))),
      [],
    );

  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((e) => {
      if (workspace.workspaceFolders && workspace.workspaceFolders.length > 1) {
        const workspaceFolder = currentWorkspaceFolder();
        if (workspaceFolder && workspaceFolder !== workspaceState.get<string>("workspaceFolder")) {
          workspaceState.update("workspaceFolder", workspaceFolder);
          checkConnection();
        }
      }
    }),

    vscode.commands.registerCommand("vscode-objectscript.output", () => {
      outputChannel.show(true);
    }),
    vscode.commands.registerCommand("vscode-objectscript.compile", () => importAndCompile(false)),
    vscode.commands.registerCommand("vscode-objectscript.touchBar.compile", () => importAndCompile(false)),
    vscode.commands.registerCommand(
      "vscode-objectscript.compileWithFlags",
      () => importAndCompile(true),
    ),
    vscode.commands.registerCommand("vscode-objectscript.compileAll", () =>
      namespaceCompile(false),
    ),
    vscode.commands.registerCommand("vscode-objectscript.compileAllWithFlags", () => namespaceCompile(true)),
    vscode.commands.registerCommand("vscode-objectscript.compileFolder", importFileOrFolder),
    vscode.commands.registerCommand("vscode-objectscript.export", exportAll),
    vscode.commands.registerCommand(
      "vscode-objectscript.viewOthers",
      viewOthers,
    ),
    vscode.commands.registerCommand("vscode-objectscript.subclass", subclass),
    vscode.commands.registerCommand(
      "vscode-objectscript.superclass",
      superclass,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.serverActions",
      serverActions,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.touchBar.viewOthers",
      viewOthers,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.refresh",
      () => explorerProvider.refresh(),
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.openClass",
      vscode.window.showTextDocument,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.openRoutine",
      vscode.window.showTextDocument,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.export",
      exportExplorerItem,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.delete",
      deleteItem,
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.otherNamespace",
      (workspaceNode: WorkspaceNode) => {
        return explorerProvider.selectNamespace(workspaceNode.label);
      },
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.explorer.otherNamespaceClose",
      (workspaceNode: WorkspaceNode) => {
        return explorerProvider.closeExtra4Workspace(
          workspaceNode.label,
          workspaceNode.ns,
        );
      },
    ),
    vscode.commands.registerCommand(
      "vscode-objectscript.previewXml",
      (...args) => {
        xml2doc(context, window.activeTextEditor);
      },
    ),

    vscode.workspace.registerTextDocumentContentProvider(
      OBJECTSCRIPT_FILE_SCHEMA,
      documentContentProvider,
    ),
    vscode.workspace.registerTextDocumentContentProvider(
      OBJECTSCRIPTXML_FILE_SCHEMA,
      xmlContentProvider,
    ),
    vscode.workspace.registerFileSystemProvider(
      FILESYSTEM_SCHEMA,
      fileSystemProvider,
      { isCaseSensitive: true },
    ),
    vscode.languages.setLanguageConfiguration("objectscript-class", {
      wordPattern,
    }),
    vscode.languages.setLanguageConfiguration("objectscript", {
      wordPattern,
    }),
    vscode.languages.setLanguageConfiguration("objectscript-macros", {
      wordPattern,
    }),
    vscode.languages.registerDocumentSymbolProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassSymbolProvider(),
    ),
    vscode.languages.registerDocumentSymbolProvider(
      documentSelector("objectscript"),
      new ObjectScriptRoutineSymbolProvider(),
    ),
    vscode.languages.registerFoldingRangeProvider(
      documentSelector("objectscript-class"),
      new ObjectScriptClassFoldingRangeProvider(),
    ),
    vscode.languages.registerFoldingRangeProvider(
      documentSelector("objectscript"),
      new ObjectScriptFoldingRangeProvider(),
    ),
    vscode.languages.registerDefinitionProvider(
      documentSelector(
        "objectscript-class",
        "objectscript",
        "objectscript-macros",
      ),
      new ObjectScriptDefinitionProvider(),
    ),
    vscode.languages.registerCompletionItemProvider(
      documentSelector(
        "objectscript-class",
        "objectscript",
        "objectscript-macros",
      ),
      new ObjectScriptCompletionItemProvider(),
      "$",
      "^",
      ".",
      "#",
    ),
    vscode.languages.registerHoverProvider(
      documentSelector(
        "objectscript-class",
        "objectscript",
        "objectscript-macros",
      ),
      new ObjectScriptHoverProvider(),
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      documentSelector(
        "objectscript-class",
        "objectscript",
        "objectscript-macros",
      ),
      new DocumentFormattingEditProvider(),
    ),
    vscode.languages.registerWorkspaceSymbolProvider(
      new WorkspaceSymbolProvider(),
    ),
  );
}
