import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as Atelier from "../api/atelier";
import { clsLangId, extensionId, filesystemSchemas, lsExtensionId, sendUnitTestTelemetryEvent } from "../extension";
import {
  getFileText,
  getWsFolder,
  handleError,
  methodOffsetToLine,
  notIsfs,
  displayableUri,
  stripClassMemberNameQuotes,
  uriIsAncestorOf,
} from "../utils";
import { fileSpecFromURI, isfsConfig } from "../utils/FileProviderUtil";
import { AtelierAPI } from "../api";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { SourceControlApi } from "../ccs";
import { ROUTES } from "../ccs/sourcecontrol/routes";
import { createAbortSignal } from "../ccs/core/http";

enum TestStatus {
  Failed = 0,
  Passed,
  Skipped,
}

interface TestAssertLocation {
  offset?: number;
  document: string;
  label?: string;
  namespace?: string;
}

interface LegacyAssertion {
  status: TestStatus;
  type?: string;
  message: string;
  location?: TestAssertLocation;
  locationText?: string;
}

/** The result of a finished test */
interface TestResult {
  /** The name of the class */
  class: string;
  /** The status of the test */
  status: TestStatus;
  /** How long the test took to run, in milliseconds */
  duration: number;
  /** The name of the method without the "Test" prefix */
  method?: string;
  /**
   * An array of failures. The location will only be
   * defined if `method` is defined.
   * Will be empty if `status` is not `0` (failed).
   */
  failures: { message: string; location?: TestAssertLocation }[];
  /**
   * The text of the error that terminated
   * execution of this test.
   * Will be `undefined` if `status` is not `0` (failed).
   */
  error?: string;
  /**
   * Optional collection of assertion results reported by the
   * legacy runner.
   */
  assertions?: LegacyAssertion[];
}

interface LegacyUnitTestResponse {
  results: TestResult[];
  console?: string[];
}

// ---------------------------------------------------------------------------------------
// API v2 do executor Consistem: uma classe por requisicao, resultado paginado.
//
// Substitui LegacyUnitTestResponse. Todos os campos vem prontos do backend, que le direto o
// ^UnitTest.Result do IRIS -- nao ha mais nada a derivar no cliente.
// ---------------------------------------------------------------------------------------

/** Situacao de um grupo de classes no plano de execucao */
type SituacaoGrupo = "pronta" | "baseAusente" | "baseAmbigua" | "baseNaoGeravel" | "ambienteAusente";

interface BaseDados {
  id: string;
  tipo: number;
  tipoDescricao: string;
  /** Versão do ERP para a qual a base foi publicada */
  versao?: string;
  /** A base é de uma versão maior que a desta instalação. Aviso, não impedimento. */
  versaoIncompativel?: boolean;
}

interface GrupoExecucao {
  /** `null` quando as classes do grupo nao usam base de dados */
  base: BaseDados | null;
  namespace: string;
  namespacesCandidatos: string[];
  situacao: SituacaoGrupo;
  podeGerar: boolean;
  classes: string[];
}

interface ClasseNaoExecutavel {
  classe: string;
  motivo: string;
  mensagem: string;
}

interface ResolucaoResponse {
  versao: number;
  namespaceSolicitado: string;
  grupos: GrupoExecucao[];
  naoExecutaveis: ClasseNaoExecutavel[];
}

interface LocalAssert {
  documento: string;
  texto: string;
  label?: string;
  offset?: number;
  namespace?: string;
}

interface ResultadoAssert {
  sequencia: number;
  status: TestStatus;
  /** `log` sao os LogMessage do %UnitTest; `assert` e o resto */
  nivel: "assert" | "log";
  tipo: string;
  mensagem: string;
  /**
   * `null` nos asserts customizados da Consistem (AssertEqualsTable, AssertEqualsGlobal e
   * afins), que chamam LogAssert sem location. A mensagem TEM de aparecer mesmo assim.
   */
  local: LocalAssert | null;
}

interface ResultadoMetodo {
  /** Rotulo sem o prefixo `Test` -- casa com o label do TestItem */
  metodo: string;
  metodoCompleto: string;
  status: TestStatus;
  duracaoMs: number;
  erroAcao: string;
  erro: string;
  assertsPassaram: number;
  /** `true` quando os asserts deste metodo continuam na proxima pagina */
  parcial: boolean;
  asserts: ResultadoAssert[];
}

interface Diagnostico {
  nivel: string;
  codigo: string;
  mensagem: string;
}

interface Paginacao {
  idExecucao: string;
  incluirAsserts: string;
  fim: boolean;
  cursor: string | null;
}

interface ResultadoClasse {
  versao: number;
  execucao: {
    classe: string;
    suite?: string;
    nomeClasse?: string;
    namespaceExec: string;
    idLog?: number;
    status: TestStatus;
    duracaoMs: number;
    erroAcao?: string;
    erro?: string;
    totais?: {
      metodos: number;
      passou: number;
      falhou: number;
      ignorado: number;
      asserts: number;
      assertsFalharam: number;
    };
  };
  metodos: ResultadoMetodo[];
  paginacao?: Paginacao;
  diagnosticos?: Diagnostico[];
}

interface SituacaoExecucao {
  versao: number;
  idExecucao: string;
  situacao: "executando" | "concluida" | "erro";
  codigo: string;
  mensagem: string;
  duracaoMs: number;
}

interface SituacaoGeracao {
  versao: number;
  idGeracao: string;
  idBase: string;
  situacao: "executando" | "concluida" | "erro";
  namespace: string;
  mensagem: string;
  duracaoMs: number;
}

interface DerivedMethodSummary {
  status?: TestStatus;
  failures: { message: string; location?: TestAssertLocation }[];
  error?: string;
}

/** A cache of all test classes in a test root */
const classesForRoot: WeakMap<vscode.TestItem, Map<string, vscode.TestItem>> = new WeakMap();

/** Roots reais (paths filtrados) associados a cada root visual do workspace */
const rootsForWorkspaceRoot: WeakMap<vscode.TestItem, vscode.Uri[]> = new WeakMap();

/** The separator between the class URI string and method name in the method's `TestItem` id */
const methodIdSeparator = "\\\\\\";

const textDecoder = new TextDecoder();

const ANSI_RESET = "\u001b[0m";
const ANSI_RED = "\u001b[31m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_BOLD = "\u001b[1m";

const LEGACY_FAIL_MARKER = "<<====== FAILED ======>>";
const LEGACY_PASS_REGEX = /\bpassed\b/i;
const LEGACY_STATUS_REGEX = /Status:\s*(\w+)/i;

const GLOB_PATTERN = /[*?]/;

const DEFAULT_LEGACY_REQUEST_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/** Timeout da consulta de situacao. O default do cliente (5s) e curto demais com a maquina
 * ocupada rodando o teste. */
const POLL_TIMEOUT = 30 * 1000;

/** Falhas de transporte seguidas toleradas antes de desistir de acompanhar uma execucao */
const POLL_MAX_FALHAS = 10;

const POLL_INTERVALO_INICIAL = 500;

const POLL_INTERVALO_MAXIMO = 5000;

const testResultDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    margin: "0 0 0 3ch",
    color: new vscode.ThemeColor("editorCodeLens.foreground"),
  },
});

function findMethodItemByLegacyName(clsItem: vscode.TestItem, methodName: string): vscode.TestItem | undefined {
  if (!methodName) {
    return undefined;
  }
  const normalized = normalizeLegacyMethodName(methodName) ?? methodName;
  let methodItem = clsItem.children.get(`${clsItem.id}${methodIdSeparator}${normalized}`);
  if (!methodItem && methodName.startsWith("Test")) {
    methodItem = clsItem.children.get(`${clsItem.id}${methodIdSeparator}${methodName.slice(4)}`);
  }
  if (!methodItem) {
    for (const [, child] of clsItem.children) {
      const childNormalized = normalizeLegacyMethodName(child.label) ?? child.label;
      if (
        child.label === normalized ||
        child.label === methodName ||
        childNormalized === normalized ||
        normalizeLegacyMethodName(methodName) === normalizeLegacyMethodName(child.label)
      ) {
        methodItem = child;
        break;
      }
    }
  }
  return methodItem;
}

function deriveMethodResultsFromClassSummary(
  classResult: TestResult,
  requestedMethods: Set<string> | undefined,
  availableMethods: string[]
): Map<string, DerivedMethodSummary> {
  const summaries: Map<string, DerivedMethodSummary> = new Map();

  const ensureSummary = (methodName: string): DerivedMethodSummary => {
    const existing = summaries.get(methodName);
    if (existing) {
      return existing;
    }
    const created: DerivedMethodSummary = { failures: [] };
    summaries.set(methodName, created);
    return created;
  };

  for (const failure of classResult.failures ?? []) {
    const label = labelFromFailure(failure);
    const normalized = normalizeLegacyMethodName(label ?? "");
    if (!normalized) {
      continue;
    }
    const summary = ensureSummary(normalized);
    summary.status = TestStatus.Failed;
    summary.failures.push(failure);
    if (classResult.error && !summary.error) {
      summary.error = classResult.error;
    }
  }

  if (Array.isArray(classResult.assertions)) {
    const assertionGroups: Map<string, LegacyAssertion[]> = new Map();
    for (const assertion of classResult.assertions) {
      const label = labelFromAssertion(assertion);
      const normalized = normalizeLegacyMethodName(label ?? "");
      if (!normalized) {
        continue;
      }
      const group = assertionGroups.get(normalized) ?? [];
      group.push(assertion);
      assertionGroups.set(normalized, group);
    }

    for (const [methodName, assertions] of assertionGroups) {
      const summary = ensureSummary(methodName);
      const failedAssertion = assertions.find((assertion) => assertion.status === TestStatus.Failed);
      if (failedAssertion) {
        summary.status = TestStatus.Failed;
        if (!summary.failures.length) {
          summary.failures.push({
            message: `${failedAssertion.type ? `${failedAssertion.type} - ` : ""}${failedAssertion.message}`,
            location: failedAssertion.location,
          });
        }
        if (classResult.error && !summary.error) {
          summary.error = classResult.error;
        }
      } else if (summary.status == undefined) {
        summary.status = TestStatus.Passed;
      }
    }
  }

  const hasSpecificFailures = Array.from(summaries.values()).some((summary) => summary.status === TestStatus.Failed);
  const hasAssertionData = Array.isArray(classResult.assertions) && classResult.assertions.length > 0;
  const fallbackMethods = requestedMethods && requestedMethods.size ? Array.from(requestedMethods) : availableMethods;
  const fallbackStatus =
    classResult.status === TestStatus.Failed && !hasSpecificFailures && !hasAssertionData
      ? TestStatus.Failed
      : TestStatus.Passed;

  for (const methodName of fallbackMethods) {
    const normalized = normalizeLegacyMethodName(methodName) ?? methodName;
    if (!normalized) {
      continue;
    }
    const summary = ensureSummary(normalized);
    if (summary.status == undefined) {
      summary.status = fallbackStatus === TestStatus.Failed ? TestStatus.Failed : TestStatus.Passed;
      if (summary.status === TestStatus.Failed && classResult.error && !summary.error) {
        summary.error = classResult.error;
      }
    }
  }

  summaries.forEach((summary) => {
    if (summary.status == undefined) {
      summary.status = fallbackStatus === TestStatus.Failed ? TestStatus.Failed : TestStatus.Passed;
      if (summary.status === TestStatus.Failed && classResult.error && !summary.error) {
        summary.error = classResult.error;
      }
    }
  });

  return summaries;
}

/**
 * Lê as assertions do runner legado e descobre, por método,
 * qual é a mensagem de duração (LogMessage: Duration of execution: ...)
 */
function extractMethodDurations(classResult: TestResult): Map<string, string> {
  const map = new Map<string, string>();

  if (!Array.isArray(classResult.assertions)) {
    return map;
  }

  let lastMethodLabel: string | undefined;

  for (const assertion of classResult.assertions) {
    const label = labelFromAssertion(assertion);
    if (label) {
      lastMethodLabel = normalizeLegacyMethodName(label) ?? label;
    }
    if (assertion.type === "LogMessage" && lastMethodLabel && assertion.message) {
      const durationText = assertion.message.trim(); // ex.: "LogMessage:Duration of execution: .000122 sec."
      map.set(lastMethodLabel, durationText);
    }
  }

  return map;
}

function applyTestResultDecorations(
  methodResults: { item: vscode.TestItem; status: TestStatus; durationText?: string }[]
): void {
  if (!methodResults.length) {
    return;
  }

  const decorationsByEditor = new Map<vscode.TextEditor, vscode.DecorationOptions[]>();

  for (const editor of vscode.window.visibleTextEditors) {
    decorationsByEditor.set(editor, []);
  }

  for (const { item, status, durationText } of methodResults) {
    const editor = vscode.window.visibleTextEditors.find(
      (e) => item.uri && e.document.uri.toString() === item.uri.toString()
    );
    if (!editor || !item.range) {
      continue;
    }

    const line = item.range.start.line;
    const lineRange = editor.document.lineAt(line).range;

    const statusText = status === TestStatus.Passed ? "passed" : status === TestStatus.Failed ? "failed" : "skipped";

    const parts: string[] = [`${item.label} ${statusText}`];
    if (durationText) {
      parts.push(durationText);
    }

    const contentText = "   " + parts.join("   ");

    const opts: vscode.DecorationOptions = {
      range: lineRange,
      renderOptions: {
        after: {
          contentText,
        },
      },
    };

    const list = decorationsByEditor.get(editor);
    if (list) {
      list.push(opts);
    }
  }

  for (const [editor, decorations] of decorationsByEditor) {
    editor.setDecorations(testResultDecorationType, decorations);
  }
}

