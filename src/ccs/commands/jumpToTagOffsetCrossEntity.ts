import * as path from "path";
import * as vscode from "vscode";

import { ResolveDefinitionClient } from "../sourcecontrol/clients/resolveDefinitionClient";

const SUPPORTED_LOCAL_LANG_IDS = new Set(["objectscript", "objectscript-int", "objectscript-class"]);

const ERR_SYNTAX = "Entrada inválida.";
const ERR_OFFSET = "Offset deve ser +N (N inteiro >= 0).";
const ERR_ENTITY_FMT = "Item inválido.";
const ERR_ENTITY_NOT_FOUND = "Item não encontrado.";
const ERR_NAME_NOT_FOUND_IN_ENTITY = "Nome não encontrado no item informado.";
const ERR_RESOLVE_FAILED = "Não foi possível localizar o destino.";
const ERR_NAME_REQUIRED = "Informe o nome do item.";

const IDENTIFIER_START = "[A-Za-z_%]";
const IDENTIFIER_BODY = "[A-Za-z0-9_%]";
const CLASS_SEGMENT = `${IDENTIFIER_START}${IDENTIFIER_BODY}*`;
const CLASS_NAME_PATTERN = new RegExp(`^(?:${CLASS_SEGMENT}\\.)*${CLASS_SEGMENT}$`);
const CLASS_DECLARATION_PATTERN = new RegExp(`Class\\s+(${CLASS_SEGMENT}(?:\\.${CLASS_SEGMENT})*)`, "i");
const READABLE_NAME_PATTERN = /^[A-Za-z_%]/;

const ROUTINE_NAME_PATTERN = new RegExp(`^${IDENTIFIER_START}${IDENTIFIER_BODY}*$`);
const CLASS_METHOD_NAME_PATTERN = new RegExp(`^${IDENTIFIER_START}${IDENTIFIER_BODY}*$`);
const ROUTINE_LABEL_NAME_PATTERN = new RegExp(`^[A-Za-z0-9_%][A-Za-z0-9_%]*$`);

const JUMP_QP_CONTEXT_KEY = "vscode-objectscript.ccs.jumpToTagQuickPickActive";
const INSERT_SELECTION_COMMAND_ID = "vscode-objectscript.ccs.jumpToTagOffsetCrossEntity.insertSelection";
const QUICK_PICK_OVERLAY_LINE_PADDING = 6;
const EXTRA_LINES_BELOW_QP = 2;

type EntityKind = "class" | "routine" | "unknown";

interface LocalNameInfo {
  readonly line: number;
  readonly originalName: string;
  readonly selectionRange?: vscode.Range;
  readonly blockRange?: vscode.Range;
}

type LocalNamesMap = Map<string, LocalNameInfo>;

interface DocContext {
  kind: EntityKind;
  displayName: string;
  currentEntityName?: string;
  placeholder: string;
  errLocalNameNotFound: string;
}

interface ParseSuccess {
  readonly input: string;
  readonly name: string;
  readonly offset: number;
  readonly entity?: string;
  readonly localBaseLine?: number;
}

interface ValidationResult {
  ok: true;
  value: ParseSuccess;
}

interface ValidationError {
  ok: false;
  error: string;
}

type ValidationOutcome = ValidationResult | ValidationError;

export async function jumpToTagAndOffsetCrossEntity(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const localNames = SUPPORTED_LOCAL_LANG_IDS.has(document.languageId)
    ? await collectLocalNames(document)
    : new Map<string, LocalNameInfo>();

  const docCtx = buildDocContext(document, localNames);
  const resolveClient = new ResolveDefinitionClient();

  let previousValue: string | undefined;
  let pendingValidationError: string | undefined;

  while (true) {
    const parsed = await promptWithQuickPick(
      previousValue,
      pendingValidationError,
      localNames,
      docCtx,
      document,
      editor
    );
    if (!parsed) return;

    previousValue = parsed.input;
    pendingValidationError = undefined;

    const navigationResult = await navigateToDestination(parsed, document, editor, resolveClient, docCtx);
    if (navigationResult.ok) return;

    vscode.window.showErrorMessage((navigationResult as NavigationFailure).error);
    pendingValidationError = (navigationResult as NavigationFailure).error;
  }
}

