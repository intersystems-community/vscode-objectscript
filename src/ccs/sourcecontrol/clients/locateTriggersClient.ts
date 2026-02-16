import * as vscode from "vscode";

import { AtelierAPI } from "../../../api";
import { getCcsSettings } from "../../config/settings";
import { createAbortSignal } from "../../core/http";
import { logDebug } from "../../core/logging";
import { SourceControlApi } from "../client";
import { ROUTES } from "../routes";

export interface LocateTriggersPayload {
  routineName: string;
  selectedText?: string;
  conta?: string;
}

export interface LocateTriggerCompaniesPayload {
  routineName: string;
  selectedText?: string;
}

export interface TriggerCompany {
  conta: string;
  descricaoConta: string;
  quantidade: number;
}

function parseTriggerCompaniesResponse(data: unknown): TriggerCompany[] {
  const toCompany = (item: unknown): TriggerCompany | undefined => {
    if (typeof item !== "object" || item === null) {
      return undefined;
    }

    const candidate = item as Record<string, unknown>;
    const conta = typeof candidate.conta === "string" ? candidate.conta : undefined;
    const descricaoConta = typeof candidate.descricaoConta === "string" ? candidate.descricaoConta : undefined;
    const quantidadeRaw = candidate.quantidade;
    const quantidade =
      typeof quantidadeRaw === "number"
        ? quantidadeRaw
        : typeof quantidadeRaw === "string"
          ? Number.parseInt(quantidadeRaw, 10)
          : Number.NaN;

    if (!conta || !descricaoConta || !Number.isFinite(quantidade)) {
      return undefined;
    }

    return { conta, descricaoConta, quantidade };
  };

  const asArray = (value: unknown): TriggerCompany[] =>
    Array.isArray(value)
      ? value.map((item) => toCompany(item)).filter((item): item is TriggerCompany => item !== undefined)
      : [];

  const direct = asArray(data);

  if (direct.length) {
    return direct;
  }

  if (typeof data !== "object" || data === null) {
    return [];
  }

  const wrapped = data as Record<string, unknown>;

  return (
    asArray(wrapped.listaConta) ||
    asArray(wrapped.empresas) ||
    asArray(wrapped.items) ||
    asArray(wrapped.data) ||
    asArray(wrapped.result) ||
    []
  );
}

export class LocateTriggersClient {
  private readonly apiFactory: (api: AtelierAPI) => SourceControlApi;

  public constructor(apiFactory: (api: AtelierAPI) => SourceControlApi = SourceControlApi.fromAtelierApi) {
    this.apiFactory = apiFactory;
  }

  public async getCompanies(
    document: vscode.TextDocument,
    payload: LocateTriggerCompaniesPayload,
    token?: vscode.CancellationToken
  ): Promise<TriggerCompany[]> {
    const api = this.resolveApi(document);

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = this.apiFactory(api);
    } catch (error) {
      logDebug("Failed to create SourceControl API client for obter gatilhos por empresa", error);
      throw error;
    }

    const { requestTimeout } = getCcsSettings();
    const { signal, dispose } = createAbortSignal(token);

    const requestConfig = {
      timeout: requestTimeout,
      signal,
      validateStatus: (status: number) => status >= 200 && status < 300,
    };

    try {
      const response = await sourceControlApi.post<TriggerCompany[]>(
        ROUTES.getTriggerCompanies(api.ns),
        payload,
        requestConfig
      );

      return parseTriggerCompaniesResponse(response.data);
    } catch (error) {
      logDebug("Obter gatilhos por empresa request failed", error);
      throw error;
    } finally {
      dispose();
    }
  }
  public async locate(
    document: vscode.TextDocument,
    payload: LocateTriggersPayload,
    token?: vscode.CancellationToken
  ): Promise<{ content: string; api: AtelierAPI }> {
    const api = this.resolveApi(document);

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = this.apiFactory(api);
    } catch (error) {
      logDebug("Failed to create SourceControl API client for localizar gatilhos", error);
      throw error;
    }

    const { requestTimeout } = getCcsSettings();
    const { signal, dispose } = createAbortSignal(token);

    try {
      const response = await sourceControlApi.post<string>(ROUTES.locateTriggers(api.ns), payload, {
        timeout: requestTimeout,
        signal,
        responseType: "text",
        transformResponse: (data) => data,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      return { content: typeof response.data === "string" ? response.data : "", api };
    } catch (error) {
      logDebug("Localizar gatilhos request failed", error);
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
        throw new Error("No active namespace for localizar gatilhos.");
      }
    }

    return api;
  }
}
