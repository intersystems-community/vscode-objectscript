import * as vscode from "vscode";

import { LocationJSON } from "../core/types";

export function normalizeFilePath(filePath: string): string {
  if (!filePath) {
    return filePath;
  }

  const trimmed = filePath.trim();
  if (/^file:\/\//i.test(trimmed)) {
    return trimmed.replace(/\\/g, "/");
  }

  const normalized = trimmed.replace(/\\/g, "/");
  return normalized;
}

export function toFileUri(filePath: string): vscode.Uri {
  const normalized = normalizeFilePath(filePath);
  if (/^file:\/\//i.test(normalized)) {
    return vscode.Uri.parse(normalized);
  }

  return vscode.Uri.file(normalized);
}

export function toVscodeLocation(location: LocationJSON): vscode.Location | undefined {
  if (!location.uri || typeof location.line !== "number") {
    return undefined;
  }

  const uri = toFileUri(location.uri);
  const zeroBasedLine = Math.max(0, Math.floor(location.line) - 1);
  return new vscode.Location(uri, new vscode.Position(zeroBasedLine, 0));
}