async function promptWithQuickPick(
  previousValue: string | undefined,
  initialValidationError: string | undefined,
  localNames: LocalNamesMap,
  docCtx: DocContext,
  document: vscode.TextDocument,
  editor: vscode.TextEditor
): Promise<ParseSuccess | undefined> {
  // Remember where the user was before opening the QuickPick,
  // so we can restore on ESC (cancel).
  const originalSelection = editor.selection;
  const originalVisible = editor.visibleRanges?.[0];
  let wasAccepted = false;

  const qp = vscode.window.createQuickPick<vscode.QuickPickItem>();
  qp.title = "Navegar para Definição (+Offset ^Item)";
  qp.placeholder = docCtx.placeholder;
  qp.ignoreFocusOut = true;
  qp.matchOnDescription = true;
  qp.matchOnDetail = true;
  qp.canSelectMany = false;

  const disposables: vscode.Disposable[] = [];
  let cleanedUp = false;

  const blockHighlightDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor("editor.rangeHighlightBackground"),
    isWholeLine: true,
  });
  disposables.push(blockHighlightDecoration);

  const highlightDecoration = vscode.window.createTextEditorDecorationType({
    borderColor: new vscode.ThemeColor("editor.selectionHighlightBorder"),
    borderStyle: "solid",
    borderWidth: "1px",
  });
  disposables.push(highlightDecoration);

  let lastHighlightedRange: vscode.Range | undefined;
  let lastHighlightedBlockRange: vscode.Range | undefined;

  const clearHighlight = () => {
    if (!lastHighlightedRange && !lastHighlightedBlockRange) return;
    lastHighlightedRange = undefined;
    lastHighlightedBlockRange = undefined;
    editor.setDecorations(highlightDecoration, []);
    editor.setDecorations(blockHighlightDecoration, []);
  };

  const highlightInfo = (info?: LocalNameInfo) => {
    if (!info) {
      clearHighlight();
      return;
    }

    const range = info.selectionRange ?? document.lineAt(info.line).range;
    const blockRange = info.blockRange ?? range;
    lastHighlightedRange = range;
    lastHighlightedBlockRange = blockRange;
    editor.setDecorations(blockHighlightDecoration, [blockRange]);
    editor.setDecorations(highlightDecoration, [range]);

    // Keep highlighted block below the QuickPick overlay.
    // We derive a dynamic padding from the current visible height,
    // falling back to the fixed constant when needed.
    const visible = editor.visibleRanges?.[0];
    const visibleHeight = visible
      ? Math.max(0, visible.end.line - visible.start.line)
      : QUICK_PICK_OVERLAY_LINE_PADDING * 3;
    const dynamicGap = Math.floor(visibleHeight * 0.35);
    const gap = Math.max(QUICK_PICK_OVERLAY_LINE_PADDING, dynamicGap) + EXTRA_LINES_BELOW_QP;

    const revealStartLine = Math.max(blockRange.start.line - gap, 0);
    const revealRangeStart = new vscode.Position(revealStartLine, 0);
    const revealRange = new vscode.Range(revealRangeStart, blockRange.end);
    editor.revealRange(revealRange, vscode.TextEditorRevealType.AtTop);
  };

  const updateHighlightFromItem = (item: vscode.QuickPickItem | undefined) => {
    if (!item) {
      clearHighlight();
      return;
    }

    // Ignore tip item (first blank row)
    if ((item as any).__isTipItem) {
      clearHighlight();
      return;
    }
    const info = localNames.get(item.label.toLowerCase());
    highlightInfo(info);
  };

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    while (disposables.length) {
      const d = disposables.pop();
      try {
        d?.dispose();
      } catch {
        // Ignore dispose errors.
      }
    }
    clearHighlight();
    void vscode.commands.executeCommand("setContext", JUMP_QP_CONTEXT_KEY, false);
  };

  void vscode.commands.executeCommand("setContext", JUMP_QP_CONTEXT_KEY, true);

  let lastParse: ParseSuccess | undefined;
  let lastValidatedValue: string | undefined;
  let currentValidationId = 0;
  let lastValidationPromise: Promise<void> | undefined;

  qp.value = previousValue ?? "";

  const { items: localItems, tipItem } = buildLocalItems(localNames);
  const setItems = () => (qp.items = localItems);
  setItems();

  try {
    (qp as any).activeItems = [tipItem];
    (qp as any).selectedItems = [];
  } catch {
    /* ignore */
  }

  if (initialValidationError) {
    vscode.window.showErrorMessage(initialValidationError);
  } else if (qp.value.trim() !== "") {
    void runValidation(qp.value, localNames, docCtx);
  }

  function runValidation(
    value: string,
    localNamesMap: LocalNamesMap,
    dc: DocContext,
    emitToast = false
  ): Promise<void> {
    const validationId = ++currentValidationId;
    qp.busy = true;

    const p = validateExpression(value, localNamesMap, dc)
      .then((res) => {
        if (validationId !== currentValidationId) return;

        if (res.ok) {
          lastParse = res.value;
          lastValidatedValue = value;
        } else {
          lastParse = undefined;
          lastValidatedValue = undefined;
          if (emitToast) vscode.window.showErrorMessage((res as ValidationError).error);
        }
      })
      .finally(() => {
        if (validationId === currentValidationId) qp.busy = false;
      });

    lastValidationPromise = p;
    return p;
  }

  const applySelectedItemToValue = ({ revalidate }: { revalidate?: boolean } = {}): boolean => {
    const picked = qp.selectedItems[0] ?? qp.activeItems[0];
    if (!picked) return false;

    if ((picked as any).__isTipItem) return false;

    const trimmed = qp.value.trim();
    const normalized = replaceNameInExpression(trimmed, picked.label);
    if (normalized === qp.value) return false;

    qp.value = normalized;

    try {
      (qp as any).selectedItems = [];
    } catch {
      // Ignore errors from manipulating QuickPick internals.
    }

    if (revalidate && qp.value.trim() !== "") {
      void runValidation(qp.value, localNames, docCtx, false);
    }

    return true;
  };

  const insertSelectionDisposable = vscode.commands.registerCommand(INSERT_SELECTION_COMMAND_ID, () => {
    applySelectedItemToValue({ revalidate: true });
  });
  disposables.push(insertSelectionDisposable);

  const changeActiveDisposable = qp.onDidChangeActive((items) => {
    updateHighlightFromItem(items[0]);
  });
  disposables.push(changeActiveDisposable);

  const changeSelectionDisposable = qp.onDidChangeSelection((items) => {
    updateHighlightFromItem(items[0]);
  });
  disposables.push(changeSelectionDisposable);

  qp.onDidChangeValue((value) => {
    if (value.trim() === "") {
      lastParse = undefined;
      lastValidatedValue = undefined;
      clearHighlight();
      return;
    }

    void runValidation(value, localNames, docCtx, false);
  });

  const accepted = new Promise<ParseSuccess | undefined>((resolve) => {
    qp.onDidAccept(async () => {
      applySelectedItemToValue();

      const trimmed = qp.value.trim();

      if (trimmed === "") {
        vscode.window.showErrorMessage(ERR_NAME_REQUIRED);
        return;
      }

      if (!lastValidationPromise || lastValidatedValue !== qp.value) {
        await runValidation(qp.value, localNames, docCtx, true);
      } else {
        await lastValidationPromise;
        if (!lastParse) {
          vscode.window.showErrorMessage(ERR_SYNTAX);
        }
      }

      if (!lastParse) return;

      resolve(lastParse);
      wasAccepted = true;
      cleanup();
      qp.dispose();
    });

    qp.onDidHide(() => {
      // If user cancelled (ESC), restore cursor and viewport.
      if (!wasAccepted) {
        try {
          editor.selection = originalSelection;
          if (originalVisible) {
            // Use Default so VS Code restores without forcing center/top.
            editor.revealRange(originalVisible, vscode.TextEditorRevealType.Default);
          }
        } catch {
          /* ignore */
        }
      }
      resolve(undefined);
      cleanup();
    });
  });

  qp.show();
  return accepted;
}

