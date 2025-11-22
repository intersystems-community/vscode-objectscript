import * as path from "path";
import * as vscode from "vscode";

import { DocumentContentProvider } from "../../providers/DocumentContentProvider";
import { AtelierAPI } from "../../api";
import { FILESYSTEM_SCHEMA } from "../../extension";
import { handleError, outputChannel } from "../../utils";
import { LocateTriggersClient, LocateTriggersPayload } from "../sourcecontrol/clients/locateTriggersClient";
import { getUrisForDocument } from "../../utils/documentIndex";
import { notIsfs } from "../../utils";
import { getCcsSettings } from "../config/settings";
import { createAbortSignal } from "../core/http";
import { logDebug } from "../core/logging";
import { ResolveDefinitionResponse } from "../core/types";
import { SourceControlApi } from "../sourcecontrol/client";
import { ROUTES } from "../sourcecontrol/routes";
import { toVscodeLocation } from "../sourcecontrol/paths";

const TRIGGER_PATTERNS = [/GatilhoRegra\^%CSW1GATCUST/i, /GatilhoInterface\^%CSW1GATCUST/i];

const sharedClient = new LocateTriggersClient();

interface RoutineLocation {
  routineName: string;
  line: number;
}

export async function locateTriggers(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  const routineName = path.basename(editor.document.fileName);
  if (!routineName) {
    void vscode.window.showErrorMessage("Routine name not available for localizar gatilhos.");
    return;
  }

  const selectedText = getSelectedOrCurrentLineText(editor);
  const payload: LocateTriggersPayload = { routineName };

  if (shouldSendSelectedText(selectedText)) {
    payload.selectedText = escapeTriggerText(selectedText);
  }

  try {
    const { content, api } = await sharedClient.locate(editor.document, payload);

    if (!content || !content.trim()) {
      void vscode.window.showInformationMessage("Localizar Gatilhos não retornou nenhum conteúdo.");
      return;
    }

    await renderContentToOutput(content, api.ns);
  } catch (error) {
    handleError(error, "Falha ao localizar gatilhos.");
  }
}

export async function openLocatedTriggerLocation(location?: RoutineLocation & { namespace?: string }): Promise<void> {
  if (!location?.routineName || !location.line) {
    return;
  }

  const namespace = location.namespace ?? new AtelierAPI().ns;

  if (!namespace) {
    void vscode.window.showErrorMessage("Não foi possível determinar o namespace para abrir o gatilho.");
    return;
  }

  await openRoutineLocation(location.routineName, location.line, namespace);
}

function getSelectedOrCurrentLineText(editor: vscode.TextEditor): string {
  const { selection, document } = editor;

  if (!selection || selection.isEmpty) {
    return document.lineAt(selection.active.line).text.trim();
  }

  return document.getText(selection).trim();
}

function shouldSendSelectedText(text: string): boolean {
  return TRIGGER_PATTERNS.some((pattern) => pattern.test(text));
}

