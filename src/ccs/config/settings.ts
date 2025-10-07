import * as vscode from "vscode";

export interface CcsSettings {
  endpoint?: string;
  requestTimeout: number;
  debugLogging: boolean;
  flags: Record<string, boolean>;
}

const CCS_CONFIGURATION_SECTION = "objectscript.ccs";
const DEFAULT_TIMEOUT = 500;

export function getCcsSettings(): CcsSettings {
  const configuration = vscode.workspace.getConfiguration(CCS_CONFIGURATION_SECTION);
  const endpoint = sanitizeEndpoint(configuration.get<string | undefined>("endpoint"));
  const requestTimeout = coerceTimeout(configuration.get<number | undefined>("requestTimeout"));
  const debugLogging = Boolean(configuration.get<boolean | undefined>("debugLogging"));
  const flags = configuration.get<Record<string, boolean>>("flags") ?? {};

  return {
    endpoint,
    requestTimeout,
    debugLogging,
    flags,
  };
}

export function isFlagEnabled(flag: string, settings: CcsSettings = getCcsSettings()): boolean {
  return Boolean(settings.flags?.[flag]);
}

function sanitizeEndpoint(endpoint?: string): string | undefined {
  if (!endpoint) {
    return undefined;
  }

  const trimmed = endpoint.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
}

function coerceTimeout(timeout: number | undefined): number {
  if (typeof timeout !== "number" || Number.isNaN(timeout)) {
    return DEFAULT_TIMEOUT;
  }

  return Math.max(0, Math.floor(timeout));
}
