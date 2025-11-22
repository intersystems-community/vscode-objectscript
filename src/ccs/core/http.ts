import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import * as https from "https";
import * as vscode from "vscode";

import { logDebug, logError } from "./logging";
import { getCcsSettings } from "../config/settings";

interface CreateClientOptions {
  baseURL: string;
  auth?: AxiosRequestConfig["auth"];
  defaultTimeout?: number;
}

export function createHttpClient(options: CreateClientOptions): AxiosInstance {
  const { baseURL, auth, defaultTimeout } = options;
  const strictSSL = vscode.workspace.getConfiguration("http").get<boolean>("proxyStrictSSL");
  const httpsAgent = new https.Agent({ rejectUnauthorized: strictSSL });
  const timeout = typeof defaultTimeout === "number" ? defaultTimeout : getCcsSettings().requestTimeout;

  const client = axios.create({
    baseURL,
    auth,
    timeout,
    headers: { "Content-Type": "application/json" },
    httpsAgent,
  });

  attachLogging(client);

  return client;
}

function attachLogging(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    logDebug(`HTTP ${config.method?.toUpperCase()} ${resolveFullUrl(client, config)}`);
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      logDebug(`HTTP ${response.status} ${resolveFullUrl(client, response.config)}`);
      return response;
    },
    (error: AxiosError) => {
      if (axios.isCancel(error)) {
        logDebug("HTTP request cancelled");
        return Promise.reject(error);
      }

      const status = error.response?.status;
      const url = resolveFullUrl(client, error.config ?? {});
      const message = typeof status === "number" ? `HTTP ${status} ${url}` : `HTTP request failed ${url}`;
      logError(message, error);
      return Promise.reject(error);
    }
  );
}

function resolveFullUrl(client: AxiosInstance, config: AxiosRequestConfig | InternalAxiosRequestConfig): string {
  const base = config.baseURL ?? client.defaults.baseURL ?? "";
  const url = config.url ?? "";
  if (!base) {
    return url;
  }

  if (/^https?:/i.test(url)) {
    return url;
  }

  return `${base}${url}`;
}

export function createAbortSignal(token?: vscode.CancellationToken): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();

  if (!token) {
    return { signal: controller.signal, dispose: () => undefined };
  }

  const subscription = token.onCancellationRequested(() => controller.abort());

  return {
    signal: controller.signal,
    dispose: () => subscription.dispose(),
  };
}
