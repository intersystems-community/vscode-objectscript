import * as vscode from "vscode";

import { AtelierAPI } from "../../../api";
import { getCcsSettings } from "../../config/settings";
import { logDebug } from "../../core/logging";
import { ResolveContextExpressionResult } from "../../core/types";
import { SourceControlApi } from "../client";
import { ROUTES } from "../routes";

interface ResolveContextExpressionPayload {
  routine: string;
  contextExpression: string;
}

export class ContextExpressionClient {
  private readonly apiFactory: (api: AtelierAPI) => SourceControlApi;

  public constructor(apiFactory: (api: AtelierAPI) => SourceControlApi = SourceControlApi.fromAtelierApi) {
    this.apiFactory = apiFactory;
  }

  public async resolve(
    document: vscode.TextDocument,
    payload: ResolveContextExpressionPayload
  ): Promise<ResolveContextExpressionResult> {
    const api = new AtelierAPI(document.uri);

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = this.apiFactory(api);
    } catch (error) {
      logDebug("Failed to create SourceControl API client for context expression", error);
      throw error;
    }

    const { requestTimeout } = getCcsSettings();

    try {
      const response = await sourceControlApi.post<ResolveContextExpressionResult>(
        ROUTES.resolveContextExpression(),
        payload,
        {
          timeout: requestTimeout,
          validateStatus: (status) => status >= 200 && status < 300,
        }
      );

      if (typeof response.data === "undefined" || response.data === null) {
        return {};
      }

      return response.data;
    } catch (error) {
      logDebug("Context expression resolution failed", error);
      throw error;
    }
  }
}