function buildLocalItems(localNames: LocalNamesMap): {
  items: vscode.QuickPickItem[];
  tipItem: vscode.QuickPickItem;
} {
  const tipItem: vscode.QuickPickItem = {
    label: "",
    description: "Tab ↹ Inserir • Enter ↩ Navegar",
    detail: "",
    alwaysShow: true,
  } as vscode.QuickPickItem;

  (tipItem as any).__isTipItem = true;

  if (!localNames.size) {
    return {
      tipItem,
      items: [
        tipItem,
        {
          label: "Nenhum nome local encontrado",
          description: "—",
          detail: "Defina métodos/labels no arquivo atual para listá-los aqui.",
          alwaysShow: true,
        },
      ],
    };
  }

  const items = [...localNames.values()]
    .sort((a, b) => a.line - b.line || a.originalName.localeCompare(b.originalName))
    .map((info) => ({
      label: info.originalName,
      description: "definição local",
    }));

  return { tipItem, items: [tipItem, ...items] };
}

/** Replaces only the "name" portion in the expression, preserving +offset and ^item. */
function replaceNameInExpression(expr: string, newName: string): string {
  const value = (expr ?? "").trim();
  if (value === "") return newName;

  const caret = value.indexOf("^");
  const plus = value.indexOf("+");
  const endOfName = plus !== -1 && (caret === -1 || plus < caret) ? plus : caret !== -1 ? caret : value.length;

  const rest = value.slice(endOfName); // keeps +offset and/or ^item
  return `${newName}${rest}`;
}