function escapeTriggerText(text: string): string {
  return text.replace(/"/g, '""');
}

async function renderContentToOutput(content: string, namespace?: string): Promise<void> {
  const annotatedLines = await annotateRoutineLocations(content, namespace);

  annotatedLines.forEach((line) => outputChannel.appendLine(line));
  outputChannel.show(true);
}

async function annotateRoutineLocations(content: string, namespace?: string): Promise<string[]> {
  const routineLineRegex = /^\s*([\w%][\w%.-]*\.[\w]+)\((\d+)\)/i;
  const resolutionCache = new Map<string, Promise<vscode.Uri | undefined>>();

  const getResolvedUri = (routineName: string): Promise<vscode.Uri | undefined> => {
    const normalizedName = routineName.toLowerCase();

    if (!resolutionCache.has(normalizedName)) {
      resolutionCache.set(normalizedName, resolveWorkspaceRoutineUri(routineName));
    }

    return resolutionCache.get(normalizedName) ?? Promise.resolve(undefined);
  };

  return Promise.all(
    content.split(/\r?\n/).map(async (line) => {
      const match = routineLineRegex.exec(line);

      if (!match) {
        return line;
      }

      const [, routineName, lineStr] = match;
      const lineNumber = Number.parseInt(lineStr, 10);

      if (!Number.isFinite(lineNumber)) {
        return line;
      }

      const resolvedUri = await getResolvedUri(routineName);
      const baseLine = line.replace(/\s+$/, "");

      if (resolvedUri) {
        return `${baseLine} (${resolvedUri.toString()})`;
      }

      return baseLine;
    })
  );
}

async function openRoutineLocation(routineName: string, line: number, namespace: string): Promise<void> {
  const targetUri = await resolveRoutineUri(routineName, namespace);

  if (!targetUri) {
    void vscode.window.showErrorMessage(`Não foi possível abrir a rotina ${routineName}.`);
    return;
  }

  const document = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const targetLine = Math.max(line - 1, 0);
  const position = new vscode.Position(targetLine, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

async function getRoutineUriFromDefinition(routineName: string, namespace: string): Promise<vscode.Uri | undefined> {
  const api = new AtelierAPI();
  api.setNamespace(namespace);

  if (!api.active || !api.ns) {
    return undefined;
  }

  let sourceControlApi: SourceControlApi;

  try {
    sourceControlApi = SourceControlApi.fromAtelierApi(api);
  } catch (error) {
    logDebug("Failed to create SourceControl API client for resolveDefinition", error);
    return undefined;
  }

  const { requestTimeout } = getCcsSettings();
  const tokenSource = new vscode.CancellationTokenSource();
  const { signal, dispose } = createAbortSignal(tokenSource.token);
  const query = `^${routineName}`;

  try {
    const response = await sourceControlApi.post<ResolveDefinitionResponse>(
      ROUTES.resolveDefinition(api.ns),
      { query },
      {
        timeout: requestTimeout,
        signal,
        validateStatus: (status) => status >= 200 && status < 300,
      }
    );

    return toVscodeLocation(response.data ?? {})?.uri;
  } catch (error) {
    logDebug("ResolveDefinition lookup for localizar gatilhos failed", error);
    return undefined;
  } finally {
    dispose();
    tokenSource.dispose();
  }
}

async function getRoutineUri(routineName: string, namespace: string): Promise<vscode.Uri | null> {
  const workspaceUri = await findWorkspaceRoutineUri(routineName);

  if (workspaceUri) {
    return workspaceUri;
  }

  const primaryUri = DocumentContentProvider.getUri(routineName, undefined, namespace);

  if (primaryUri) {
    if (primaryUri.scheme === "file") {
      try {
        await vscode.workspace.fs.stat(primaryUri);
        return primaryUri;
      } catch (error) {
        // Fall back to isfs when the routine isn't available locally.
      }
    } else {
      return primaryUri;
    }
  }

  const fallbackWorkspaceUri = vscode.Uri.parse(`${FILESYSTEM_SCHEMA}://consistem:${namespace}/`);
  return (
    DocumentContentProvider.getUri(routineName, undefined, namespace, undefined, fallbackWorkspaceUri, true) ??
    primaryUri
  );
}

async function resolveRoutineUri(routineName: string, namespace?: string): Promise<vscode.Uri | undefined> {
  const workspaceUri = await findWorkspaceRoutineUri(routineName);

  if (workspaceUri) {
    return workspaceUri;
  }

  if (!namespace) {
    return undefined;
  }

  const definitionUri = await getRoutineUriFromDefinition(routineName, namespace);

  if (definitionUri) {
    return definitionUri;
  }

  return (await getRoutineUri(routineName, namespace)) ?? undefined;
}

async function resolveWorkspaceRoutineUri(routineName: string): Promise<vscode.Uri | undefined> {
  const workspaceUri = await findWorkspaceRoutineUri(routineName);

  if (!workspaceUri) {
    return undefined;
  }

  try {
    await vscode.workspace.fs.stat(workspaceUri);
    return workspaceUri;
  } catch (error) {
    return undefined;
  }
}

async function findWorkspaceRoutineUri(routineName: string): Promise<vscode.Uri | undefined> {
  const workspaces = vscode.workspace.workspaceFolders ?? [];
  const candidates: vscode.Uri[] = [];
  const dedupe = new Set<string>();
  const preferredRoot = normalizeFsPath(path.normalize("C:/workspacecsw/projetos/COMP-7.0/xcustom/"));

  const addCandidate = (uri: vscode.Uri): void => {
    if (!notIsfs(uri) || dedupe.has(uri.toString())) {
      return;
    }

    candidates.push(uri);
    dedupe.add(uri.toString());
  };

  for (const workspace of workspaces) {
    if (!notIsfs(workspace.uri)) {
      continue;
    }

    for (const uri of getUrisForDocument(routineName, workspace)) {
      addCandidate(uri);
    }
  }

  const allMatches = await vscode.workspace.findFiles(`**/${routineName}`);
  const preferredMatches: vscode.Uri[] = [];

  for (const uri of allMatches) {
    if (!notIsfs(uri)) {
      continue;
    }

    const normalizedPath = normalizeFsPath(uri.fsPath);

    if (normalizedPath.includes(preferredRoot)) {
      preferredMatches.push(uri);
    }

    addCandidate(uri);
  }

  if (preferredMatches.length) {
    return preferredMatches[0];
  }

  if (!candidates.length) {
    return undefined;
  }

  const preferredSegment = `${path.sep}xcustom${path.sep}`;

  return (
    candidates.find((uri) => {
      const lowerPath = normalizeFsPath(uri.fsPath);
      return (
        lowerPath.includes(preferredSegment) || lowerPath.includes("/xcustom/") || lowerPath.includes("\\xcustom\\")
      );
    }) ?? candidates[0]
  );
}

function normalizeFsPath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}