function stripAnsiSequences(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

function extractLegacyPayload(raw: string): { response?: LegacyUnitTestResponse } {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const resultsIdx = normalized.indexOf('"results"');
  if (resultsIdx < 0) {
    return {};
  }
  const jsonStart = normalized.lastIndexOf("{", resultsIdx);
  if (jsonStart < 0) {
    return {};
  }

  const jsonText = normalized.slice(jsonStart).trim();

  try {
    const response = JSON.parse(jsonText) as LegacyUnitTestResponse;
    return { response };
  } catch (e) {
    console.error("[extractLegacyPayload] Invalid JSON from legacy runner", e);
    return {};
  }
}

function colorizeLegacyConsoleLine(line: string): string {
  if (!line) {
    return line;
  }
  if (line.includes(ANSI_RESET)) {
    return line;
  }
  if (line.includes(LEGACY_FAIL_MARKER)) {
    return line.replace(LEGACY_FAIL_MARKER, `${ANSI_RED}${LEGACY_FAIL_MARKER}${ANSI_RESET}`);
  }
  const statusMatch = line.match(LEGACY_STATUS_REGEX);
  if (statusMatch?.[1]) {
    const statusText = statusMatch[1];
    const coloredStatus = `${LEGACY_PASS_REGEX.test(statusText) ? ANSI_GREEN : ANSI_RED}${statusText}${ANSI_RESET}`;
    return line.replace(statusText, coloredStatus);
  }
  if (LEGACY_PASS_REGEX.test(line)) {
    return line.replace(LEGACY_PASS_REGEX, (match) => `${ANSI_GREEN}${match}${ANSI_RESET}`);
  }
  return line;
}

function normalizeLegacyMethodName(method?: string): string | undefined {
  if (!method) {
    return undefined;
  }
  const trimmed = method.trim();
  if (!trimmed) {
    return undefined;
  }
  let working = trimmed;
  if (/^ztest/i.test(working)) {
    working = working.slice(1);
  }
  if (/^test/i.test(working)) {
    working = working.slice(4);
  }
  const normalized = working.trim();
  return normalized ? normalized : undefined;
}

function parseLegacyLabelFromText(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }
  let working = text.trim();
  const openParen = working.indexOf("(");
  if (openParen >= 0) {
    working = working.slice(openParen + 1);
  }
  const plusIdx = working.indexOf("+");
  const caretIdx = working.indexOf("^");
  let end = working.length;
  if (plusIdx >= 0) {
    end = Math.min(end, plusIdx);
  }
  if (caretIdx >= 0) {
    end = Math.min(end, caretIdx);
  }
  const candidate = working.slice(0, end).trim();
  return candidate ? candidate : undefined;
}

function labelFromFailure(failure: TestResult["failures"][number]): string | undefined {
  return failure.location?.label ?? parseLegacyLabelFromText(failure.message);
}

function labelFromAssertion(assertion: LegacyAssertion): string | undefined {
  return assertion.location?.label ?? parseLegacyLabelFromText(assertion.locationText);
}

/**
 * URI dos itens de DIRETORIO, que sao criados sem `uri`. Ver `itemUri()`.
 *
 * Guarda o objeto `vscode.Uri` original em vez de reconstrui-lo a partir do `id`: no Windows,
 * `Uri.toString()` minusculiza a letra do drive (`/C:/...` -> `/c:/...`), entao um `Uri.parse(id)`
 * devolveria um path diferente do de `folder.uri` e quebraria as comparacoes de `uriIsAncestorOf`,
 * que sao case-sensitive.
 */
const uriForDirectoryItem: WeakMap<vscode.TestItem, vscode.Uri> = new WeakMap();

/**
 * URI que o `TestItem` representa.
 *
 * Itens de DIRETORIO (raiz do workspace e subpastas/pacotes) sao criados SEM `uri` de proposito.
 * O VS Code, ao clicar no rotulo de um item da view Testing, executa `vscode.revealTest` quando o
 * item ainda nao tem filhos resolvidos e tem `uri`
 * (`!e.element.children.size && e.element.test.item.uri` em `testingExplorerView.ts`).
 * Com `uri` de pasta, esse reveal cai no Explorer -- e so na PRIMEIRA vez, porque depois de expandida
 * a pasta ja tem filhos e a condicao deixa de valer. Sem `uri`, o clique so expande/colapsa na Testing.
 *
 * Itens de classe (.cls) e de metodo mantem `uri` (+ `range`), que e o que permite abrir o fonte.
 */
function itemUri(item: vscode.TestItem): vscode.Uri {
  // O parse do `id` e so uma rede de seguranca: todo item de diretorio entra em `uriForDirectoryItem`
  // quando e criado, e o `id` e o `uri.toString()` do proprio item.
  return item.uri ?? uriForDirectoryItem.get(item) ?? vscode.Uri.parse(item.id);
}

/** Find the root `TestItem` for `uri` */
function rootItemForItem(testController: vscode.TestController, uri: vscode.Uri): vscode.TestItem | undefined {
  let rootItem: vscode.TestItem | undefined;
  const uriString = uri.toString();
  for (const [, i] of testController.items) {
    const rootUri = itemUri(i);
    if (uriIsAncestorOf(rootUri, uri) || uriString == rootUri.toString()) {
      rootItem = i;
      break;
    }
  }
  return rootItem;
}

/** Compute `TestItem`s for `Test*` methods in `parent` */
async function addTestItemsForClass(testController: vscode.TestController, parent: vscode.TestItem): Promise<void> {
  const newIds: string[] = [];
  // Get the symbols for the parent class
  const parentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    parent.uri
  );
  if (parentSymbols?.length == 1 && parentSymbols[0].kind == vscode.SymbolKind.Class) {
    const rootItem = rootItemForItem(testController, parent.uri!);
    if (rootItem) {
      // Add this class to our cache
      // Need to do this here because we need the
      // DocumentSymbols to accurately determine the class
      const classes = classesForRoot.get(rootItem);
      classes!.set(parentSymbols[0].name, parent);
      classesForRoot.set(rootItem, classes!);
    }
    parent.range = parentSymbols[0].range;
    // Add an item for each Test* method defined in this class
    parentSymbols[0].children.forEach((clsMember) => {
      const memberName = stripClassMemberNameQuotes(clsMember.name);
      if (clsMember.detail == "Method" && memberName.startsWith("Test")) {
        const displayName = memberName.slice(4);
        const newId = `${parent.id}${methodIdSeparator}${displayName}`;
        newIds.push(newId);
        const newItem = testController.createTestItem(newId, displayName, parent.uri);
        newItem.range = clsMember.range;
        // Always show non-inherited methods at the top
        newItem.sortText = `##${displayName}`;
        parent.children.add(newItem);
      }
    });
    if (filesystemSchemas.includes(parent.uri!.scheme)) {
      // Query the server to find inherited Test* methods
      const api = new AtelierAPI(parent.uri!);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(parent.uri!)!.name;
      const methodsMap: Map<string, string[]> = new Map();
      const inheritedMethods: { Name: string; Origin: string }[] = await api
        .actionQuery(
          "SELECT Name, Origin FROM %Dictionary.CompiledMethod WHERE " +
            "Parent = ? AND Origin != Parent AND Name %STARTSWITH 'Test' " +
            "AND ClassMethod = 0 AND ClientMethod = 0 ORDER BY Name",
          [parentSymbols[0].name]
        )
        .then((data) => data.result.content)
        .catch(() => []);
      inheritedMethods.forEach((method) => {
        const methodsArr = methodsMap.get(method.Origin) ?? [];
        methodsArr.push(method.Name);
        methodsMap.set(method.Origin, methodsArr);
      });
      for (const [origin, originMethods] of methodsMap) {
        const uri = DocumentContentProvider.getUri(`${origin}.cls`, workspaceFolder);
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
          "vscode.executeDocumentSymbolProvider",
          uri
        );
        // Add an item for each Test* method defined in this class
        if (symbols?.length == 1 && symbols[0].kind == vscode.SymbolKind.Class) {
          originMethods.forEach((originMethod) => {
            const symbol = symbols[0].children.find(
              (clsMember) => clsMember.detail == "Method" && stripClassMemberNameQuotes(clsMember.name) == originMethod
            );
            if (symbol) {
              const displayName = stripClassMemberNameQuotes(symbol.name).slice(4);
              const newId = `${parent.id}${methodIdSeparator}${displayName}`;
              newIds.push(newId);
              const newItem = testController.createTestItem(newId, displayName, parent.uri);
              newItem.range = symbol.range;
              parent.children.add(newItem);
            }
          });
        }
      }
    }
    // Remove items for any methods that have been deleted
    parent.children.forEach((i) => {
      if (!newIds.includes(i.id)) parent.children.delete(i.id);
    });
  }
}

/** Get the array of `objectscript.unitTest.relativeTestRoots` for workspace folder `uri`. */
function relativeTestRootsForUri(uri: vscode.Uri): string[] {
  const configuredRoots = vscode.workspace
    .getConfiguration("objectscript.unitTest", uri)
    .get<string[]>("relativeTestRoots");
  let roots = Array.isArray(configuredRoots) && configuredRoots.length ? configuredRoots : [""];
  roots = roots
    .map((r) => normalizeRelativeRootPath(r))
    .filter((root, idx, arr) => !arr.some((r, i) => i != idx && (root.startsWith(`${r}/`) || root == r)));
  return roots;
}

function normalizeRelativeRootPath(root: string): string {
  if (!root) {
    return "";
  }
  let normalized = root.replace(/\\/g, "/");
  normalized = normalized.replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized;
}

function hasGlobPattern(value: string): boolean {
  return GLOB_PATTERN.test(value);
}