async function validateExpression(
  rawValue: string,
  localNames: LocalNamesMap,
  docCtx: DocContext
): Promise<ValidationOutcome> {
  const trimmed = rawValue.trim();
  if (!trimmed) return { ok: false, error: ERR_NAME_REQUIRED };

  if (/\s/.test(trimmed)) return { ok: false, error: ERR_SYNTAX };

  const caretIndex = trimmed.indexOf("^");
  if (caretIndex !== -1 && trimmed.indexOf("^", caretIndex + 1) !== -1) {
    return { ok: false, error: ERR_SYNTAX };
  }

  let nameAndOffset = trimmed;
  let entity: string | undefined;
  if (caretIndex !== -1) {
    nameAndOffset = trimmed.slice(0, caretIndex);
    entity = trimmed.slice(caretIndex + 1);
    if (!entity) return { ok: false, error: ERR_ENTITY_FMT };
  }

  const plusIndex = nameAndOffset.indexOf("+");
  let name = nameAndOffset;
  let offsetPart: string | undefined;
  if (plusIndex !== -1) {
    name = nameAndOffset.slice(0, plusIndex);
    offsetPart = nameAndOffset.slice(plusIndex + 1);
  }

  if (!name) return { ok: false, error: ERR_NAME_REQUIRED };

  const isEntityClass = !!entity && entity.includes(".");
  const isEntityRoutine = !!entity && !entity.includes(".");

  if (isEntityClass) {
    if (!CLASS_METHOD_NAME_PATTERN.test(name)) return { ok: false, error: ERR_SYNTAX };
  } else if (isEntityRoutine) {
    if (!ROUTINE_LABEL_NAME_PATTERN.test(name)) return { ok: false, error: ERR_SYNTAX };
  } else {
    if (docCtx.kind === "routine") {
      if (!ROUTINE_LABEL_NAME_PATTERN.test(name)) return { ok: false, error: ERR_SYNTAX };
    } else {
      if (!CLASS_METHOD_NAME_PATTERN.test(name)) return { ok: false, error: ERR_SYNTAX };
    }
  }

  let offset = 0;
  if (offsetPart !== undefined) {
    if (!/^\d+$/.test(offsetPart)) return { ok: false, error: ERR_OFFSET };
    offset = Number.parseInt(offsetPart, 10);
  }

  if (entity !== undefined) {
    if (entity.includes(".")) {
      if (!CLASS_NAME_PATTERN.test(entity)) return { ok: false, error: ERR_ENTITY_FMT };
    } else {
      if (!ROUTINE_NAME_PATTERN.test(entity)) return { ok: false, error: ERR_ENTITY_FMT };
    }
  }

  const parseResult: ParseSuccess = { input: trimmed, name, offset, entity };

  if (!entity) {
    const localInfo = localNames.get(name.toLowerCase());
    if (!localInfo) return { ok: false, error: docCtx.errLocalNameNotFound };
    return { ok: true, value: { ...parseResult, localBaseLine: localInfo.line } };
  }

  return { ok: true, value: parseResult };
}

