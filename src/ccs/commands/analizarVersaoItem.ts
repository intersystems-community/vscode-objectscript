import * as path from "path";
import * as vscode from "vscode";

import { AtelierAPI } from "../../api";
import { currentFile, handleError, outputChannel } from "../../utils";
import { AnalizarVersaoItemClient } from "../sourcecontrol/clients/analizarVersaoItemClient";

const sharedClient = new AnalizarVersaoItemClient();

export async function analizarVersaoItem(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    void vscode.window.showErrorMessage("Nenhum arquivo ativo para analizar versão do item.");
    return;
  }

  // Para classes precisamos do nome completo do documento (ex.: `Fat.NotaFiscal.cls`),
  // não apenas do nome do arquivo. `currentFile` extrai o nome real do conteúdo
  // (declaração `Class`/`ROUTINE`); só usamos o basename como último recurso.
  const item = currentFile(editor.document)?.name ?? path.basename(editor.document.fileName);

  if (!item) {
    void vscode.window.showErrorMessage("Nome do item não disponível para analizar versão.");
    return;
  }

  const api = resolveApi(editor.document);

  if (!api) {
    return;
  }

  const { username, password } = api.config.auth;

  if (typeof username !== "string" || typeof password !== "string") {
    void vscode.window.showErrorMessage("Credenciais não disponíveis para analizar versão do item.");
    return;
  }

  try {
    const responseText = await sharedClient.analisar(editor.document, { item, username, password });

    if (!responseText || !responseText.trim()) {
      void vscode.window.showInformationMessage("Analizar Versão do Item não retornou nenhum conteúdo.");
      return;
    }

    renderToOutput(responseText);
  } catch (error) {
    handleError(error, "Falha ao analizar versão do item.");
  }
}

function resolveApi(document: vscode.TextDocument): AtelierAPI | undefined {
  let api = new AtelierAPI(document.uri);

  if (!api.active || !api.ns) {
    const fallbackApi = new AtelierAPI();

    if (fallbackApi.active && fallbackApi.ns) {
      api = fallbackApi;
    } else {
      void vscode.window.showErrorMessage(
        "Nenhum namespace ativo foi encontrado. Verifique a conexão ativa e tente novamente."
      );
      return undefined;
    }
  }

  return api;
}

function renderToOutput(responseText: string): void {
  responseText
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .forEach((line) => outputChannel.appendLine(line));

  outputChannel.show(true);
}