function globSegmentToRegExp(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Agora converte * e ? em regex:
  //   * => .*  (qualquer sequência)
  //   ? => .   (qualquer caractere único)
  const pattern = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${pattern}$`, "i");
}

function expandSegmentsFromFs(basePath: string, segments: string[], index = 0): string[] {
  if (!basePath) {
    return [];
  }
  if (index >= segments.length) {
    return [basePath];
  }
  const segment = segments[index];
  if (!hasGlobPattern(segment)) {
    const nextPath = path.join(basePath, segment);
    try {
      const stats = fs.statSync(nextPath);
      if (stats.isDirectory()) {
        return expandSegmentsFromFs(nextPath, segments, index + 1);
      }
    } catch {
      return [];
    }
    return [];
  }
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(basePath, { withFileTypes: true });
  } catch {
    return [];
  }
  const matcher = globSegmentToRegExp(segment);
  let matches: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && matcher.test(entry.name)) {
      matches = matches.concat(expandSegmentsFromFs(path.join(basePath, entry.name), segments, index + 1));
    }
  }
  return matches;
}

function fallbackRelativePathForSegments(segments: string[]): string {
  if (!segments.length) {
    return "";
  }
  const fallbackSegments: string[] = [];
  for (const segment of segments) {
    if (hasGlobPattern(segment)) {
      break;
    }
    fallbackSegments.push(segment);
  }
  return fallbackSegments.join("/");
}

function resolveRelativeRootUris(folder: vscode.WorkspaceFolder, roots: string[], baseUri: vscode.Uri): vscode.Uri[] {
  const seen = new Set<string>();
  const baseFsPath = folder.uri.fsPath;
  const resolved: vscode.Uri[] = [];
  const isDefaultRoots = roots.length === 1 && !roots[0];
  roots.forEach((root) => {
    const normalized = normalizeRelativeRootPath(root);
    const segments = normalized ? normalized.split("/").filter(Boolean) : [];
    const segmentsContainGlob = segments.some(hasGlobPattern);
    let expanded: string[] = [];
    try {
      expanded = expandSegmentsFromFs(baseFsPath, segments);
    } catch {
      expanded = [];
    }
    if (expanded.length) {
      expanded.forEach((fullPath) => {
        const relative = path.relative(baseFsPath, fullPath).split(path.sep).join("/");
        const uri = baseUri.with({ path: `${baseUri.path}${relative}` });
        const key = uri.toString();
        if (!seen.has(key)) {
          seen.add(key);
          resolved.push(uri);
        }
      });
    } else if (!segmentsContainGlob) {
      const fallbackRelative = fallbackRelativePathForSegments(segments);
      const uri = baseUri.with({ path: `${baseUri.path}${fallbackRelative}` });
      const key = uri.toString();
      if (!seen.has(key)) {
        seen.add(key);
        resolved.push(uri);
      }
    }
  });
  return resolved.length ? resolved : isDefaultRoots ? [baseUri] : [];
}

/** Compute root `TestItem`s for `folder`. Returns `[]` if `folder` can't contain tests. */
function createRootItemsForWorkspaceFolder(
  testController: vscode.TestController,
  folder: vscode.WorkspaceFolder
): vscode.TestItem[] {
  const api = new AtelierAPI(folder.uri);
  const { csp } = isfsConfig(folder.uri);

  const errorMsg =
    !api.active || api.ns == ""
      ? "Server connection is inactive"
      : api.ns == "%SYS"
        ? "Connected to the %SYS namespace"
        : api.config.apiVersion! < 8
          ? "Must be connected to InterSystems IRIS version 2023.3 or above"
          : filesystemSchemas.includes(folder.uri.scheme) && csp
            ? "Web application folder"
            : undefined;

  const rootUri = folder.uri;
  // Created without a `uri` on purpose: it's a directory, not a file (see `itemUri()`)
  const rootItem = testController.createTestItem(rootUri.toString(), folder.name);
  uriForDirectoryItem.set(rootItem, rootUri);

  if (notIsfs(folder.uri)) {
    const roots = relativeTestRootsForUri(folder.uri);
    const baseUri = folder.uri.with({
      path: `${folder.uri.path}${!folder.uri.path.endsWith("/") ? "/" : ""}`,
    });
    const itemUris = resolveRelativeRootUris(folder, roots, baseUri);

    // guarda os roots reais deste workspace
    rootsForWorkspaceRoot.set(rootItem, itemUris);

    // descrição opcional, só para debug
    if (itemUris.length) {
      rootItem.description = itemUris
        .map((u) => u.path.slice(folder.uri.path.length + (!folder.uri.path.endsWith("/") ? 1 : 0)))
        .join(", ");
    }
  } else {
    // conexão isfs: mantém comportamento antigo
    rootsForWorkspaceRoot.set(rootItem, [folder.uri]);
  }

  if (errorMsg != undefined) {
    rootItem.canResolveChildren = false;
    rootItem.error = errorMsg;
  } else {
    rootItem.canResolveChildren = true;
  }

  return [rootItem];
}

/** Verifica se `candidate` está dentro de algum dos roots configurados para o workspace */
function pathMatchesAnyWorkspaceRoot(workspaceRootItem: vscode.TestItem, candidate: vscode.Uri): boolean {
  const roots = rootsForWorkspaceRoot.get(workspaceRootItem);
  if (!roots || !roots.length) {
    // Sem filtro definido → tudo entra
    return true;
  }

  return roots.some((rootUri) => {
    if (candidate.toString() === rootUri.toString()) {
      return true;
    }
    if (uriIsAncestorOf(candidate, rootUri)) {
      return true;
    }
    if (uriIsAncestorOf(rootUri, candidate)) {
      return true;
    }
    return false;
  });
}

/** Get the `TestItem` for class `uri`. If `create` is true, create intermediate `TestItem`s. */
async function getTestItemForClass(
  testController: vscode.TestController,
  uri: vscode.Uri,
  create = false
): Promise<vscode.TestItem | undefined> {
  let item: vscode.TestItem | undefined;
  const rootItem = rootItemForItem(testController, uri);
  if (rootItem && !rootItem.error) {
    // Walk the directory path until we reach a dead end or the TestItem for this class
    let docPath = uri.path.slice(itemUri(rootItem).path.length);
    docPath = docPath.startsWith("/") ? docPath.slice(1) : docPath;
    const docPathParts = docPath.split("/");
    item = rootItem;
    for (const part of docPathParts) {
      const parentUri = itemUri(item);
      const currUri = parentUri.with({
        path: `${parentUri.path}${!parentUri.path.endsWith("/") ? "/" : ""}${part}`,
      });
      let currItem = item.children.get(currUri.toString());
      if (!currItem && create) {
        // We're allowed to create non-existent directory TestItems as we walk the path
        await testController.resolveHandler!(item);
        currItem = item.children.get(currUri.toString());
      }
      item = currItem;
      if (!item) {
        break;
      }
    }
  }
  return item;
}

/** Create a "root" item for all workspace folders that have an active server connection and MAY have tests in them. */
function replaceRootTestItems(testController: vscode.TestController): void {
  testController.items.forEach((i) => classesForRoot.delete(i));
  const rootItems: vscode.TestItem[] = [];
  vscode.workspace.workspaceFolders?.forEach((folder) => {
    const newItems = createRootItemsForWorkspaceFolder(testController, folder);
    rootItems.push(...newItems);
  });
  rootItems.forEach((i) => classesForRoot.set(i, new Map()));
  testController.items.replace(rootItems);
}

/** Create a `Promise` that resolves to a query result containing an array of children for `item`. */
async function childrenForServerSideFolderItem(
  item: vscode.TestItem
): Promise<Atelier.Response<Atelier.Content<{ Name: string }[]>>> {
  const uri = itemUri(item);
  const { project, system, generated, mapped } = isfsConfig(uri);
  let query: string;
  let parameters: string[];
  let folder = !uri.path.endsWith("/") ? uri.path + "/" : uri.path;
  folder = folder.startsWith("/") ? folder.slice(1) : folder;
  if (folder == "/") {
    // Treat this the same as an empty folder
    folder = "";
  }
  folder = folder.replace(/\//g, ".");
  const folderLen = String(folder.length + 1); // Need the + 1 because SUBSTR is 1 indexed
  const api = new AtelierAPI(uri);
  if (project) {
    query =
      "SELECT DISTINCT CASE " +
      "WHEN $LENGTH(SUBSTR(pil.Name,?),'.') > 1 THEN $PIECE(SUBSTR(pil.Name,?),'.') " +
      "ELSE SUBSTR(pil.Name,?)||'.cls' END Name " +
      "FROM %Studio.Project_ProjectItemsList(?) AS pil " +
      "JOIN %Dictionary.ClassDefinition_SubclassOf('%UnitTest.TestCase','@') AS sub " +
      "ON pil.Name = sub.Name " +
      "WHERE pil.Type = 'CLS' AND pil.Name %STARTSWITH ?";
    parameters = [folderLen, folderLen, folderLen, project, folder];
  } else {
    query =
      "SELECT DISTINCT CASE " +
      "WHEN $LENGTH(SUBSTR(sod.Name,?),'.') > 2 THEN $PIECE(SUBSTR(sod.Name,?),'.') " +
      "ELSE SUBSTR(sod.Name,?) END Name " +
      "FROM %Library.RoutineMgr_StudioOpenDialog(?,?,?,?,?,?,?,?,?,?) AS sod " +
      "JOIN %Dictionary.ClassDefinition_SubclassOf('%UnitTest.TestCase','@') AS sub " +
      "ON sod.Name = sub.Name||'.cls' " +
      "WHERE sod.Name %STARTSWITH ?";
    parameters = [
      folderLen,
      folderLen,
      folderLen,
      fileSpecFromURI(uri),
      "1",
      "1",
      system ? "1" : "0",
      "1",
      "0",
      generated ? "1" : "0",
      "",
      "0",
      mapped ? "1" : "0",
      folder,
    ];
  }
  return api.actionQuery(query, parameters);
}

/** Create a child `TestItem` of `item` with label `child`. */
function addChildItem(testController: vscode.TestController, item: vscode.TestItem, child: string): void {
  const parentUri = itemUri(item);
  const newUri = parentUri.with({
    path: `${parentUri.path}${!parentUri.path.endsWith("/") ? "/" : ""}${child}`,
  });
  if (!item.children.get(newUri.toString())) {
    // Only add the item if it doesn't already exist
    // Directory items are created without a `uri` on purpose (see `itemUri()`)
    const isClass = child.toLowerCase().endsWith(".cls");
    const newItem = testController.createTestItem(newUri.toString(), child, isClass ? newUri : undefined);
    if (!isClass) uriForDirectoryItem.set(newItem, newUri);
    newItem.canResolveChildren = true;
    item.children.add(newItem);
  }
}

/** Determine the class name of `item` in `root` */
function classNameForItem(item: vscode.TestItem, root: vscode.TestItem): string | undefined {
  let cls: string | undefined;
  const classes = classesForRoot.get(root);
  if (classes) {
    for (const element of classes) {
      if (element[1].id == item.id) {
        cls = element[0];
        break;
      }
    }
  }
  return cls;
}

/** Render `line` as beautified markdown */
function markdownifyLine(line: string, bullet = false): string {
  const idx = line.indexOf(":") + 1;
  return `${bullet ? "- " : ""}${
    idx
      ? `**${line.slice(0, idx)}**${line
          .slice(idx)
          // Need to HTML encode so rest of line is treated as raw text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")}`
      : line
  }`;
}

/** If `uri` is a test class without a `TestItem`, compute its `TestItem`, filling in intermediate `TestItem`s along the way */
async function addItemForClassUri(testController: vscode.TestController, uri: vscode.Uri): Promise<void> {
  if (uri.path.toLowerCase().endsWith(".cls")) {
    const item = await getTestItemForClass(testController, uri, true);
    if (item && item.canResolveChildren && !item.children.size) {
      // Resolve the methods
      testController.resolveHandler!(item);
    }
  }
}

function groupConsoleByMethod(lines: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const headerRegex = /Met[óo]do:\s*([^\r\n-]+)/i;

  let currentMethodName: string | undefined;

  for (const raw of lines) {
    const line = stripAnsiSequences(raw).trimEnd();
    if (!line) continue;

    const headerMatch = line.match(headerRegex);
    if (headerMatch) {
      currentMethodName = headerMatch[1].trim();
      if (!map.has(currentMethodName)) {
        map.set(currentMethodName, []);
      }
      map.get(currentMethodName)!.push(line);
      continue;
    }
    if (/Fim da execução/i.test(line)) {
      currentMethodName = undefined;
      continue;
    }

    if (currentMethodName) {
      map.get(currentMethodName)!.push(line);
    }
  }

  return map;
}

function groupAssertionsByMethod(classResult: TestResult): Map<string, LegacyAssertion[]> {
  const map = new Map<string, LegacyAssertion[]>();
  if (!Array.isArray(classResult.assertions)) {
    return map;
  }

  for (const assertion of classResult.assertions) {
    const label = labelFromAssertion(assertion);
    const normalized = normalizeLegacyMethodName(label ?? "");
    if (!normalized) {
      continue;
    }
    const group = map.get(normalized) ?? [];
    group.push(assertion);
    map.set(normalized, group);
  }

  return map;
}

function formatLegacyAssertions(summaryLine: string, assertions: LegacyAssertion[]): string[] {
  const lines: string[] = [summaryLine];

  for (const assertion of assertions) {
    const statusText =
      assertion.status === TestStatus.Passed
        ? `${ANSI_GREEN}Passed${ANSI_RESET}`
        : assertion.status === TestStatus.Skipped
          ? `${ANSI_YELLOW}Skipped${ANSI_RESET}`
          : `${ANSI_RED}${LEGACY_FAIL_MARKER}${ANSI_RESET}`;

    const typePrefix = assertion.type ? `${assertion.type}  -  ` : "";
    lines.push(`    ${typePrefix}${assertion.message}  >> ${statusText}`);
  }

  lines.push("");

  return lines;
}

async function promptGenerateLegacyBase(rootUri: vscode.Uri): Promise<boolean | undefined> {
  const options: (vscode.QuickPickItem & { value: boolean })[] = [
    {
      label: "Gerar base de teste",
      description: "Executar com preparação da base de dados",
      value: true,
    },
    {
      label: "Não gerar base de teste",
      description: "Executar utilizando os dados existentes",
      value: false,
    },
  ];

  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: "Gerar base de dados para os testes unitários?",
    title: "Execução de testes unitários",
    ignoreFocusOut: true,
  });

  return choice?.value;
}

async function executeLegacyRunner(
  api: AtelierAPI,
  request: vscode.TestRunRequest,
  testController: vscode.TestController,
  root: vscode.TestItem,
  clsItemsRun: vscode.TestItem[],
  asyncRequest: Atelier.AsyncUnitTestRequest,
  token: vscode.CancellationToken,
  action: string,
  showOutput: boolean
): Promise<boolean> {
  const generateBase = await promptGenerateLegacyBase(itemUri(root));
  if (generateBase === undefined) {
    return true;
  }

  const unitTestConfiguration = vscode.workspace.getConfiguration("objectscript.unitTest", itemUri(root));
  const configuredLegacyTimeout = unitTestConfiguration.get<number>("legacyRequestTimeout");
  const legacyRequestTimeout = Number.isFinite(configuredLegacyTimeout)
    ? Math.max(0, Math.floor(configuredLegacyTimeout!))
    : DEFAULT_LEGACY_REQUEST_TIMEOUT;

  const testRun = testController.createTestRun(request, undefined, true);
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(testResultDecorationType, []);
  }

  try {
    const uniqueClassItems = new Set(clsItemsRun);
    uniqueClassItems.forEach((classItem) => {
      testRun.started(classItem);
      classItem.children.forEach((methodItem) => testRun.started(methodItem));
    });

    let sourceControlApi: SourceControlApi;
    try {
      sourceControlApi = SourceControlApi.fromAtelierApi(api);
    } catch (error) {
      handleError(error, `Error preparing to ${action} tests.`);
      return true;
    }

    const { signal, dispose } = createAbortSignal(token);
    let response: LegacyUnitTestResponse | undefined;

    try {
      const axiosResponse = await sourceControlApi.post<string>(
        ROUTES.runUnitTests(api.ns),
        {
          tests: asyncRequest.tests,
          load: asyncRequest.load ?? [],
          generateBaseUT: generateBase,
          console: asyncRequest.console,
          namespace: api.ns,
          username: api.config.auth.username,
        },
        {
          signal,
          timeout: legacyRequestTimeout,
          responseType: "text",
          transformResponse: (data) => data,
          validateStatus: () => true,
        }
      );
      const { response: parsedResponse } = extractLegacyPayload(axiosResponse.data ?? "");
      response = parsedResponse;

      if (!response) {
        const statusMessage =
          axiosResponse.status && axiosResponse.statusText
            ? `Executor de testes retornou HTTP ${axiosResponse.status} ${axiosResponse.statusText}`
            : "Executor de testes retornou um payload inválido.";
        handleError(new Error(statusMessage), `Erro ao executar testes ${action} tests.`);
        return true;
      }
      if (axiosResponse.status >= 400 && axiosResponse.statusText) {
        response.console = [
          `Executor de testes retornou HTTP ${axiosResponse.status} ${axiosResponse.statusText}.`,
          ...(Array.isArray(response.console) ? response.console : []),
        ];
      }
    } catch (error) {
      if (!token.isCancellationRequested) {
        handleError(error, `Erro ao executar testes ${action} tests.`);
      }
      return true;
    } finally {
      dispose();
    }

    if (token.isCancellationRequested) {
      return true;
    }

    if (!response || !Array.isArray(response.results)) {
      vscode.window.showErrorMessage("Nenhum resultado foi retornado pelo executor de testes.");
      return true;
    }
    const consoleByMethod = groupConsoleByMethod(Array.isArray(response.console) ? response.console : []);

    const knownStatuses: WeakMap<vscode.TestItem, TestStatus> = new WeakMap();
    const classes = classesForRoot.get(root) ?? new Map<string, vscode.TestItem>();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(itemUri(root));
    const documentSymbols: Map<string, vscode.DocumentSymbol[]> = new Map();
    const filesText: Map<string, string> = new Map();
    const requestedMethodsByClass: Map<string, Set<string> | undefined> = new Map();
    for (const test of asyncRequest.tests ?? []) {
      if (Array.isArray(test.methods) && test.methods.length) {
        requestedMethodsByClass.set(test.class, new Set(test.methods));
      } else if (!requestedMethodsByClass.has(test.class)) {
        requestedMethodsByClass.set(test.class, undefined);
      }
    }
    const allMethodResultsForDecorations: {
      item: vscode.TestItem;
      result: TestResult;
      durationText?: string;
    }[] = [];
    for (const testResult of response.results) {
      const clsItem = classes.get(testResult.class);
      if (!clsItem) {
        continue;
      }
      const durationsByMethod = extractMethodDurations(testResult);
      const assertionsByMethod = groupAssertionsByMethod(testResult);
      const methodResultsToApply: {
        item: vscode.TestItem;
        result: TestResult;
        durationText?: string;
      }[] = [];
      if (testResult.method) {
        const methodItem = findMethodItemByLegacyName(clsItem, testResult.method);
        if (methodItem) {
          const normalized = normalizeLegacyMethodName(methodItem.label) ?? methodItem.label;
          methodResultsToApply.push({
            item: methodItem,
            result: {
              ...testResult,
              method: methodItem.label,
              failures: testResult.failures ?? [],
            },
            durationText: durationsByMethod.get(normalized),
          });
        }
      } else {
        const requestedMethods = requestedMethodsByClass.get(testResult.class);
        const availableMethods: string[] = [];
        clsItem.children.forEach((child) => availableMethods.push(child.label));
        const derivedSummaries = deriveMethodResultsFromClassSummary(testResult, requestedMethods, availableMethods);
        for (const [methodName, summary] of derivedSummaries) {
          const methodItem = findMethodItemByLegacyName(clsItem, methodName);
          if (!methodItem || knownStatuses.has(methodItem)) {
            continue;
          }
          const normalized = normalizeLegacyMethodName(methodItem.label) ?? methodItem.label;
          methodResultsToApply.push({
            item: methodItem,
            result: {
              class: testResult.class,
              method: methodItem.label,
              status: summary.status ?? testResult.status,
              duration: testResult.duration ?? 0,
              failures: summary.failures ?? [],
              error: summary.error ?? testResult.error,
            },
            durationText: durationsByMethod.get(normalized),
          });
        }
      }
      for (const { item: methodItem, result: methodResult, durationText } of methodResultsToApply) {
        knownStatuses.set(methodItem, methodResult.status);
        const legacyMethodName = `Test${methodItem.label}`;
        const methodConsoleLines = consoleByMethod.get(legacyMethodName) ?? [];
        const normalizedMethodName = normalizeLegacyMethodName(methodItem.label) ?? methodItem.label;
        const methodAssertions = assertionsByMethod.get(normalizedMethodName) ?? [];
        const statusText =
          methodResult.status === TestStatus.Passed
            ? "passed"
            : methodResult.status === TestStatus.Failed
              ? "failed"
              : "skipped";

        const durationInfo =
          durationText ??
          (methodResult.duration != null
            ? `Duration of execution: ${methodResult.duration} ms`
            : "Duration not available");

        const statusColor =
          methodResult.status === TestStatus.Passed
            ? ANSI_GREEN
            : methodResult.status === TestStatus.Failed
              ? ANSI_RED
              : ANSI_YELLOW;

        const summaryLine = `Método: ${ANSI_BOLD}${methodItem.label}${ANSI_RESET} | Status: ${statusColor}${statusText}${ANSI_RESET} | ${durationInfo}`;
        const fallbackAssertionLines = formatLegacyAssertions(summaryLine, methodAssertions);

        let linesToOutput: string[];
        if (methodAssertions.length > 0) {
          linesToOutput = fallbackAssertionLines;
        } else if (methodConsoleLines.length > 0) {
          const consoleAssertions = methodConsoleLines
            .filter((line) => {
              const clean = stripAnsiSequences(line);
              return !/Met[óo]do:/i.test(clean) && !/Fim da execu[cç][aã]o/i.test(clean);
            })
            .map((line) => {
              const clean = line.trimStart();
              return clean ? `    ${clean}` : clean;
            });

          linesToOutput = [summaryLine, ...consoleAssertions, ""];
        } else {
          linesToOutput = fallbackAssertionLines;
        }

        for (const line of linesToOutput) {
          const colored = colorizeLegacyConsoleLine(line);
          testRun.appendOutput(colored + "\r\n", undefined, methodItem);
        }
        switch (methodResult.status) {
          case TestStatus.Failed: {
            const messages: vscode.TestMessage[] = [];

            if (methodResult.failures?.length) {
              for (const failure of methodResult.failures) {
                if (!failure.location) {
                  continue;
                }

                const message = new vscode.TestMessage(new vscode.MarkdownString(markdownifyLine(failure.message)));

                if (failure.location) {
                  if (failure.location.document.toLowerCase().endsWith(".cls") && workspaceFolder) {
                    let locationUri: vscode.Uri | null | undefined;
                    if (classes.has(failure.location.document.slice(0, -4))) {
                      locationUri = classes.get(failure.location.document.slice(0, -4))!.uri;
                    } else {
                      locationUri = DocumentContentProvider.getUri(
                        failure.location.document,
                        workspaceFolder.name,
                        failure.location.namespace
                      );
                    }
                    if (locationUri) {
                      if (!documentSymbols.has(locationUri.toString())) {
                        const newSymbols = await vscode.commands
                          .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", locationUri)
                          .then(
                            (r) => r[0]?.children,
                            () => undefined
                          );
                        if (newSymbols != undefined) {
                          documentSymbols.set(locationUri.toString(), newSymbols);
                        }
                      }
                      const locationSymbols = documentSymbols.get(locationUri.toString());
                      if (locationSymbols != undefined) {
                        if (!filesText.has(locationUri.toString())) {
                          const newFileText = await getFileText(locationUri).catch(() => undefined);
                          if (newFileText != undefined) {
                            filesText.set(locationUri.toString(), newFileText);
                          }
                        }
                        const fileText = filesText.get(locationUri.toString());
                        if (fileText != undefined) {
                          const locationLine = methodOffsetToLine(
                            locationSymbols,
                            fileText,
                            failure.location.label ?? "",
                            failure.location.offset ?? 0
                          );
                          if (locationLine != undefined) {
                            message.location = new vscode.Location(
                              locationUri,
                              new vscode.Range(locationLine - 1, 0, locationLine, 0)
                            );
                          }
                        }
                      }
                    }
                  } else if (failure.location.label == undefined && workspaceFolder) {
                    const locationUri = DocumentContentProvider.getUri(
                      failure.location.document,
                      workspaceFolder.name,
                      failure.location.namespace
                    );
                    if (locationUri) {
                      message.location = new vscode.Location(
                        locationUri,
                        new vscode.Range(failure.location.offset ?? 0, 0, (failure.location.offset ?? 0) + 1, 0)
                      );
                    }
                  }
                }

                messages.push(message);
              }
            }
            if (!messages.length) {
              testRun.failed(methodItem, [], methodResult.duration ?? 0);
            } else {
              testRun.failed(methodItem, messages, methodResult.duration ?? 0);
            }

            break;
          }

          case TestStatus.Passed:
            testRun.passed(methodItem, methodResult.duration ?? 0);
            break;

          default:
            testRun.skipped(methodItem);
        }
      }
      allMethodResultsForDecorations.push(...methodResultsToApply);
      if (!testResult.method) {
        knownStatuses.set(clsItem, testResult.status);
        switch (testResult.status) {
          case TestStatus.Failed: {
            const failedNames = (testResult.failures ?? [])
              .map((failure) => labelFromFailure(failure))
              .filter((name): name is string => !!name);

            const uniqueFailedNames = Array.from(new Set(failedNames));

            let text = "Existem métodos de teste com falha.";
            if (uniqueFailedNames.length) {
              text += "\n\nMétodos com falha:\n" + uniqueFailedNames.map((n) => `- ${n}`).join("\n");
            }
            const message = new vscode.TestMessage(new vscode.MarkdownString(text));
            testRun.failed(clsItem, [message], testResult.duration ?? 0);
            break;
          }

          case TestStatus.Passed:
            testRun.passed(clsItem, testResult.duration ?? 0);
            break;
          default:
            testRun.skipped(clsItem);
        }
      }
    }
    applyTestResultDecorations(
      allMethodResultsForDecorations.map((d) => ({
        item: d.item,
        status: d.result.status,
        durationText: d.durationText,
      }))
    );
    uniqueClassItems.forEach((classItem) => {
      if (!knownStatuses.has(classItem)) {
        knownStatuses.set(classItem, TestStatus.Skipped);
        testRun.skipped(classItem);
      }
      classItem.children.forEach((methodItem) => {
        if (!knownStatuses.has(methodItem)) {
          knownStatuses.set(methodItem, TestStatus.Skipped);
          testRun.skipped(methodItem);
        }
      });
    });
  } finally {
    testRun.end();
  }

  return true;
}

/** The `runHandler` function for the `TestRunProfile`s. */
/**
 * Resolve a posicao no fonte de um assert que trouxe `local`.
 *
 * Os asserts customizados da Consistem vem com `local: null` -- nesses casos nao ha posicao,
 * mas a mensagem continua tendo de aparecer.
 */
async function resolverLocalAssert(
  local: LocalAssert,
  classes: Map<string, vscode.TestItem>,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  documentSymbols: Map<string, vscode.DocumentSymbol[]>,
  filesText: Map<string, string>
): Promise<vscode.Location | undefined> {
  if (!workspaceFolder) return undefined;

  const documento = local.documento;
  if (!documento) return undefined;

  let locationUri: vscode.Uri | null | undefined;
  const semExtensao = documento.toLowerCase().endsWith(".cls") ? documento.slice(0, -4) : undefined;

  if (semExtensao && classes.has(semExtensao)) {
    locationUri = classes.get(semExtensao)!.uri;
  } else {
    locationUri = DocumentContentProvider.getUri(documento, workspaceFolder.name, local.namespace);
  }
  if (!locationUri) return undefined;

  const chave = locationUri.toString();

  if (!documentSymbols.has(chave)) {
    const novos = await vscode.commands
      .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", locationUri)
      .then(
        (r) => r[0]?.children,
        () => undefined
      );
    if (novos != undefined) documentSymbols.set(chave, novos);
  }
  const simbolos = documentSymbols.get(chave);
  if (simbolos == undefined) return undefined;

  if (!filesText.has(chave)) {
    const texto = await getFileText(locationUri).catch(() => undefined);
    if (texto != undefined) filesText.set(chave, texto);
  }
  const texto = filesText.get(chave);
  if (texto == undefined) return undefined;

  const linha = methodOffsetToLine(simbolos, texto, local.label ?? "", local.offset ?? 0);
  if (linha == undefined) return undefined;

  return new vscode.Location(locationUri, new vscode.Range(linha - 1, 0, linha, 0));
}

/** Uma linha de output por assert, no mesmo espirito do que o terminal imprime */
function formatarAssert(assert: ResultadoAssert): string {
  if (assert.nivel === "log") {
    return `    ${assert.mensagem}\r\n`;
  }
  const cor = assert.status === TestStatus.Passed ? ANSI_GREEN : ANSI_RED;
  const situacao = assert.status === TestStatus.Passed ? "passed" : "failed";
  return `    ${assert.tipo} - ${assert.mensagem} >> ${cor}${situacao}${ANSI_RESET}\r\n`;
}

/**
 * Aguarda o fim de uma execucao iniciada no servidor.
 *
 * A execucao roda em JOB porque uma classe lenta estoura o timeout do gateway CSP: medimos
 * 70s numa classe de producao contra o limite padrao de 60s. Aqui so se acompanha.
 */
async function aguardarExecucao(
  sourceControlApi: SourceControlApi,
  namespaceReq: string,
  idExecucao: string,
  token: vscode.CancellationToken,
  signal: AbortSignal,
  timeout: number
): Promise<SituacaoExecucao | undefined> {
  const inicio = Date.now();

  const estado = { falhas: 0 };
  let intervalo = POLL_INTERVALO_INICIAL;

  for (;;) {
    if (token.isCancellationRequested) return undefined;

    // Falha de transporte é transitória: desistir aqui abandonaria um JOB que continua
    // rodando e segurando o lock da base, derrubando as classes seguintes em cascata.
    const situacao = await consultarSituacao<SituacaoExecucao>(
      sourceControlApi,
      ROUTES.situacaoExecucaoTeste(namespaceReq, idExecucao),
      signal,
      estado
    );

    if (token.isCancellationRequested) return undefined;

    if (situacao?.situacao === "concluida") return situacao;
    if (situacao?.situacao === "erro") {
      throw new Error(situacao.mensagem || "Falha na execução do teste.");
    }

    if (timeout > 0 && Date.now() - inicio > timeout) {
      throw new Error(`A execução excedeu ${Math.round(timeout / 1000)}s e foi abandonada pelo cliente.`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalo));
    intervalo = Math.min(Math.round(intervalo * 1.5), POLL_INTERVALO_MAXIMO);
  }
}

/** Percorre todas as paginas de um resultado e devolve os metodos acumulados */
async function coletarPaginas(
  sourceControlApi: SourceControlApi,
  namespace: string,
  primeira: ResultadoClasse,
  incluirAsserts: string,
  signal: AbortSignal,
  timeout: number
): Promise<ResultadoClasse> {
  const acumulado: ResultadoClasse = { ...primeira, metodos: [...primeira.metodos] };

  let paginacao = primeira.paginacao;

  while (paginacao && !paginacao.fim && paginacao.cursor) {
    const resposta = await sourceControlApi.get<ResultadoClasse>(
      ROUTES.paginaResultadoTeste(namespace, paginacao.idExecucao),
      { params: { cursor: paginacao.cursor, incluirAsserts }, signal, timeout }
    );

    const pagina = resposta.data;
    if (!pagina || !Array.isArray(pagina.metodos)) break;

    for (const metodo of pagina.metodos) {
      // Um metodo partido entre paginas volta com o mesmo nome: junta os asserts
      const anterior = acumulado.metodos.find((m) => m.metodoCompleto === metodo.metodoCompleto);
      if (anterior) {
        anterior.asserts.push(...metodo.asserts);
        anterior.parcial = metodo.parcial;
      } else {
        acumulado.metodos.push(metodo);
      }
    }

    paginacao = pagina.paginacao;
  }

  acumulado.paginacao = paginacao;
  return acumulado;
}

/**
 * O backend responde erro como `{ error: "..." }` com HTTP 200.
 * Sem isto, qualquer falha do servidor virava "payload inválido" e a causa real sumia.
 */
function erroDoBackend(data: unknown): string | undefined {
  if (typeof data === "string") {
    return data.trim() ? `Resposta inesperada do servidor: ${data.slice(0, 400)}` : undefined;
  }
  if (data && typeof data === "object") {
    const erro = (data as { error?: unknown }).error;
    if (typeof erro === "string" && erro.trim()) return erro;
  }
  return undefined;
}

/**
 * GET de consulta de situação, com timeout explícito e tolerância a falha transitória.
 *
 * O default do cliente é 5s, e a máquina fica saturada rodando o próprio teste (ou criando a
 * database do TESTEUNITARIO). Desistir na primeira falha abandonaria um JOB que continua
 * rodando no servidor -- foi assim que uma consulta lenta derrubou a operação inteira.
 *
 * Devolve `undefined` numa falha tolerada; só relança depois de POLL_MAX_FALHAS seguidas.
 */
async function consultarSituacao<T>(
  sourceControlApi: SourceControlApi,
  rota: string,
  signal: AbortSignal | undefined,
  estado: { falhas: number }
): Promise<T | undefined> {
  try {
    const resposta = await sourceControlApi.get<T>(rota, { signal, timeout: POLL_TIMEOUT });
    estado.falhas = 0;
    return resposta.data;
  } catch (error) {
    estado.falhas += 1;
    if (estado.falhas > POLL_MAX_FALHAS) throw error;
    return undefined;
  }
}

/** Pergunta ao usuario se quer gerar a base que falta para um grupo de classes */
async function perguntarGerarBase(grupo: GrupoExecucao): Promise<boolean> {
  const idBase = grupo.base?.id ?? "";
  const incompativel = grupo.base?.versaoIncompativel === true;
  const versao = grupo.base?.versao;

  // Versão incompatível não impede gerar -- o Gerenciador de Bases do terminal apenas pede
  // confirmação, com "N" como default. Aqui o aviso vai no detalhe e "Pular" vem primeiro.
  const opcaoGerar = {
    label: `Gerar a base ${idBase}`,
    gerar: true,
    detail: incompativel
      ? `⚠ Base publicada para a versão ${versao}, maior que a desta instalação. Gerar mesmo assim?`
      : `Necessária por ${grupo.classes.length} classe(s) de teste`,
  };
  const opcaoPular = {
    label: "Pular estas classes",
    gerar: false,
    detail: "Os testes que dependem desta base ficarão ignorados",
  };

  const escolha = await vscode.window.showQuickPick(
    incompativel ? [opcaoPular, opcaoGerar] : [opcaoGerar, opcaoPular],
    {
      title: "Execução de testes unitários",
      placeHolder: incompativel
        ? `A base ${idBase} (versão ${versao}) não está montada e é de versão incompatível.`
        : `A base ${idBase} não está montada nesta instalação. Gerar agora?`,
      ignoreFocusOut: true,
    }
  );
  return escolha?.gerar === true;
}

/** Deixa o usuario escolher o namespace quando mais de um atende a mesma base */
async function perguntarNamespace(grupo: GrupoExecucao): Promise<string | undefined> {
  return vscode.window.showQuickPick(grupo.namespacesCandidatos, {
    title: "Execução de testes unitários",
    placeHolder: `Mais de um namespace atende a base ${grupo.base?.id ?? ""}. Escolha onde executar.`,
    ignoreFocusOut: true,
  });
}

/**
 * Dispara uma operacao longa no servidor e acompanha ate concluir.
 *
 * Serve tanto para gerar uma base versionada quanto para montar o namespace TESTEUNITARIO.
 * As duas dropam/criam database e namespace: dentro da requisicao HTTP estouram o gateway.
 */
async function aguardarOperacaoServidor(
  sourceControlApi: SourceControlApi,
  namespaceReq: string,
  titulo: string,
  rota: string,
  corpo: unknown,
  token: vscode.CancellationToken,
  signal?: AbortSignal
): Promise<string | undefined> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: titulo,
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "iniciando…" });

      const inicio = await sourceControlApi.post<SituacaoGeracao>(rota, corpo, {
        signal,
        timeout: POLL_TIMEOUT,
      });

      const erroInicio = erroDoBackend(inicio.data);
      const idGeracao = inicio.data?.idGeracao;
      if (erroInicio || !idGeracao) {
        vscode.window.showErrorMessage(erroInicio ?? `Não foi possível iniciar: ${titulo}.`);
        return undefined;
      }

      // Minutos de trabalho. Por isso o backend roda em JOB e aqui so se acompanha.
      const estado = { falhas: 0 };

      for (;;) {
        if (token.isCancellationRequested) return undefined;

        await new Promise((resolve) => setTimeout(resolve, 5000));

        const situacao = await consultarSituacao<SituacaoGeracao>(
          sourceControlApi,
          ROUTES.situacaoGeracaoBase(namespaceReq, idGeracao),
          signal,
          estado
        );

        if (situacao?.situacao === "concluida") {
          progress.report({ message: "concluída" });
          return situacao.namespace;
        }
        if (situacao?.situacao === "erro") {
          vscode.window.showErrorMessage(`${titulo}: ${situacao.mensagem}`);
          return undefined;
        }

        const segundos = Math.round((situacao?.duracaoMs ?? 0) / 1000);
        progress.report({ message: `${segundos}s decorridos…` });
      }
    }
  );
}

/** Marca todas as classes de um grupo como ignoradas, com o motivo */
function marcarGrupoIgnorado(
  testRun: vscode.TestRun,
  classes: Map<string, vscode.TestItem>,
  grupo: GrupoExecucao,
  motivo: string
): void {
  for (const classe of grupo.classes) {
    const clsItem = classes.get(classe);
    if (!clsItem) continue;
    testRun.appendOutput(`${ANSI_YELLOW}${classe}: ${motivo}${ANSI_RESET}\r\n`);
    testRun.skipped(clsItem);
    clsItem.children.forEach((m) => testRun.skipped(m));
  }
}

/** Reporta o resultado de uma classe inteira na Test Explorer */
async function reportarClasse(
  testRun: vscode.TestRun,
  clsItem: vscode.TestItem,
  resultado: ResultadoClasse,
  classes: Map<string, vscode.TestItem>,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
  documentSymbols: Map<string, vscode.DocumentSymbol[]>,
  filesText: Map<string, string>,
  metodosParaDecorar: { item: vscode.TestItem; status: TestStatus; durationText?: string }[]
): Promise<void> {
  for (const diagnostico of resultado.diagnosticos ?? []) {
    testRun.appendOutput(`${ANSI_RED}${diagnostico.codigo}: ${diagnostico.mensagem}${ANSI_RESET}\r\n`);
  }

  const base = resultado.execucao.namespaceExec ? ` [${resultado.execucao.namespaceExec}]` : "";
  testRun.appendOutput(`${ANSI_BOLD}${resultado.execucao.classe}${ANSI_RESET}${base}\r\n`);

  for (const metodo of resultado.metodos) {
    const methodItem = findMethodItemByLegacyName(clsItem, metodo.metodo);
    if (!methodItem) continue;

    const cor =
      metodo.status === TestStatus.Passed ? ANSI_GREEN : metodo.status === TestStatus.Failed ? ANSI_RED : ANSI_YELLOW;
    const situacao =
      metodo.status === TestStatus.Passed ? "passed" : metodo.status === TestStatus.Failed ? "failed" : "skipped";

    testRun.appendOutput(
      `  ${ANSI_BOLD}${metodo.metodo}${ANSI_RESET} | ${cor}${situacao}${ANSI_RESET} | ${metodo.duracaoMs}ms\r\n`
    );
    for (const assert of metodo.asserts) {
      testRun.appendOutput(formatarAssert(assert));
    }
    if (metodo.assertsPassaram > 0 && !metodo.asserts.some((a) => a.status === TestStatus.Passed)) {
      testRun.appendOutput(`    ${ANSI_GREEN}${metodo.assertsPassaram} assert(s) passaram${ANSI_RESET}\r\n`);
    }

    if (metodo.status === TestStatus.Failed) {
      const mensagens: vscode.TestMessage[] = [];

      // O erro que abortou o metodo vem antes dos asserts -- o runner antigo o descartava
      if (metodo.erro) {
        const rotulo = metodo.erroAcao ? `${metodo.erroAcao}: ${metodo.erro}` : metodo.erro;
        mensagens.push(new vscode.TestMessage(new vscode.MarkdownString(markdownifyLine(rotulo))));
      }

      for (const assert of metodo.asserts) {
        if (assert.status !== TestStatus.Failed) continue;

        const texto = assert.tipo ? `${assert.tipo} - ${assert.mensagem}` : assert.mensagem;
        const mensagem = new vscode.TestMessage(new vscode.MarkdownString(markdownifyLine(texto)));

        // `local` e null nos asserts customizados da Consistem: a mensagem entra do mesmo
        // jeito, so sem posicao no fonte. O runner antigo descartava essas falhas.
        if (assert.local) {
          mensagem.location = await resolverLocalAssert(
            assert.local,
            classes,
            workspaceFolder,
            documentSymbols,
            filesText
          );
        }

        mensagens.push(mensagem);
      }

      if (!mensagens.length) {
        mensagens.push(new vscode.TestMessage("Teste falhou."));
      }

      testRun.failed(methodItem, mensagens, metodo.duracaoMs);
    } else if (metodo.status === TestStatus.Passed) {
      testRun.passed(methodItem, metodo.duracaoMs);
    } else {
      testRun.skipped(methodItem);
    }

    metodosParaDecorar.push({ item: methodItem, status: metodo.status, durationText: `${metodo.duracaoMs}ms` });
  }

  const execucao = resultado.execucao;

  if (execucao.status === TestStatus.Failed) {
    const falhos = resultado.metodos.filter((m) => m.status === TestStatus.Failed).map((m) => m.metodo);
    const texto = falhos.length
      ? `Existem métodos de teste com falha:\n${falhos.map((m) => `- ${m}`).join("\n")}`
      : execucao.erro || "Existem métodos de teste com falha.";
    testRun.failed(clsItem, new vscode.TestMessage(new vscode.MarkdownString(texto)), execucao.duracaoMs);
  } else if (execucao.status === TestStatus.Passed) {
    testRun.passed(clsItem, execucao.duracaoMs);
  } else {
    testRun.skipped(clsItem);
  }
}

/**
 * Executor de testes unitarios da Consistem.
 *
 * Uma classe por requisicao, agrupadas por base de dados. O resultado de cada classe e
 * reportado assim que chega, entao a Test Explorer vai preenchendo em vez de esperar o lote
 * inteiro -- e o cancelamento interrompe entre classes.
 */
async function executeConsistemRunner(
  api: AtelierAPI,
  request: vscode.TestRunRequest,
  testController: vscode.TestController,
  root: vscode.TestItem,
  clsItemsRun: vscode.TestItem[],
  testesSolicitados: { class: string; methods?: string[] }[],
  token: vscode.CancellationToken,
  action: string
): Promise<boolean> {
  const unitTestConfiguration = vscode.workspace.getConfiguration("objectscript.unitTest", itemUri(root));
  const configuredTimeout = unitTestConfiguration.get<number>("legacyRequestTimeout");
  const requestTimeout = Number.isFinite(configuredTimeout)
    ? Math.max(0, Math.floor(configuredTimeout!))
    : DEFAULT_LEGACY_REQUEST_TIMEOUT;
  const incluirAsserts = unitTestConfiguration.get<string>("incluirAsserts") ?? "somenteFalhas";

  let sourceControlApi: SourceControlApi;
  try {
    sourceControlApi = SourceControlApi.fromAtelierApi(api);
  } catch (error) {
    handleError(error, `Error preparing to ${action} tests.`);
    return true;
  }

  const testRun = testController.createTestRun(request, undefined, true);
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(testResultDecorationType, []);
  }

  const { signal, dispose: descartarSignal } = createAbortSignal(token);
  const classes = classesForRoot.get(root) ?? new Map<string, vscode.TestItem>();
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(itemUri(root));
  const documentSymbols = new Map<string, vscode.DocumentSymbol[]>();
  const filesText = new Map<string, string>();
  const metodosParaDecorar: { item: vscode.TestItem; status: TestStatus; durationText?: string }[] = [];

  const metodosSolicitados = new Map<string, string[] | undefined>();
  for (const teste of testesSolicitados) {
    metodosSolicitados.set(teste.class, teste.methods);
  }

  try {
    for (const classItem of new Set(clsItemsRun)) {
      testRun.started(classItem);
      classItem.children.forEach((methodItem) => testRun.started(methodItem));
    }

    // 1. Plano: qual base cada classe exige e em qual namespace ela roda
    const resolucao = await sourceControlApi.post<ResolucaoResponse>(
      ROUTES.resolveUnitTests(api.ns),
      { classes: [...metodosSolicitados.keys()] },
      { signal, timeout: requestTimeout }
    );

    const plano = resolucao.data;
    const erroPlano = erroDoBackend(plano);
    if (erroPlano) {
      handleError(new Error(erroPlano), `Error resolving tests to ${action}.`);
      return true;
    }
    if (!plano || !Array.isArray(plano.grupos)) {
      handleError(new Error("O executor de testes não devolveu um plano de execução válido."));
      return true;
    }

    for (const naoExec of plano.naoExecutaveis ?? []) {
      const clsItem = classes.get(naoExec.classe);
      if (!clsItem) continue;
      testRun.appendOutput(`${ANSI_YELLOW}${naoExec.classe}: ${naoExec.mensagem}${ANSI_RESET}\r\n`);
      testRun.skipped(clsItem);
      clsItem.children.forEach((m) => testRun.skipped(m));
    }

    // 2. Resolve o que esta ambiguo ou ausente, antes de executar qualquer coisa
    for (const grupo of plano.grupos) {
      if (token.isCancellationRequested) break;

      if (grupo.situacao === "baseAmbigua") {
        const escolhido = await perguntarNamespace(grupo);
        if (!escolhido) {
          marcarGrupoIgnorado(testRun, classes, grupo, "Namespace não escolhido.");
          continue;
        }
        grupo.namespace = escolhido;
        grupo.situacao = "pronta";
      } else if (grupo.situacao === "baseAusente" && grupo.podeGerar) {
        if (!(await perguntarGerarBase(grupo))) {
          marcarGrupoIgnorado(testRun, classes, grupo, "Base não gerada.");
          continue;
        }
        const idBase = grupo.base?.id ?? "";
        const namespaceGerado = await aguardarOperacaoServidor(
          sourceControlApi,
          api.ns,
          `Gerando a base ${idBase}`,
          ROUTES.gerarBaseTeste(api.ns),
          { idBase },
          token,
          signal
        );
        if (!namespaceGerado) {
          marcarGrupoIgnorado(testRun, classes, grupo, "A base não foi gerada.");
          continue;
        }
        grupo.namespace = namespaceGerado;
        grupo.situacao = "pronta";
      } else if (grupo.situacao === "ambienteAusente") {
        // O TESTEUNITARIO e criado na primeira execucao sem base, dropando e recriando uma
        // database e um namespace IRIS. Feito dentro da requisicao de execucao, isso devolve
        // 504 no gateway -- por isso vira uma operacao acompanhada, igual a geração de base.
        const namespacePreparado = await aguardarOperacaoServidor(
          sourceControlApi,
          api.ns,
          "Montando o ambiente de testes sem base de dados",
          ROUTES.prepararAmbienteTeste(api.ns),
          {},
          token,
          signal
        );
        if (!namespacePreparado) {
          marcarGrupoIgnorado(testRun, classes, grupo, "O ambiente de testes não foi montado.");
          continue;
        }
        grupo.namespace = namespacePreparado;
        grupo.situacao = "pronta";
      } else if (grupo.situacao !== "pronta") {
        marcarGrupoIgnorado(
          testRun,
          classes,
          grupo,
          `A base ${grupo.base?.id ?? ""} não está montada e não pode ser gerada nesta instalação.`
        );
        continue;
      }

      // 3. Executa CLASSE A CLASSE, reportando conforme cada uma termina
      for (const classe of grupo.classes) {
        if (token.isCancellationRequested) break;

        const clsItem = classes.get(classe);
        if (!clsItem) continue;

        let idExecucaoAtual: string | undefined;

        try {
          // O POST apenas INICIA a execucao e volta na hora; o teste roda em JOB no servidor
          const inicioExec = await sourceControlApi.post<SituacaoExecucao | ResultadoClasse>(
            ROUTES.executarClasseTeste(api.ns),
            {
              namespace: grupo.namespace,
              classe,
              metodos: metodosSolicitados.get(classe) ?? [],
              incluirAsserts,
            },
            { signal, timeout: requestTimeout }
          );

          const erroInicio = erroDoBackend(inicioExec.data);
          if (erroInicio) {
            throw new Error(erroInicio);
          }

          const inicioDados = inicioExec.data as Partial<SituacaoExecucao> & Partial<ResultadoClasse>;

          // Impedimento detectado na validacao sincrona (base, catalogo, metodo): ja vem pronto
          if (!inicioDados?.idExecucao) {
            const recusa = inicioExec.data as ResultadoClasse;
            if (!recusa || !Array.isArray(recusa.metodos)) {
              throw new Error(`O executor não devolveu resultado para ${classe}.`);
            }
            await reportarClasse(
              testRun,
              clsItem,
              recusa,
              classes,
              workspaceFolder,
              documentSymbols,
              filesText,
              metodosParaDecorar
            );
            continue;
          }

          idExecucaoAtual = inicioDados.idExecucao;

          await aguardarExecucao(sourceControlApi, api.ns, inicioDados.idExecucao, token, signal, requestTimeout);

          if (token.isCancellationRequested) break;

          const primeira = await sourceControlApi.get<ResultadoClasse>(
            ROUTES.paginaResultadoTeste(api.ns, inicioDados.idExecucao),
            { params: { incluirAsserts }, signal, timeout: requestTimeout }
          );

          let resultado = primeira.data;
          const erroClasse = erroDoBackend(resultado);
          if (erroClasse) {
            throw new Error(erroClasse);
          }
          if (!resultado || !Array.isArray(resultado.metodos)) {
            throw new Error(`O executor não devolveu resultado para ${classe}.`);
          }

          resultado = await coletarPaginas(sourceControlApi, api.ns, resultado, incluirAsserts, signal, requestTimeout);

          await reportarClasse(
            testRun,
            clsItem,
            resultado,
            classes,
            workspaceFolder,
            documentSymbols,
            filesText,
            metodosParaDecorar
          );
        } catch (error) {
          if (token.isCancellationRequested) break;
          handleError(error, `Error running tests for ${classe}.`);
          testRun.errored(clsItem, new vscode.TestMessage(String(error)));

          // Desistir de acompanhar nao para o JOB no servidor: sem descartar, o resultado
          // fica orfao em ^mtempUTResultado ate o expurgo.
          if (idExecucaoAtual) {
            await sourceControlApi.delete(ROUTES.paginaResultadoTeste(api.ns, idExecucaoAtual)).then(
              () => undefined,
              () => undefined
            );
          }
        }
      }
    }

    applyTestResultDecorations(metodosParaDecorar);
  } finally {
    descartarSignal();
    testRun.end();
  }

  return true;
}

async function runHandler(
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
  testController: vscode.TestController,
  debug = false
): Promise<void> {
  const action = debug ? "debug" : "run";
  let root: vscode.TestItem | undefined;
  const asyncRequest: Atelier.AsyncUnitTestRequest = {
    request: "unittest",
    tests: [],
    debug,
  };
  const clsItemsRun: vscode.TestItem[] = [];

  try {
    // Determine the test root for this run
    let roots: (vscode.TestItem | undefined)[];
    if (request.include?.length) {
      roots = [...new Set(request.include.map((i) => rootItemForItem(testController, itemUri(i))))];
    } else {
      // Run was launched from controller's root level
      // Ignore any roots that have errors
      roots = [];
      testController.items.forEach((i) => i.error == undefined && roots.push(i));
    }
    if (roots.length > 1) {
      // Can't run tests from multiple roots, so ask the user to pick one
      const picked = await vscode.window.showQuickPick(
        roots.map((i) => {
          return {
            label: i!.label,
            detail: displayableUri(itemUri(i!)),
            item: i,
          };
        }),
        {
          matchOnDetail: true,
          title: `Cannot ${action} tests from multiple roots at once`,
          prompt: `Pick a root to ${action} tests from`,
        }
      );
      if (picked) {
        root = picked.item;
      }
    } else if (roots.length == 1) {
      root = roots[0];
    }
    if (!root) {
      // Need a root to continue
      return;
    }
    sendUnitTestTelemetryEvent(itemUri(root), debug);

    // Add the initial items to the queue to process
    const queue: vscode.TestItem[] = [];
    const rootUri = itemUri(root);
    const rootUriString = rootUri.toString();
    if (request.include?.length) {
      request.include.forEach((i) => {
        const iUri = itemUri(i);
        if (uriIsAncestorOf(rootUri, iUri) || iUri.toString() == rootUriString) {
          queue.push(i);
        }
      });
    } else {
      queue.push(root);
    }

    // Get the autoload configuration for the root
    const autoload = vscode.workspace.getConfiguration("objectscript.unitTest.autoload", rootUri);
    const autoloadFolder: string = autoload.get("folder")!;
    const autoloadXml: boolean = autoload.get("xml")!;
    const autoloadUdl: boolean = autoload.get("udl")!;
    const autoloadEnabled: boolean = autoloadFolder != "" && (autoloadXml || autoloadUdl) && notIsfs(rootUri);
    const autoloadProcessed: string[] = [];

    // Process every test that was queued
    // Recurse down to leaves (methods) and build a map of their parents (classes)
    while (queue.length > 0 && !token.isCancellationRequested) {
      const test = queue.pop()!;

      // Skip tests the user asked to exclude
      if (request.exclude?.length && request.exclude.some((excludedTest) => excludedTest.id === test.id)) {
        continue;
      }

      if (autoloadEnabled) {
        // Process any autoload folders needed by this item
        const basePath = rootUri.path.endsWith("/") ? rootUri.path.slice(0, -1) : rootUri.path;
        const directories = [
          "",
          ...itemUri(test)
            .path.slice(basePath.length + 1)
            .split("/"),
        ];
        if (directories[directories.length - 1].toLowerCase().endsWith(".cls")) {
          // Remove the class name
          directories.pop();
        }
        let testPath = "";
        do {
          const currentDir = directories.shift();
          testPath = currentDir != "" ? `${testPath}/${currentDir}` : "";
          if (!autoloadProcessed.includes(testPath)) {
            // Look for XML or UDL files in the autoload folder
            const files = await vscode.workspace.findFiles(
              new vscode.RelativePattern(
                itemUri(test).with({ path: `${basePath}${testPath}/${autoloadFolder}` }),
                `**/*.{${autoloadXml ? "xml,XML" : ""}${autoloadXml && autoloadUdl ? "," : ""}${
                  autoloadUdl ? "cls,CLS,mac,MAC,int,INT,inc,INC" : ""
                }}`
              )
            );
            if (files.length) {
              if (asyncRequest.load == undefined) asyncRequest.load = [];
              for (const file of files) {
                // Add this file to the list to load
                asyncRequest.load.push({
                  file: file.fsPath,
                  content: textDecoder.decode(await vscode.workspace.fs.readFile(file)).split(/\r?\n/),
                });
              }
            }
            autoloadProcessed.push(testPath);
          }
        } while (directories.length);
      }

      // Resolve children if not already done
      if (test.canResolveChildren && !test.children.size) {
        await testController.resolveHandler!(test);
      }

      if (itemUri(test).path.toLowerCase().endsWith(".cls")) {
        if (test.id.includes(methodIdSeparator)) {
          // This is a method item
          // Will only reach this code if this item is in request.include

          // Look up the name of this class
          const cls = classNameForItem(test.parent!, root);
          if (cls) {
            // Check if there's a test object for the parent class already
            const clsObjIdx = asyncRequest.tests.findIndex((t) => t.class == cls);
            if (clsObjIdx > -1) {
              // Modify the existing test object if required
              const clsObj = asyncRequest.tests[clsObjIdx];
              if (clsObj.methods && !clsObj.methods.includes(test.label)) {
                clsObj.methods.push(test.label);
                asyncRequest.tests[clsObjIdx] = clsObj;
              }
            } else {
              // Create a new test object
              asyncRequest.tests.push({
                class: cls,
                methods: [test.label],
              });
              if (notIsfs(test.parent!.uri!)) {
                // Add this class to the list to load
                if (asyncRequest.load == undefined) asyncRequest.load = [];
                asyncRequest.load.push({
                  file: test.parent!.uri!.fsPath,
                  content: textDecoder.decode(await vscode.workspace.fs.readFile(test.parent!.uri!)).split(/\r?\n/),
                });
              }
              clsItemsRun.push(test.parent!);
            }
          }
        } else {
          // This is a class item

          // Look up the name of this class
          const cls = classNameForItem(test, root);
          if (cls && test.children.size) {
            // It doesn't make sense to run a class with no "Test" methods
            // Create the test object
            const clsObj: { class: string; methods?: string[] } = { class: cls };
            if (request.exclude?.length) {
              // Determine the methods to run
              clsObj.methods = [];
              test.children.forEach((i) => {
                if (!request.exclude!.some((excludedTest) => excludedTest.id === i.id)) {
                  clsObj.methods!.push(i.label);
                }
              });
              if (clsObj.methods.length == 0) {
                // No methods to run, so don't add the test object
                continue;
              }
              if (clsObj.methods.length == test.children.size) {
                // A test object with no methods means "run all methods"
                delete clsObj.methods;
              }
            }
            if (notIsfs(test.uri!)) {
              // Add this class to the list to load
              if (asyncRequest.load == undefined) asyncRequest.load = [];
              asyncRequest.load.push({
                file: test.uri!.fsPath,
                content: textDecoder.decode(await vscode.workspace.fs.readFile(test.uri!)).split(/\r?\n/),
              });
            }
            asyncRequest.tests.push(clsObj);
            clsItemsRun.push(test);
          }
        }
      } else {
        // Queue any children
        test.children.forEach((i) => queue.push(i));
      }
    }

    if (token.isCancellationRequested) {
      return;
    }
  } catch (error) {
    handleError(error, `Error determining tests to ${action}.`);
    return;
  }

  if (!asyncRequest.tests.length) {
    vscode.window.showInformationMessage(`No tests to ${action}.`, "Dismiss");
    return;
  }

  const unitTestConfig = vscode.workspace.getConfiguration("objectscript.unitTest", itemUri(root));
  const showOutputSetting = unitTestConfig.get<boolean>("showOutput");

  // Ignore console output at the user's request
  asyncRequest.console = showOutputSetting;

  const api = new AtelierAPI(itemUri(root));
  if (!debug) {
    // Escape hatch enquanto o executor novo esta em validacao. Sera removido junto com
    // executeLegacyRunner assim que o fluxo v2 estiver homologado.
    if (unitTestConfig.get<boolean>("usarExecutorAntigo") === true) {
      await executeLegacyRunner(
        api,
        request,
        testController,
        root,
        clsItemsRun,
        asyncRequest,
        token,
        action,
        showOutputSetting !== false
      );
      return;
    }

    await executeConsistemRunner(api, request, testController, root, clsItemsRun, asyncRequest.tests, token, action);
    return;
  }

  vscode.window.showWarningMessage(
    "O executor de testes atual não suporta depuração. Alternando para o executor padrão."
  );

  // Send the queue request
  const queueResp: Atelier.Response<any> | undefined = await api.queueAsync(asyncRequest, true).catch((error) => {
    handleError(error, `Error creating job to ${action} tests.`);
    return undefined;
  });
  if (!queueResp) return;

  // Request was successfully queued, so get the ID
  const id: string = queueResp.result.location;
  if (token.isCancellationRequested) {
    // The user cancelled the request, so cancel it on the server
    await api.verifiedCancel(id, false);
    return;
  }

  // Start the TestRun
  const testRun = testController.createTestRun(request, undefined, true);

  try {
    // "Start" all of the test classes and methods that we're running
    clsItemsRun.forEach((c) => {
      testRun.started(c);
      c.children.forEach((m) => testRun.started(m));
    });

    // Create a map of all TestItems that we know the status of
    const knownStatuses: WeakMap<vscode.TestItem, TestStatus> = new WeakMap();

    // Keep track of if/when the debug session was started
    let startedDebugging = false;

    // Get the map of class items for this root
    const classes = classesForRoot.get(root);

    // Keep track of the item that the current console output is from
    let currentOutputItem: vscode.TestItem | undefined;

    // The workspace folder that we're running tests in
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(itemUri(root));

    // A map of all documents that we've computed symbols for
    const documentSymbols: Map<string, vscode.DocumentSymbol[]> = new Map();

    // A map of all documents that we've fetched the text of
    const filesText: Map<string, string> = new Map();

    // Poll until the tests have finished running or are cancelled by the user
    const processUnitTestResults = async (): Promise<Atelier.Response<any>> => {
      const pollResp = await api.pollAsync(id, true);
      if (pollResp.console.length) {
        // Log console output
        for (const consoleLine of pollResp.console) {
          const indent = consoleLine.search(/\S/);
          if (indent == 4) {
            if (consoleLine.endsWith("...")) {
              // This is the beginning of a class
              currentOutputItem = classes!.get(consoleLine.trim().split(" ")[0]);
            } else {
              // This is the end of a class
              if (currentOutputItem != undefined && currentOutputItem.id.includes(methodIdSeparator)) {
                currentOutputItem = currentOutputItem.parent!;
              }
            }
          } else if (indent == 6 && consoleLine.endsWith("...")) {
            // This is the beginning of a method
            if (currentOutputItem != undefined) {
              if (currentOutputItem.id.includes(methodIdSeparator)) {
                currentOutputItem = currentOutputItem.parent!.children.get(
                  `${currentOutputItem.parent!.id}${methodIdSeparator}${consoleLine.trim().slice(4).split("(")[0]}`
                );
              } else {
                currentOutputItem = currentOutputItem.children.get(
                  `${currentOutputItem.id}${methodIdSeparator}${consoleLine.trim().slice(4).split("(")[0]}`
                );
              }
            }
          } else if (indent == 2 && currentOutputItem != undefined) {
            // This is the end of all test classes
            currentOutputItem = undefined;
          }
          if (currentOutputItem != undefined) {
            testRun.appendOutput(
              `${consoleLine}\r\n`,
              new vscode.Location(currentOutputItem.uri!, currentOutputItem.range!),
              currentOutputItem
            );
          } else {
            testRun.appendOutput(`${consoleLine}\r\n`);
          }
        }
      }
      if (testRun.token.isCancellationRequested) {
        // The user cancelled the request, so cancel it on the server
        return api.verifiedCancel(id, false);
      }

      if (Array.isArray(pollResp.result)) {
        // Process results
        for (const testResult of <TestResult[]>pollResp.result) {
          const clsItem = classes!.get(testResult.class);
          if (clsItem) {
            if (testResult.method) {
              // This is a method's result
              const methodItem = clsItem.children.get(`${clsItem.id}${methodIdSeparator}${testResult.method}`);
              if (methodItem) {
                knownStatuses.set(methodItem, testResult.status);
                switch (testResult.status) {
                  case TestStatus.Failed: {
                    const messages: vscode.TestMessage[] = [];
                    if (testResult.error) {
                      // Make the error the first message
                      messages.push(
                        new vscode.TestMessage(new vscode.MarkdownString(markdownifyLine(testResult.error)))
                      );
                    }
                    if (testResult.failures.length) {
                      // Add a TestMessage for each failed assert with the correct location, if provided
                      for (const failure of testResult.failures) {
                        const message = new vscode.TestMessage(
                          new vscode.MarkdownString(markdownifyLine(failure.message))
                        );
                        if (failure.location) {
                          if (failure.location.document.toLowerCase().endsWith(".cls")) {
                            let locationUri: vscode.Uri | null | undefined;
                            if (classes!.has(failure.location.document.slice(0, -4))) {
                              // This is one of the known test classes
                              locationUri = classes!.get(failure.location.document.slice(0, -4))!.uri;
                            } else {
                              // This is some other class. There's a chance that
                              // the class won't exist after the tests are run
                              // but we still want to provide the location
                              // because it will often be useful to the user.
                              locationUri = DocumentContentProvider.getUri(
                                failure.location.document,
                                workspaceFolder!.name,
                                failure.location.namespace
                              );
                            }
                            if (locationUri) {
                              if (!documentSymbols.has(locationUri.toString())) {
                                const newSymbols = await vscode.commands
                                  .executeCommand<
                                    vscode.DocumentSymbol[]
                                  >("vscode.executeDocumentSymbolProvider", locationUri)
                                  .then(
                                    (r) => r[0]?.children,
                                    () => undefined
                                  );
                                if (newSymbols != undefined) documentSymbols.set(locationUri.toString(), newSymbols);
                              }
                              const locationSymbols = documentSymbols.get(locationUri.toString());
                              if (locationSymbols != undefined) {
                                // Get the text of the class
                                if (!filesText.has(locationUri.toString())) {
                                  const newFileText = await getFileText(locationUri).catch(() => undefined);
                                  if (newFileText != undefined) filesText.set(locationUri.toString(), newFileText);
                                }
                                const fileText = filesText.get(locationUri.toString());
                                if (fileText != undefined) {
                                  // Find the line in the text
                                  const locationLine = methodOffsetToLine(
                                    locationSymbols,
                                    fileText,
                                    failure.location.label!,
                                    failure.location.offset
                                  );
                                  if (locationLine != undefined) {
                                    // We found the line, so add a location to the message
                                    message.location = new vscode.Location(
                                      locationUri,
                                      // locationLine is one-indexed but Range is zero-indexed
                                      new vscode.Range(locationLine - 1, 0, locationLine, 0)
                                    );
                                  }
                                }
                              }
                            }
                          } else if (failure.location.label == undefined) {
                            // This location doesn't contain a label, so if we can
                            // resolve a URI for the document then report the location.
                            // There's a chance that the generated URI will be for a
                            // document that won't exist after the tests are run
                            // (for example, an autoloaded document that's in an
                            // XML file) but we still want to provide the location
                            // because it will often be useful to the user.
                            const locationUri = DocumentContentProvider.getUri(
                              failure.location.document,
                              workspaceFolder!.name,
                              failure.location.namespace
                            );
                            if (locationUri) {
                              message.location = new vscode.Location(
                                locationUri,
                                new vscode.Range(failure.location.offset ?? 0, 0, (failure.location.offset ?? 0) + 1, 0)
                              );
                            }
                          } else {
                            // This location isn't in a class and
                            // requires resolving a label to a line.
                            // We can try to resolve it but the document might
                            // get cleaned up when the tests finish running.
                          }
                        }
                        messages.push(message);
                      }
                    }
                    testRun.failed(methodItem, messages, testResult.duration);
                    break;
                  }
                  case TestStatus.Passed:
                    testRun.passed(methodItem, testResult.duration);
                    break;
                  default:
                    testRun.skipped(methodItem);
                }
              }
            } else {
              // This is a class's result
              // Report any methods that don't have statuses yet as "skipped"
              clsItem.children.forEach((methodItem) => {
                if (!knownStatuses.has(methodItem)) {
                  knownStatuses.set(methodItem, TestStatus.Skipped);
                  testRun.skipped(methodItem);
                }
              });
              // Report this class's status
              switch (testResult.status) {
                case TestStatus.Failed: {
                  const messages: vscode.TestMessage[] = [];
                  if (testResult.error) {
                    // Make the error the first message
                    messages.push(new vscode.TestMessage(new vscode.MarkdownString(markdownifyLine(testResult.error))));
                  }
                  if (testResult.failures.length) {
                    // Add a TestMessage showing the failures as a bulleted list
                    messages.push(
                      new vscode.TestMessage(
                        new vscode.MarkdownString(
                          `There are failed test methods:\n${testResult.failures
                            .map((failure) => markdownifyLine(failure.message, true))
                            .join("\n")}`
                        )
                      )
                    );
                  }
                  testRun.failed(clsItem, messages, testResult.duration);
                  break;
                }
                case TestStatus.Passed:
                  testRun.passed(clsItem, testResult.duration);
                  break;
                default: {
                  // Only report a class as skipped if all of its methods are skipped
                  let allSkipped = true;
                  for (const [, methodItem] of clsItem.children) {
                    if (knownStatuses.get(methodItem) == TestStatus.Passed) {
                      allSkipped = false;
                      break;
                    }
                  }
                  if (allSkipped) {
                    testRun.skipped(clsItem);
                  } else {
                    testRun.passed(clsItem, testResult.duration);
                  }
                }
              }
            }
          }
        }
      } else if (debug && queueResp.result.content?.debugId && pollResp.result?.content?.debugReady) {
        // Make sure the activeTextEditor's document is in the same workspace folder as the test
        // root so the debugger connects to the correct server and runs in the correct namespace
        const rootWsFolderIdx = vscode.workspace.getWorkspaceFolder(itemUri(root))?.index;
        if (
          !vscode.window.activeTextEditor?.document.uri ||
          vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)?.index != rootWsFolderIdx
        ) {
          // Make an existing editor active if one is in the correct workspace folder
          let shown = false;
          for (const editor of vscode.window.visibleTextEditors) {
            if (vscode.workspace.getWorkspaceFolder(editor.document.uri)?.index == rootWsFolderIdx) {
              await vscode.window.showTextDocument(editor.document);
              shown = true;
              break;
            }
          }
          if (!shown) {
            // Show the first test class. Ugly but necessary.
            await vscode.window.showTextDocument(
              classesForRoot.get(root)!.get(asyncRequest.tests[0].class)?.uri as vscode.Uri
            );
          }
        }
        // Start the debugging session
        startedDebugging = await vscode.debug.startDebugging(
          undefined,
          {
            type: "objectscript",
            request: "attach",
            name: "Unit tests",
            cspDebugId: queueResp.result.content.debugId,
            isUnitTest: true,
          },
          { testRun }
        );
      }

      if (pollResp.retryafter) {
        // Poll again
        await new Promise((resolve) => {
          // Poll less often when debugging because the tests
          // will be executing much slower due to user interaction
          setTimeout(resolve, startedDebugging ? 250 : 50);
        });
        if (testRun.token.isCancellationRequested) {
          // The user cancelled the request, so cancel it on the server
          return api.verifiedCancel(id, false);
        }
        return processUnitTestResults();
      }
      return pollResp;
    };
    await processUnitTestResults();
  } catch (error) {
    handleError(error, `Error ${action}${debug ? "g" : "n"}ing tests.`);
  }
  testRun.end();
}

/** The `configureHandler` function for the `TestRunProfile`s. */
function configureHandler(): void {
  // Open the settings UI and focus on the "objectscript.unitTest" settings
  vscode.commands.executeCommand(
    "workbench.action.openSettings",
    "@ext:consistem-sistemas.consistem-vscode-objectscript unitTest"
  );
}

/** Set up the `TestController` and all of its dependencies. */
export function setUpTestController(context: vscode.ExtensionContext): vscode.Disposable[] {
  // If currently disabled, just create a mechanism to activate when the setting changes
  if (vscode.workspace.getConfiguration("objectscript.unitTest").get("enabled") === false) {
    const disposablesWhenDisabled = [
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("objectscript.unitTest")) {
          if (vscode.workspace.getConfiguration("objectscript.unitTest").get("enabled") === true) {
            // Set myself up as active
            const disposablesWhenEnabled = setUpTestController(context);
            context.subscriptions.push(...disposablesWhenEnabled);
            // Clean up after inactive state
            disposablesWhenDisabled.forEach((disposable) => {
              disposable.dispose();
            });
            return;
          }
        }
      }),
    ];
    return disposablesWhenDisabled;
  }
  // Create and set up the test controller
  const testController = vscode.tests.createTestController(extensionId, "ObjectScript");
  testController.resolveHandler = async (item?: vscode.TestItem) => {
    if (!item) return; // Can't resolve "undefined"
    const uri = itemUri(item);
    item.busy = true;
    try {
      if (uri.path.toLowerCase().endsWith(".cls")) {
        // Compute items for the Test* methods in this class
        await addTestItemsForClass(testController, item);
      } else {
        if (notIsfs(uri)) {
          // Read the local directory for non-autoload subdirectories and classes
          const autoload = vscode.workspace.getConfiguration("objectscript.unitTest.autoload", uri);
          const autoloadFolder: string = autoload.get("folder")!;
          const autoloadEnabled: boolean = autoloadFolder != "" && (autoload.get("xml") || autoload.get("udl"))!;
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
          let workspaceRootItem: vscode.TestItem | undefined;
          if (workspaceFolder) {
            for (const [, root] of testController.items) {
              if (itemUri(root).toString() === workspaceFolder.uri.toString()) {
                workspaceRootItem = root;
                break;
              }
            }
          }

          const entries = await vscode.workspace.fs.readDirectory(uri);
          for (const element of entries) {
            const childUri = uri.with({
              path: `${uri.path}${!uri.path.endsWith("/") ? "/" : ""}${element[0]}`,
            });

            // Aplica o filtro dos roots configurados
            if (workspaceRootItem && !pathMatchesAnyWorkspaceRoot(workspaceRootItem, childUri)) {
              continue;
            }

            if (
              (element[1] == vscode.FileType.Directory &&
                !element[0].startsWith("_") && // %UnitTest.Manager skips subfolders that start with _
                (!autoloadEnabled || (autoloadEnabled && element[0] != autoloadFolder))) ||
              (element[1] == vscode.FileType.File && element[0].toLowerCase().endsWith(".cls"))
            ) {
              // This element is a non-autoload directory or a .cls file
              addChildItem(testController, item, element[0]);
            }
          }
        } else {
          // Query the server for subpackages and classes
          (await childrenForServerSideFolderItem(item).then((data) => data.result.content)).forEach((child) =>
            addChildItem(testController, item, child.Name)
          );
        }
      }
    } catch (error) {
      handleError(error);
      item.error = new vscode.MarkdownString(
        "Error fetching children. Check the `ObjectScript` Output channel for details."
      );
    }
    item.busy = false;
  };
  testController.refreshHandler = () => {
    // Create new roots
    replaceRootTestItems(testController);
    // Resolve children for the roots
    testController.items.forEach((item) => testController.resolveHandler!(item));
  };
  // Create the run and debug profiles
  const runProfile = testController.createRunProfile(
    "ObjectScript Run",
    vscode.TestRunProfileKind.Run,
    (r, t) => runHandler(r, t, testController),
    true
  );
  const debugProfile = testController.createRunProfile(
    "ObjectScript Debug",
    vscode.TestRunProfileKind.Debug,
    (r, t) => runHandler(r, t, testController, true),
    true
  );
  runProfile.configureHandler = configureHandler;
  debugProfile.configureHandler = configureHandler;
  // Create the initial root items
  replaceRootTestItems(testController);

  const openClass = vscode.workspace.textDocuments.find((d) => d.languageId == clsLangId);
  if (openClass) {
    // Create TestItems for any test classes that are open at activation.
    // Must be done after this extension activates because the resolve
    // handler executes the DocumentSymbol command and therefore needs
    // this extension (or the Language Server) active to respond to it.
    // Will only wait a second for the extension(s) to be active.
    const languageServer = vscode.extensions.getExtension(lsExtensionId);
    const waitForResponse = (iter: number): Thenable<vscode.DocumentSymbol[]> =>
      iter > 20
        ? Promise.resolve([])
        : vscode.commands
            .executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", openClass.uri)
            .then((r) =>
              r == undefined
                ? new Promise((resolve) => setTimeout(resolve, 50)).then(() => waitForResponse(iter + 1))
                : r
            );
    Promise.allSettled([
      vscode.extensions.getExtension(extensionId)!.activate(),
      languageServer && !languageServer.isActive
        ? Promise.allSettled([languageServer.activate(), waitForResponse(1)])
        : Promise.resolve(),
    ]).then(() =>
      vscode.workspace.textDocuments.forEach((document) => addItemForClassUri(testController, document.uri))
    );
  }

  /** Delete the test item for `uri`. Returns `true` if an item was deleted. */
  const deleteItemForUri = async (uri: vscode.Uri): Promise<boolean> => {
    let result = false;
    // If a TestItem was deleted, remove it from the controller
    if (uri.path.toLowerCase().endsWith(".cls")) {
      const item = await getTestItemForClass(testController, uri);
      if (item) {
        const rootItem = rootItemForItem(testController, uri);
        if (rootItem) {
          // Remove from our cache of classes
          const classes = classesForRoot.get(rootItem);
          if (classes) {
            let cls: string | undefined;
            for (const element of classes) {
              if (element[1].id == item.id) {
                cls = element[0];
                break;
              }
            }
            if (cls) {
              classes.delete(cls);
              classesForRoot.set(rootItem, classes);
            }
          }
        }
        item.parent!.children.delete(uri.toString());
        result = true;
      }
    }
    return result;
  };

  // Gather disposables
  const disposables = [
    testController,
    runProfile,
    debugProfile,
    // Register event handlers
    vscode.workspace.onDidChangeWorkspaceFolders((e) => {
      // Update root items if needed
      e.removed.forEach((wf) => {
        testController.items.forEach((i) => {
          if (uriIsAncestorOf(wf.uri, itemUri(i))) {
            // Remove this TestItem
            classesForRoot.delete(i);
            testController.items.delete(i.id);
          }
        });
      });
      e.added.forEach((wf) => {
        const newItems = createRootItemsForWorkspaceFolder(testController, wf);
        newItems.forEach((i) => {
          testController.items.add(i);
          classesForRoot.set(i, new Map());
        });
      });
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Determine the root items that need to be replaced, if any
      const replace: vscode.TestItem[] = [];
      testController.items.forEach((item) => {
        const uri = itemUri(item);
        if (
          (notIsfs(uri) && e.affectsConfiguration("objectscript.unitTest", uri)) ||
          e.affectsConfiguration("objectscript.conn", uri) ||
          e.affectsConfiguration("intersystems.servers", uri)
        ) {
          replace.push(item);
        }
      });
      // Replace the affected root items
      replace.forEach((item) => {
        classesForRoot.delete(item);
        testController.items.delete(item.id);
        const folder = vscode.workspace.getWorkspaceFolder(itemUri(item));
        if (folder) {
          const newItems = createRootItemsForWorkspaceFolder(testController, folder);
          newItems.forEach((i) => {
            testController.items.add(i);
            classesForRoot.set(i, new Map());
            if (replace.some((r) => r.id == i.id)) {
              testController.invalidateTestResults(i);
            }
          });
        }
      });
      // Re-compute TestItems for any open test classes
      vscode.workspace.textDocuments.forEach((document) => addItemForClassUri(testController, document.uri));
    }),
    vscode.workspace.onDidOpenTextDocument((document) => addItemForClassUri(testController, document.uri)),
    vscode.workspace.onDidChangeTextDocument(async (e) => {
      // If this is a test class, re-compute its TestItems
      if (e.document.languageId == clsLangId) {
        // Don't pass create flag because if it existed it would
        // have been created already by the onDidOpen handler
        const item = await getTestItemForClass(testController, e.document.uri);
        if (item) {
          testController.invalidateTestResults(item);
          if (item.canResolveChildren) {
            // Resolve the methods
            testController.resolveHandler!(item);
          }
        }
      }
    }),
    vscode.workspace.onDidDeleteFiles((e) => e.files.forEach(deleteItemForUri)),
    vscode.workspace.onDidCreateFiles((e) => e.files.forEach((uri) => addItemForClassUri(testController, uri))),
    vscode.workspace.onDidRenameFiles((e) =>
      e.files.forEach(async (file) => {
        // If the oldUri was a test class, attempt to create a new item for it
        if (await deleteItemForUri(file.oldUri)) addItemForClassUri(testController, file.newUri);
      })
    ),
  ];

  return [
    ...disposables,
    // Add a listener to disable myself if the setting changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("objectscript.unitTest")) {
        if (vscode.workspace.getConfiguration("objectscript.unitTest").get("enabled") === false) {
          // Remove my active self and clean up
          testController.dispose();
          disposables.forEach((disposable) => {
            disposable.dispose();
          });
          // Create a stub self that will reactivate when enabled again
          const disposablesWhenEnabled = setUpTestController(context);
          context.subscriptions.push(...disposablesWhenEnabled);
          return;
        }
      }
    }),
  ];
}