async function collectLocalNames(document: vscode.TextDocument): Promise<LocalNamesMap> {
  const map: LocalNamesMap = new Map();

  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
    if (!Array.isArray(symbols)) return map;

    const pending: vscode.DocumentSymbol[] = [...symbols];
    while (pending.length) {
      const symbol = pending.pop();
      if (!symbol) continue;

      if (symbol.kind === vscode.SymbolKind.Method) {
        const line = symbol.selectionRange?.start.line ?? symbol.range.start.line;
        const key = symbol.name.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            line,
            originalName: symbol.name,
            selectionRange: symbol.selectionRange ?? symbol.range,
            blockRange: symbol.range,
          });
        }
      }
      if (symbol.children?.length) pending.push(...symbol.children);
    }
  } catch {
    // Swallow provider errors; validation will surface a friendly message if needed.
  }

  return map;
}

interface NavigationSuccess {
  ok: true;
}

interface NavigationFailure {
  ok: false;
  error: string;
}

type NavigationOutcome = NavigationSuccess | NavigationFailure;

async function navigateToDestination(
  parsed: ParseSuccess,
  currentDocument: vscode.TextDocument,
  currentEditor: vscode.TextEditor,
  client: ResolveDefinitionClient,
  docCtx: DocContext
): Promise<NavigationOutcome> {
  if (!parsed.entity) {
    if (parsed.localBaseLine === undefined) {
      const localMsg = buildDocContext(currentDocument, new Map<string, LocalNameInfo>()).errLocalNameNotFound;
      return { ok: false, error: localMsg };
    }

    const targetLine = clampLine(parsed.localBaseLine + parsed.offset, currentDocument.lineCount);
    const position = new vscode.Position(targetLine, 0);
    const selection = new vscode.Selection(position, position);
    currentEditor.selection = selection;
    currentEditor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );
    return { ok: true };
  }

  // Build the correct query based on entity type (routine vs. class)
  const isEntityClass = parsed.entity.includes(".");
  const query = isEntityClass
    ? `##class(${parsed.entity}).${parsed.name}`
    : `${parsed.name}+${parsed.offset}^${parsed.entity}`;

  const lookupToken = new vscode.CancellationTokenSource();

  try {
    const location = await client.resolve(currentDocument, query, lookupToken.token);
    if (!location) {
      const errorMessage = await resolveEntityMissingReason(currentDocument, parsed, client);
      return { ok: false, error: errorMessage };
    }

    let targetDocument: vscode.TextDocument;
    try {
      targetDocument = await vscode.workspace.openTextDocument(location.uri);
    } catch {
      return { ok: false, error: ERR_RESOLVE_FAILED };
    }

    const definitionLine = await lookupNameDefinitionLine(targetDocument, parsed.name);
    if (definitionLine === null) {
      return { ok: false, error: ERR_NAME_NOT_FOUND_IN_ENTITY };
    }

    const symbolBaseLine = definitionLine;
    const locationBaseLine = location.range.start.line;

    const targetLine = clampLine(
      isEntityClass
        ? (symbolBaseLine ?? locationBaseLine) + parsed.offset
        : symbolBaseLine !== undefined
          ? symbolBaseLine + parsed.offset
          : locationBaseLine,
      targetDocument.lineCount
    );
    const position = new vscode.Position(targetLine, 0);
    const selection = new vscode.Selection(position, position);
    const targetEditor = await vscode.window.showTextDocument(targetDocument, { preview: false });
    targetEditor.selection = selection;
    targetEditor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport
    );

    return { ok: true };
  } catch {
    return { ok: false, error: ERR_RESOLVE_FAILED };
  } finally {
    lookupToken.dispose();
  }
}

