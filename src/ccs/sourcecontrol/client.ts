import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

import { AtelierAPI } from "../../api";
import { getCcsSettings } from "../config/settings";
import { createHttpClient } from "../core/http";
import { logDebug } from "../core/logging";
import { BASE_PATH } from "./routes";

const ccsSessionMap = new Map<string, string[]>();

function updateCcsSession(sessionKey: string, newCookies: string[]): void {
  const cookies = ccsSessionMap.get(sessionKey) ?? [];
  for (const cookie of newCookies) {
    const [cookieName] = cookie.split("=");
    const index = cookies.findIndex((c) => c.startsWith(cookieName));
    if (index >= 0) {
      cookies[index] = cookie;
    } else {
      cookies.push(cookie);
    }
  }
  ccsSessionMap.set(sessionKey, cookies);
}

export class SourceControlApi {
  private readonly client: AxiosInstance;

  private constructor(client: AxiosInstance) {
    this.client = client;
  }

  public static fromAtelierApi(api: AtelierAPI): SourceControlApi {
    const { host, port, auth: authorization, https: useHttps, pathPrefix } = api.config;
    const { username, password } = authorization;

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
    const auth = typeof username === "string" && typeof password === "string" ? { username, password } : undefined;

    const sessionKey = `${username}@${host}:${port}${encodedPrefix}`;

    logDebug("Creating SourceControl API client", {
      baseURL,
      hasAuth: Boolean(auth),
      hasCookies: (ccsSessionMap.get(sessionKey) ?? []).length > 0,
    });

    const client = createHttpClient({ baseURL, auth, defaultTimeout: requestTimeout });

    client.interceptors.request.use((config) => {
      const cookies = ccsSessionMap.get(sessionKey);
      if (cookies?.length) {
        config.headers["Cookie"] = cookies.join("; ");
      }
      return config;
    });

    client.interceptors.response.use((response) => {
      const setCookie = response.headers["set-cookie"];
      if (Array.isArray(setCookie) && setCookie.length) {
        updateCcsSession(sessionKey, setCookie);
      }
      return response;
    });

    return new SourceControlApi(client);
  }

  public post<T = unknown>(
    route: string,
    data?: unknown,
    config?: AxiosRequestConfig<unknown>
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(route, data, config);
  }

  public get<T = unknown>(route: string, config?: AxiosRequestConfig<unknown>): Promise<AxiosResponse<T>> {
    return this.client.get<T>(route, config);
  }

  public delete<T = unknown>(route: string, config?: AxiosRequestConfig<unknown>): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(route, config);
  }
}
