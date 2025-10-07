import axios from "axios";
import * as vscode from "vscode";

import { AtelierAPI } from "../../../api";
import { getCcsSettings } from "../../config/settings";
import { createAbortSignal } from "../../core/http";
import { logDebug } from "../../core/logging";
import { ResolveDefinitionResponse } from "../../core/types";
import { SourceControlApi } from "../client";
import { ROUTES } from "../routes";
import { toVscodeLocation } from "../paths";

export class ResolveDefinitionClient {
  private readonly apiFactory: (api: AtelierAPI) => SourceControlApi;

  public constructor(apiFactory: (api: AtelierAPI) => SourceControlApi = SourceControlApi.fromAtelierApi) {
    this.apiFactory = apiFactory;
  }

  private getAdditionalNamespaces(currentApi: AtelierAPI): string[] {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) {
      return [];
    }

    const { host, port } = currentApi.config;
    const currentPathPrefix = currentApi.config.pathPrefix ?? "";
    const currentNamespace = currentApi.ns;

    if (!host || !port) {
      return [];
    }

    const namespaces = new Set<string>();

    for (const folder of workspaceFolders) {
      const folderApi = new AtelierAPI(folder.uri);
      if (!folderApi.active) {
        continue;
      }

      const { host: folderHost, port: folderPort } = folderApi.config;
      const folderPathPrefix = folderApi.config.pathPrefix ?? "";

      if (folderHost !== host || folderPort !== port || folderPathPrefix !== currentPathPrefix) {
        continue;
      }

      const folderNamespace = folderApi.ns;
      if (!folderNamespace || folderNamespace === currentNamespace) {
        continue;
      }

      namespaces.add(folderNamespace.toUpperCase());
    }

    return Array.from(namespaces);
  }

  public async resolve(
    document: vscode.TextDocument,
    query: string,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | undefined> {
    const api = new AtelierAPI(document.uri);
    const { host, port, username, password } = api.config;
    const namespace = api.ns;

    if (!api.active || !namespace || !host || !port || !username || !password) {
      logDebug("CCS definition lookup skipped due to missing connection metadata", {
        active: api.active,
        namespace,
        host,
        port,
        username: Boolean(username),
        password: Boolean(password),
      });
      return undefined;
    }

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = this.apiFactory(api);
    } catch (error) {
      logDebug("Failed to create SourceControl API client", error);
      return undefined;
    }

    const { requestTimeout } = getCcsSettings();
    const { signal, dispose } = createAbortSignal(token);

    const otherNamespaces = this.getAdditionalNamespaces(api);
    const otherNamespacesStr = otherNamespaces.join(";");
    const body = otherNamespaces.length ? { query, otherNamespaces: otherNamespacesStr } : { query };

    logDebug("CCS definition lookup request", {
      namespace,
      endpoint: ROUTES.resolveDefinition(namespace),
      body,
    });

    try {
      const response = await sourceControlApi.post<ResolveDefinitionResponse>(
        ROUTES.resolveDefinition(namespace),
        body,
        {
          timeout: requestTimeout,
          signal,
          validateStatus: (status) => status >= 200 && status < 300,
        }
      );

      const location = toVscodeLocation(response.data ?? {});
      if (!location) {
        logDebug("CCS definition lookup returned empty payload", response.data);
      }
      return location ?? undefined;
    } catch (error) {
      if (axios.isCancel(error)) {
        logDebug("CCS definition lookup cancelled");
        return undefined;
      }

      logDebug("CCS definition lookup failed", error);
      return undefined;
    } finally {
      dispose();
    }
  }
}
