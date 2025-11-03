import * as path from "path";
import { EOL, tmpdir } from "os";
import * as vscode from "vscode";

import { GlobalDocumentationClient } from "../sourcecontrol/clients/globalDocumentationClient";
import { handleError, outputChannel } from "../../utils";

const sharedClient = new GlobalDocumentationClient();

const GLOBAL_DOC_HEADER = "==================== Global Documentation ====================";

function getSelectedOrCurrentLineText(editor: vscode.TextEditor): string {
  const { selection, document } = editor;

  if (!selection || selection.isEmpty) {
    return document.lineAt(selection.active.line).text.trim();
  }

  return document.getText(selection).trim();
}

export async function showGlobalDocumentation(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const selectedText = getSelectedOrCurrentLineText(editor);

  if (!selectedText) {
    void vscode.window.showErrorMessage("Selection is empty. Select text or place the cursor on a line with content.");
    return;
  }

  try {
    const content = await sharedClient.fetch(editor.document, { selectedText });

    if (!content || !content.trim()) {
      void vscode.window.showInformationMessage("Global documentation did not return any content.");
      return;
    }

    const config = vscode.workspace.getConfiguration("consistem");
    const openInFile = config.get<boolean>("globalDocumentation.openInFile", true);

    if (openInFile && (await tryWriteGlobalDocumentationFile(content, config))) {
      return;
    }

    // Fallback to Output Panel
    outputChannel.appendLine(GLOBAL_DOC_HEADER);
    for (const line of content.split(/\r?\n/)) {
      outputChannel.appendLine(line);
    }
    outputChannel.show(true);
  } catch (error) {
    handleError(error, "Failed to retrieve global documentation.");
  }
}

async function tryWriteGlobalDocumentationFile(
  content: string,
  config: vscode.WorkspaceConfiguration
): Promise<boolean> {
  const configuredPath = config.get<string>("globalDocumentation.filePath")?.trim();
  const targetUri = resolveTargetUri(configuredPath);

  if (!targetUri) {
    void vscode.window.showWarningMessage(
      "Unable to resolve the global documentation file path. Showing the content in the output channel instead."
    );
    return false;
  }

  try {
    // Ensure directory exists
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetUri.fsPath)));

    // Read existing content (if any)
    let existingContent = "";
    try {
      const buffer = await vscode.workspace.fs.readFile(targetUri);
      existingContent = Buffer.from(buffer).toString("utf8");
    } catch (readError: unknown) {
      // If the file doesn't exist, proceed without error
      if (!(readError instanceof vscode.FileSystemError) || readError.code !== "FileNotFound") {
        throw readError;
      }
    }

    // Normalize line breaks for the current OS
    const normalizedContent = content.split(/\r?\n/).join(EOL);
    const newSection = `${GLOBAL_DOC_HEADER}${EOL}${normalizedContent}${EOL}`;
    const needsSeparator = existingContent.length > 0 && !existingContent.endsWith(EOL.repeat(2));
    const separator = needsSeparator ? EOL.repeat(2) : "";
    const combinedContent = existingContent ? `${existingContent}${separator}${newSection}` : newSection;

    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(combinedContent, "utf8"));

    // Open the file beside for editing
    const document = await vscode.workspace.openTextDocument(targetUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });

    return true;
  } catch (fileError) {
    handleError(fileError, "Failed to write global documentation to file.");
    return false;
  }
}

/**
 * Always resolves to the system temporary folder.
 * - Absolute path: used as-is.
 * - Non-empty relative path: resolved against tmpdir().
 * - Empty/undefined: uses `<tmpdir>/globalDocumentation.txt`.
 */
function resolveTargetUri(configuredPath: string | undefined): vscode.Uri | undefined {
  try {
    const baseTmp = tmpdir(); // e.g., C:\Users\<user>\AppData\Local\Temp
    const trimmed = (configuredPath ?? "").trim();

    let finalPath: string;
    if (trimmed.length === 0) {
      finalPath = path.join(baseTmp, "globalDocumentation.txt");
    } else if (path.isAbsolute(trimmed)) {
      finalPath = trimmed;
    } else {
      finalPath = path.join(baseTmp, trimmed);
    }

    return vscode.Uri.file(finalPath);
  } catch {
    return undefined;
  }
}