/** Uma base montada que atende alguma classe de teste unitário */
interface BaseMontada {
  namespace: string;
  idBase: string;
  tipo: number;
  tipoDescricao: string;
  revisao: string;
  qtdClassesUT: number;
  usuarioGerou: string;
  /** `null` quando a base não registrou data de geração */
  geradaEm: string | null;
}

interface ListaBasesResponse {
  versao: number;
  namespaceSolicitado: string;
  bases: BaseMontada[];
}

/** Monta o rótulo de uma base no QuickPick */
function descreverBase(base: BaseMontada): vscode.QuickPickItem & { base: BaseMontada } {
  const quando = base.geradaEm ? `gerada em ${base.geradaEm}` : "data de geração desconhecida";
  const revisao = base.revisao ? ` · rev. ${base.revisao}` : "";
  const quem = base.usuarioGerou ? ` · por ${base.usuarioGerou}` : "";

  return {
    label: `${base.namespace} — ${base.idBase}`,
    description: base.tipoDescricao,
    detail: `${base.qtdClassesUT} classe(s) de teste · ${quando}${revisao}${quem}`,
    base,
  };
}

/**
 * Lista as bases de teste montadas e permite regerar a escolhida.
 *
 * Regerar EXCLUI e recria o namespace a partir do checkout, exatamente como a opção
 * "Regerar (B)ase" do Gerenciador de Bases. Por isso a confirmação é modal e o default
 * é cancelar, espelhando o "(S/N): N" do terminal.
 */
