import * as vscode from "vscode";

import { AtelierAPI } from "../../../api";
import { getCcsSettings } from "../../config/settings";
import { logDebug } from "../../core/logging";
import { SourceControlApi } from "../client";
import { ROUTES } from "../routes";

interface GlobalDocumentationPayload {
  selectedText: string;
}

export class GlobalDocumentationClient {
  private readonly apiFactory: (api: AtelierAPI) => SourceControlApi;

  public constructor(apiFactory: (api: AtelierAPI) => SourceControlApi = SourceControlApi.fromAtelierApi) {
    this.apiFactory = apiFactory;
  }

  public async fetch(document: vscode.TextDocument, payload: GlobalDocumentationPayload): Promise<string> {
    const api = new AtelierAPI(document.uri);

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = this.apiFactory(api);
    } catch (error) {
      logDebug("Failed to create SourceControl API client for global documentation", error);
      throw error;
    }

    const { requestTimeout } = getCcsSettings();

    try {
      const response = await sourceControlApi.post<string>(ROUTES.getGlobalDocumentation(), payload, {
        timeout: requestTimeout,
        responseType: "text",
        transformResponse: [(data) => data],
        validateStatus: (status) => status >= 200 && status < 300,
      });

      return typeof response.data === "string" ? response.data : "";
    } catch (error) {
      logDebug("Global documentation request failed", error);
      throw error;
    }
  }
}