async function resolveEntityMissingReason(
  document: vscode.TextDocument,
  parsed: ParseSuccess,
  client: ResolveDefinitionClient
): Promise<string> {
  if (!parsed.entity) return ERR_RESOLVE_FAILED;

  const tokenSource = new vscode.CancellationTokenSource();
  try {
    if (parsed.entity.includes(".")) {
      // Classes do not support a ^Class fallback
      return ERR_NAME_NOT_FOUND_IN_ENTITY;
    }

    // Routine: check existence via bare routine lookup
    const fallbackQuery = `^${parsed.entity}`;
    const fallbackLocation = await client.resolve(document, fallbackQuery, tokenSource.token);
    if (fallbackLocation) return ERR_NAME_NOT_FOUND_IN_ENTITY;
    return ERR_ENTITY_NOT_FOUND;
  } catch {
    return ERR_RESOLVE_FAILED;
  } finally {
    tokenSource.dispose();
  }
}

async function lookupNameDefinitionLine(
  document: vscode.TextDocument,
  name: string
): Promise<number | null | undefined> {
  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      "vscode.executeDocumentSymbolProvider",
      document.uri
    );
    if (!Array.isArray(symbols)) return undefined;

    const lower = name.toLowerCase();
    const stack: vscode.DocumentSymbol[] = [...symbols];
    while (stack.length) {
      const symbol = stack.pop();
      if (!symbol) continue;
      if (symbol.kind === vscode.SymbolKind.Method && symbol.name.toLowerCase() === lower) {
        const line = symbol.selectionRange?.start.line ?? symbol.range.start.line;
        return line;
      }
      if (symbol.children?.length) stack.push(...symbol.children);
    }
    return null;
  } catch {
    return undefined;
  }
}

function clampLine(desiredLine: number, lineCount: number): number {
  if (lineCount <= 0) return 0;
  if (desiredLine < 0) return 0;
  return Math.min(desiredLine, lineCount - 1);
}

// Dynamic helpers (context builders, parsing aids, and file/type inference)
function buildDocContext(document: vscode.TextDocument, localNames: LocalNamesMap): DocContext {
  const kind: EntityKind =
    document.languageId === "objectscript-class"
      ? "class"
      : SUPPORTED_LOCAL_LANG_IDS.has(document.languageId)
        ? isRoutineFile(document.fileName)
          ? "routine"
          : "unknown"
        : "unknown";

  const currentEntityName =
    kind === "class"
      ? deriveClassName(document)
      : kind === "routine"
        ? deriveRoutineName(document.fileName)
        : undefined;

  const displayName =
    kind === "class" && currentEntityName
      ? `classe ${currentEntityName}`
      : kind === "routine" && currentEntityName
        ? `rotina ${currentEntityName}`
        : "arquivo atual";

  const exampleName = pickExampleName(localNames);
  const lastLocalName = pickLastName(localNames) ?? exampleName;
  const exampleItem = currentEntityName ?? (kind === "class" ? "Pkg.Classe" : "Item");
  const placeholder = kind === "routine" ? `${lastLocalName}+2` : `${exampleName}+2^${exampleItem}`;

  const errLocalNameNotFound = `Nome não encontrado em ${displayName}`;

  return { kind, displayName, currentEntityName, placeholder, errLocalNameNotFound };
}

function isRoutineFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".mac") || lower.endsWith(".int");
}

function deriveRoutineName(fileName: string): string | undefined {
  const base = path.basename(fileName);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.substring(0, dot) : base;
}

function deriveClassName(document: vscode.TextDocument): string | undefined {
  let text: string;
  try {
    text = document.getText();
  } catch {
    return undefined;
  }

  const m = CLASS_DECLARATION_PATTERN.exec(text);
  if (m?.[1]) return m[1];
  return undefined;
}

function pickExampleName(localNames: LocalNamesMap): string {
  if (!localNames.size) return "nome";
  const infos = [...localNames.values()].sort((a, b) => a.originalName.localeCompare(b.originalName));
  const readable = infos.find((info) => READABLE_NAME_PATTERN.test(info.originalName));
  return (readable ?? infos[0])?.originalName ?? "nome";
}

function pickLastName(localNames: LocalNamesMap): string | undefined {
  if (!localNames.size) return undefined;
  let last: LocalNameInfo | undefined;
  for (const info of localNames.values()) {
    if (!last || info.line > last.line) last = info;
  }
  return last?.originalName;
}