export async function gerenciarBasesTeste(): Promise<void> {
  // O namespace da requisição decide QUAIS bases aparecem: a lista sai do `^%CSW1BASE` do
  // namespace consultado, e um namespace de fontes que não tenha esse global devolve lista
  // vazia sem erro. Por isso o namespace nunca é herdado em silêncio do workspace ativo —
  // ele é perguntado, como no "Criar Item".
  const workspaceFolder = await getWsFolder(
    "Escolha o workspace cujo namespace será consultado",
    false,
    false,
    false,
    true
  );
  if (workspaceFolder === undefined) {
    vscode.window.showErrorMessage("Nenhum workspace conectado a um servidor InterSystems.", "Dismiss");
    return;
  }
  if (!workspaceFolder) return; // usuário fechou o QuickPick

  const api = new AtelierAPI(workspaceFolder.uri);
  if (!api.active || !api.ns) {
    vscode.window.showErrorMessage(
      `O workspace ${workspaceFolder.name} não tem conexão ativa com o servidor.`,
      "Dismiss"
    );
    return;
  }
  const nsConsulta = api.ns.toUpperCase();

  let sourceControlApi: SourceControlApi;
  try {
    sourceControlApi = SourceControlApi.fromAtelierApi(api);
  } catch (error) {
    handleError(error, "Erro ao preparar a conexão com o servidor.");
    return;
  }

  let bases: BaseMontada[];
  try {
    const resposta = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: `Consultando bases de teste em ${nsConsulta}…` },
      () => sourceControlApi.get<ListaBasesResponse>(ROUTES.listarBasesTeste(nsConsulta), { timeout: POLL_TIMEOUT })
    );

    const erro = erroDoBackend(resposta.data);
    if (erro) {
      handleError(new Error(erro), "Erro ao listar as bases de teste.");
      return;
    }

    bases = resposta.data?.bases ?? [];
  } catch (error) {
    handleError(error, "Erro ao listar as bases de teste.");
    return;
  }

  if (!bases.length) {
    // Lista vazia não quer dizer "não há bases": pode ser um namespace que não registra bases.
    const acao = await vscode.window.showInformationMessage(
      `Nenhuma base de teste montada visível no namespace ${nsConsulta}. ` +
        "As bases são registradas por namespace — se esperava encontrar alguma, consulte o namespace da versão correspondente.",
      { modal: false },
      "Escolher outro namespace",
      "Dismiss"
    );
    if (acao === "Escolher outro namespace") await gerenciarBasesTeste();
    return;
  }

  const escolha = await vscode.window.showQuickPick(bases.map(descreverBase), {
    title: `Bases de teste montadas · consultado em ${nsConsulta}`,
    placeHolder: "Escolha a base para regerar",
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });
  if (!escolha) return;

  const alvo = escolha.base;

  // Modal com o namespace na frente: um clique errado no QuickPick não pode derrubar uma base
  const confirmacao = await vscode.window.showWarningMessage(
    `Regerar a base ${alvo.idBase}?`,
    {
      modal: true,
      detail:
        `O namespace ${alvo.namespace} será EXCLUÍDO e recriado a partir do checkout.\n\n` +
        `Todos os dados atuais dessa base serão perdidos e a operação leva alguns minutos. ` +
        `Não há como desfazer.`,
    },
    "Regerar base"
  );
  if (confirmacao !== "Regerar base") return;

  const namespaceRegerado = await aguardarOperacaoServidor(
    sourceControlApi,
    nsConsulta,
    `Regerando a base ${alvo.idBase}`,
    ROUTES.regerarBaseTeste(nsConsulta),
    { namespace: alvo.namespace },
    new vscode.CancellationTokenSource().token
  );

  if (namespaceRegerado) {
    vscode.window.showInformationMessage(
      `Base ${alvo.idBase} regerada com sucesso no namespace ${namespaceRegerado}.`,
      "Dismiss"
    );
  }
}
