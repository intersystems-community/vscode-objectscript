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
}

export class LocateTriggersClient {
  private readonly apiFactory: (api: AtelierAPI) => SourceControlApi;

  public constructor(apiFactory: (api: AtelierAPI) => SourceControlApi = SourceControlApi.fromAtelierApi) {
    this.apiFactory = apiFactory;
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
