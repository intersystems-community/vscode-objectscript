import { inspect } from "util";

import { outputChannel } from "../../utils";
import { getCcsSettings } from "../config/settings";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const PREFIX = "[CCS]";

export function logDebug(message: string, ...details: unknown[]): void {
  if (!getCcsSettings().debugLogging) {
    return;
  }
  writeLog("DEBUG", message, details);
}

export function logInfo(message: string, ...details: unknown[]): void {
  writeLog("INFO", message, details);
}

export function logWarn(message: string, ...details: unknown[]): void {
  writeLog("WARN", message, details);
}

export function logError(message: string, error?: unknown): void {
  const details = error ? [formatError(error)] : [];
  writeLog("ERROR", message, details);
}

function writeLog(level: LogLevel, message: string, details: unknown[]): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`${PREFIX} ${timestamp} ${level}: ${message}`);
  if (details.length > 0) {
    for (const detail of details) {
      outputChannel.appendLine(`${PREFIX}   ${stringify(detail)}`);
    }
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return inspect(value, { depth: 4, breakLength: Infinity });
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }
  return stringify(error);
}
