import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

import { AtelierAPI } from "../../api";
import { getCcsSettings } from "../config/settings";
import { createHttpClient } from "../core/http";
import { logDebug } from "../core/logging";
import { BASE_PATH } from "./routes";

export class SourceControlApi {
  private readonly client: AxiosInstance;

  private constructor(client: AxiosInstance) {
    this.client = client;
  }

  public static fromAtelierApi(api: AtelierAPI): SourceControlApi {
    const { host, port, username, password, https: useHttps, pathPrefix } = api.config;

    if (!host || !port) {
      throw new Error(
        "Nenhuma conexão ativa com servidor InterSystems foi encontrada para este arquivo. Verifique a conexão e o namespace selecionados."
      );
    }

    const normalizedPrefix = pathPrefix ? (pathPrefix.startsWith("/") ? pathPrefix : `/${pathPrefix}`) : "";
    const trimmedPrefix = normalizedPrefix.endsWith("/") ? normalizedPrefix.slice(0, -1) : normalizedPrefix;
    const encodedPrefix = encodeURI(trimmedPrefix);
    const protocol = useHttps ? "https" : "http";
    const defaultBaseUrl = `${protocol}://${host}:${port}${encodedPrefix}${BASE_PATH}`;

    const { endpoint, requestTimeout } = getCcsSettings();
    const baseURL = endpoint ?? defaultBaseUrl;
    const auth =
      typeof username === "string" && typeof password === "string"
        ? {
            username,
            password,
          }
        : undefined;

    logDebug("Creating SourceControl API client", { baseURL, hasAuth: Boolean(auth) });

    const client = createHttpClient({
      baseURL,
      auth,
      defaultTimeout: requestTimeout,
    });

    return new SourceControlApi(client);
  }

  public post<T = unknown, R = AxiosResponse<T>>(
    route: string,
    data?: unknown,
    config?: AxiosRequestConfig<unknown>
  ): Promise<R> {
    return this.client.post<T, R>(route, data, config);
  }
}
