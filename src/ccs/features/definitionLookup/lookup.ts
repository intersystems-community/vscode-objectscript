import * as vscode from "vscode";

import { ResolveDefinitionClient } from "../../sourcecontrol/clients/resolveDefinitionClient";
import { currentFile, CurrentTextFile } from "../../../utils";
import { extractDefinitionQuery, QueryMatch } from "./extractQuery";

const sharedClient = new ResolveDefinitionClient();

export interface LookupOptions {
  client?: ResolveDefinitionClient;
  onNoResult?: (details: { query: string; originalQuery?: string }) => void;
}

export async function lookupCcsDefinition(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
  options: LookupOptions = {}
): Promise<vscode.Location | undefined> {
  const match = extractDefinitionQuery(document, position);
  if (!match) {
    return undefined;
  }

  if (!shouldUseExternalResolver(document, match)) {
    return undefined;
  }

  const client = options.client ?? sharedClient;
  const location = await client.resolve(document, match.normalizedQuery, token);
  if (!location) {
    options.onNoResult?.({ query: match.normalizedQuery, originalQuery: match.query });
  }
  return location;
}

function shouldUseExternalResolver(document: vscode.TextDocument, match: QueryMatch): boolean {
  const current = currentFile(document);
  if (!current) {
    return true;
  }

  switch (match.kind) {
    case "macro":
      return !hasLocalMacroDefinition(document, match.symbolName);
    case "class":
      return !isCurrentClass(current, match.symbolName);
    case "labelRoutine":
    case "routine":
      return !isCurrentRoutine(current, match.symbolName);
    default:
      return true;
  }
}

function hasLocalMacroDefinition(document: vscode.TextDocument, macroName?: string): boolean {
  if (!macroName) {
    return false;
  }
  const regex = new RegExp(`^[\t ]*#def(?:ine|1arg)\\s+${macroName}\\b`, "mi");
  return regex.test(document.getText());
}

function isCurrentClass(current: CurrentTextFile, target?: string): boolean {
  if (!target || !current.name.toLowerCase().endsWith(".cls")) {
    return false;
  }
  const currentClassName = current.name.slice(0, -4);
  return currentClassName.toLowerCase() === target.toLowerCase();
}

function isCurrentRoutine(current: CurrentTextFile, target?: string): boolean {
  if (!target) {
    return false;
  }
  const routineMatch = current.name.match(/^(.*)\.(mac|int|inc)$/i);
  if (!routineMatch) {
    return false;
  }
  const [, routineName] = routineMatch;
  return routineName.toLowerCase() === target.toLowerCase();
}
