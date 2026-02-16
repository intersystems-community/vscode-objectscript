import * as vscode from "vscode";

export interface CcsSettings {
  endpoint?: string;
  requestTimeout: number;
  debugLogging: boolean;
  flags: Record<string, boolean>;
  autoConvertOnSave: boolean;
  autoConvertExcludePackages: string[];
}

const CCS_CONFIGURATION_SECTION = "objectscript.ccs";
const CONSISTEM_CONFIGURATION_SECTION = "consistem";
const DEFAULT_TIMEOUT = 5000;
const DEFAULT_AUTO_CONVERT_EXCLUDE_PACKAGES = ["cswutil70"];

export function getCcsSettings(): CcsSettings {
  const configuration = vscode.workspace.getConfiguration(CCS_CONFIGURATION_SECTION);
  const endpoint = sanitizeEndpoint(configuration.get<string | undefined>("endpoint"));
  const requestTimeout = coerceTimeout(configuration.get<number | undefined>("requestTimeout"));
  const debugLogging = Boolean(configuration.get<boolean | undefined>("debugLogging"));
  const flags = configuration.get<Record<string, boolean>>("flags") ?? {};
  const consistemConfiguration = vscode.workspace.getConfiguration(CONSISTEM_CONFIGURATION_SECTION);
  const autoConvertOnSave = getAutoConvertOnSaveSetting(consistemConfiguration);
  const autoConvertExcludePackages = sanitizeExcludePackages(
    getAutoConvertExcludePackagesSetting(consistemConfiguration)
  );

  return {
    endpoint,
    requestTimeout,
    debugLogging,
    flags,
    autoConvertOnSave,
    autoConvertExcludePackages,
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

function sanitizeExcludePackages(packages: string[] | undefined): string[] {
  if (!Array.isArray(packages)) {
    return DEFAULT_AUTO_CONVERT_EXCLUDE_PACKAGES;
  }

  return packages
    .map((pkg) => (typeof pkg === "string" ? pkg.trim().toLowerCase() : ""))
    .filter((pkg) => pkg.length > 0);
}

function getAutoConvertOnSaveSetting(configuration: vscode.WorkspaceConfiguration): boolean {
  const consistemValue = configuration.get<boolean | undefined>("converterItem.autoConvertOnSave");
  if (typeof consistemValue === "boolean") {
    return consistemValue;
  }

  // Backward compatibility for previous key path
  return vscode.workspace.getConfiguration(CCS_CONFIGURATION_SECTION).get<boolean>("autoConvertOnSave", true);
}

function getAutoConvertExcludePackagesSetting(configuration: vscode.WorkspaceConfiguration): string[] | undefined {
  const consistemValue = configuration.get<string[] | undefined>("converterItem.autoConvertExcludePackages");
  if (Array.isArray(consistemValue)) {
    return consistemValue;
  }

  // Backward compatibility for previous key path
  return vscode.workspace
    .getConfiguration(CCS_CONFIGURATION_SECTION)
    .get<string[] | undefined>("autoConvertExcludePackages");
}
