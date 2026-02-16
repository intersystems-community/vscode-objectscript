import * as vscode from "vscode";

import { AtelierAPI } from "../../../api";
import { getCcsSettings } from "../../config/settings";
import { createAbortSignal } from "../../core/http";
import { logDebug } from "../../core/logging";
import { SourceControlApi } from "../client";
import { ROUTES } from "../routes";

const ALLOWED_FLAGS = new Set(["agrupSetPiece", "objDynamic"]);

export interface ConverterRequestBody {
  item: string;
}

export interface ConverterCustomRequestBody extends ConverterRequestBody {
  tipoConversao: 0 | 1 | 2;
  flgPersistencia: 0 | 1 | 2;
  flgEliminarCSMV: 0 | 1;
  strFlagsConv?: string;
  strParamPersist?: string;
}

export interface ConverterCoreParams {
  tipoConversao?: number;
  flgPersistencia?: number;
  flgEliminarCSMV?: number;
  strFlagsConv?: string;
  strParamPersist?: string;
}

export class ConverterClient {
  private readonly apiFactory: (api: AtelierAPI) => SourceControlApi;

  public constructor(apiFactory: (api: AtelierAPI) => SourceControlApi = SourceControlApi.fromAtelierApi) {
    this.apiFactory = apiFactory;
  }

  public async convertDefault(
    document: vscode.TextDocument,
    item: string,
    token?: vscode.CancellationToken
  ): Promise<string> {
    this.validateItem(item);
    return this.converterCore(document, item, {}, token);
  }

  public async convertCustom(
    document: vscode.TextDocument,
    params: ConverterCustomRequestBody,
    token?: vscode.CancellationToken
  ): Promise<string> {
    this.validateItem(params.item);
    this.validateTipoConversao(params.tipoConversao);
    this.validateFlgPersistencia(params.flgPersistencia);
    this.validateFlgEliminarCSMV(params.flgEliminarCSMV);

    return this.converterCore(document, params.item, params, token);
  }

  private async converterCore(
    document: vscode.TextDocument,
    item: string,
    params: ConverterCoreParams,
    token?: vscode.CancellationToken
  ): Promise<string> {
    const api = this.resolveApi(document);

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = this.apiFactory(api);
    } catch (error) {
      logDebug("Failed to create SourceControl API client for conversão", error);
      throw error;
    }

    const body: ConverterRequestBody | ConverterCustomRequestBody = {
      item,
      ...(this.hasCustomParams(params)
        ? {
            tipoConversao: params.tipoConversao ?? 0,
            flgPersistencia: params.flgPersistencia ?? 0,
            flgEliminarCSMV: params.flgEliminarCSMV ?? 0,
            strFlagsConv: this.normalizeFlags(params.strFlagsConv),
            strParamPersist: params.strParamPersist?.trim() ?? "",
          }
        : {}),
    };

    const route = this.hasCustomParams(params)
      ? ROUTES.converterArquivoCustomizado(api.ns)
      : ROUTES.converterArquivo(api.ns);

    const { requestTimeout } = getCcsSettings();
    const { signal, dispose } = createAbortSignal(token);

    try {
      const response = await sourceControlApi.post<string>(route, body, {
        timeout: requestTimeout,
        signal,
        responseType: "text",
        transformResponse: (data) => data,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      return typeof response.data === "string" ? response.data : "";
    } catch (error) {
      logDebug("Conversão de arquivo request failed", error);
      throw error;
    } finally {
      dispose();
    }
  }

  private resolveApi(document: vscode.TextDocument): AtelierAPI {
    let api = new AtelierAPI(document.uri);

    if (!api.active || !api.ns) {
      const fallbackApi = new AtelierAPI();

      if (fallbackApi.active && fallbackApi.ns) {
        api = fallbackApi;
      } else {
        throw new Error("No active namespace for conversão de arquivo.");
      }
    }

    return api;
  }

  private hasCustomParams(params: ConverterCoreParams): boolean {
    return (
      typeof params.tipoConversao !== "undefined" ||
      typeof params.flgPersistencia !== "undefined" ||
      typeof params.flgEliminarCSMV !== "undefined" ||
      typeof params.strFlagsConv !== "undefined" ||
      typeof params.strParamPersist !== "undefined"
    );
  }

  private normalizeFlags(flags?: string): string {
    if (!flags?.trim()) {
      return "";
    }

    const normalized = flags
      .split(",")
      .map((flag) => flag.trim())
      .filter((flag) => flag.length > 0);

    normalized.forEach((flag) => {
      if (!ALLOWED_FLAGS.has(flag)) {
        throw new Error(`Flag inválida em strFlagsConv: ${flag}.`);
      }
    });

    return normalized.join(",");
  }

  private validateItem(item: string): void {
    if (!item?.trim()) {
      throw new Error("O campo 'item' é obrigatório.");
    }
  }

  private validateTipoConversao(tipoConversao: number): void {
    if (![0, 1, 2].includes(tipoConversao)) {
      throw new Error("tipoConversao deve ser 0, 1 ou 2.");
    }
  }

  private validateFlgPersistencia(flgPersistencia: number): void {
    if (![0, 1, 2].includes(flgPersistencia)) {
      throw new Error("flgPersistencia deve ser 0, 1 ou 2.");
    }
  }

  private validateFlgEliminarCSMV(flgEliminarCSMV: number): void {
    if (![0, 1].includes(flgEliminarCSMV)) {
      throw new Error("flgEliminarCSMV deve ser 0 ou 1.");
    }
  }
}
