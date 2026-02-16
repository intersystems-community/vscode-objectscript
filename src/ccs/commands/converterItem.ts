import * as path from "path";
import * as vscode from "vscode";

import { waitForCompileToFinish } from "../../commands/compile";
import { handleError, outputChannel } from "../../utils";
import { getCcsSettings } from "../config/settings";
import { logDebug } from "../core/logging";
import { ConverterClient, ConverterCustomRequestBody } from "../sourcecontrol/clients/converterClient";

const sharedClient = new ConverterClient();

interface NumericOption<T extends number> extends vscode.QuickPickItem {
  value: T;
}

const tipoConversaoOptions: NumericOption<0 | 1 | 2>[] = [
  { label: "Completa", description: "0", value: 0 },
  { label: "Básica", description: "1", value: 1 },
  { label: "Somente Flags", description: "2", value: 2 },
];

const persistenciaOptions: NumericOption<0 | 1 | 2>[] = [
  { label: "Não", description: "0", value: 0 },
  { label: "Globais Conf.", description: "1", value: 1 },
  { label: "Todas as Globais", description: "2", value: 2 },
];

const eliminarCsmvOptions: NumericOption<0 | 1>[] = [
  { label: "Sim", description: "0", value: 0 },
  { label: "Não", description: "1", value: 1 },
];

const flagsOptions: vscode.QuickPickItem[] = [{ label: "agrupSetPiece" }, { label: "objDynamic" }];

export async function convertCurrentItem(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    void vscode.window.showErrorMessage("Nenhum arquivo ativo para conversão.");
    return;
  }

  await convertDocumentItem(editor.document, "Falha ao converter item.");
}

export async function convertCurrentItemCustom(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    void vscode.window.showErrorMessage("Nenhum arquivo ativo para conversão.");
    return;
  }

  const item = getItemName(editor.document);

  try {
    const tipoConversao = await pickOption("Tipo de conversão", tipoConversaoOptions);
    if (tipoConversao === undefined) return;

    const flgPersistencia = await pickOption("Persistência", persistenciaOptions);
    if (flgPersistencia === undefined) return;

    const flgEliminarCSMV = await pickOption("Eliminar %CSMV", eliminarCsmvOptions);
    if (flgEliminarCSMV === undefined) return;

    const selectedFlags = await vscode.window.showQuickPick(flagsOptions, {
      title: "Flags de conversão",
      placeHolder: "Selecione as flags de conversão",
      canPickMany: true,
      ignoreFocusOut: true,
    });

    if (selectedFlags === undefined) return;

    const strParamPersist = await vscode.window.showInputBox({
      title: "Complemento de persistência",
      prompt: "Informe strParamPersist (opcional)",
      placeHolder: "Ex: -log",
      ignoreFocusOut: true,
    });

    if (strParamPersist === undefined) return;

    const payload: ConverterCustomRequestBody = {
      item,
      tipoConversao,
      flgPersistencia,
      flgEliminarCSMV,
      strFlagsConv: selectedFlags.map((flag) => flag.label).join(","),
      strParamPersist,
    };

    const responseText = await sharedClient.convertCustom(editor.document, payload);

    renderConversionOutput(responseText);
  } catch (error) {
    handleError(error, "Falha ao converter item customizado.");
  }
}

export async function convertCurrentItemOnSave(document: vscode.TextDocument): Promise<void> {
  const settings = getCcsSettings();

  if (
    !settings.autoConvertOnSave ||
    !isMacDocument(document) ||
    isInExcludedPackage(document, settings.autoConvertExcludePackages)
  ) {
    return;
  }

  await waitForCompileBeforeAutoConvert(document);
  await convertDocumentItem(document, "Falha ao converter item automaticamente ao salvar.", true);
}

async function waitForCompileBeforeAutoConvert(document: vscode.TextDocument): Promise<void> {
  try {
    await waitForCompileToFinish(document);
  } catch (error) {
    logDebug("Falha ao aguardar compilação antes da conversão automática", error);
  }
}

async function convertDocumentItem(
  document: vscode.TextDocument,
  errorMessage: string,
  silentError = false
): Promise<void> {
  const item = getItemName(document);

  try {
    const responseText = await sharedClient.convertDefault(document, item);
    renderConversionOutput(responseText);
  } catch (error) {
    if (silentError) {
      logDebug("Falha na conversão automática ao salvar", error);
      return;
    }

    handleError(error, errorMessage);
  }
}

function isMacDocument(document: vscode.TextDocument): boolean {
  return path.extname(document.fileName).toLowerCase() === ".mac";
}

function isInExcludedPackage(document: vscode.TextDocument, excludedPackages: string[]): boolean {
  const normalizedExcluded = new Set(excludedPackages.map((pkg) => pkg.toLowerCase()));
  const pathParts = document.fileName
    .split(/[/\\]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  return pathParts.some((part) => normalizedExcluded.has(part));
}

function renderConversionOutput(responseText: string): void {
  responseText
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .forEach((line) => outputChannel.appendLine(line));

  outputChannel.show(true);
}

async function pickOption<T extends number>(title: string, options: NumericOption<T>[]): Promise<T | undefined> {
  const selected = await vscode.window.showQuickPick(options, {
    title,
    ignoreFocusOut: true,
  });

  return selected?.value;
}

function getItemName(document: vscode.TextDocument): string {
  return path.basename(document.fileName);
}
