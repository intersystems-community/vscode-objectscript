/**
 * One launch per case (test-fixtures/README.md), read back from the workspace file name. A credential
 * prompt anywhere fails the case: VS Code suppresses dialogs in tests, so the connection never gets made.
 */
import { ServerManagerAPI, VSCodeObjectScriptAPI } from "@intersystems-community/intersystems-servermanager";
import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { Conn, parse, SERVERS, SESSION_TIMEOUT_MS } from "../cases";

const EXTENSION_ID = "intersystems-community.vscode-objectscript";
const SERVER_MANAGER_ID = "intersystems-community.servermanager";

const caseName = path.basename(vscode.workspace.workspaceFile!.fsPath, ".code-workspace");
const { kind, serverName, active } = parse(caseName);
const server = SERVERS[serverName];
const folder = vscode.workspace.workspaceFolders![0];
const isServerSide = kind === "serverSide-sm";
const canToggle = active !== undefined;
const configuredActive = active ?? true;
/** The entry for -sm cases; the folder name (the Servers view's Current node) for -os- cases */
const specName = kind.endsWith("-sm") ? serverName : folder.name;

let osAPI: VSCodeObjectScriptAPI;
let smAPI: ServerManagerAPI;
let counter = 0;
const created = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(label: string, probe: () => Promise<T | undefined | false>, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result) {
      return result;
    }
    await sleep(1000);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
}

/** Direct REST to the container, bypassing both extensions */
async function restDoc(method: "GET" | "DELETE", name: string): Promise<string | undefined> {
  const response = await fetch(`http://localhost:${server.webServer.port}/api/atelier/v1/USER/doc/${name}`, {
    method,
    headers: server.password
      ? { Authorization: "Basic " + Buffer.from(`${server.username}:${server.password}`).toString("base64") }
      : {},
  });
  if (response.status === 404) {
    return undefined;
  }
  assert.ok(response.ok, `${method} ${name} failed with HTTP ${response.status}`);
  const { result } = await response.json();
  return Array.isArray(result.content) ? result.content.join("\n") : undefined;
}

async function checkOSResolves(expectActive: boolean): Promise<void> {
  const deadline = Date.now() + 30000;
  let conn = await osAPI.asyncServerForUri(folder.uri);
  while (conn?.active !== expectActive && Date.now() < deadline) {
    await sleep(500);
    conn = await osAPI.asyncServerForUri(folder.uri);
  }
  assert.ok(conn, "no connection for the folder");
  assert.strictEqual(conn.active, expectActive, `expected active=${expectActive}`);
  assert.strictEqual(conn.host, "localhost");
  assert.strictEqual(conn.port, server.webServer.port);
  assert.strictEqual(conn.namespace, "USER");
  assert.strictEqual(conn.username || "", server.username || "");
  assert.strictEqual(conn.password, server.password);
}

async function checkRoundTrips(expectActive: boolean): Promise<void> {
  const className = `CITest.${caseName.replace(/[^A-Za-z0-9]/g, "")}${counter++}`;
  const doc = `${className}.cls`;
  const file = isServerSide
    ? vscode.Uri.joinPath(folder.uri, `${className.replace(/\./g, "/")}.cls`)
    : // Into the existing src/: creating a directory and a file at once can lose the watcher event on Linux
      vscode.Uri.joinPath(folder.uri, "src", `${className}.cls`);
  const source = `Class ${className}\n{\n\nClassMethod Hello() As %String\n{\n\tQuit "hello"\n}\n\n}\n`;
  created.add(doc);
  await vscode.workspace.fs.writeFile(file, Buffer.from(source));
  if (expectActive) {
    const onServer = await waitFor(`${doc} on the server`, () => restDoc("GET", doc));
    assert.match(onServer, new RegExp(`^Class ${className}`));
    await vscode.workspace.fs.delete(file);
    await waitFor(`${doc} deleted from the server`, async () => !(await restDoc("GET", doc)));
    created.delete(doc);
  } else {
    await sleep(5000);
    assert.strictEqual(await restDoc("GET", doc), undefined, "inactive connection must not reach the server");
    await vscode.workspace.fs.delete(file);
    created.delete(doc);
  }
}

async function checkOSListsTheFolder(): Promise<void> {
  const entries = await vscode.workspace.fs.readDirectory(folder.uri);
  assert.ok(entries.length > 0, "namespace listing is empty");
}

type Check = (expectActive: boolean) => Promise<void>;
/** 1–5, as they apply to the case */
const checks: [string, Check][] = [
  ["OS resolves", checkOSResolves],
  ["SM resolves", checkSMResolves],
  ...(isServerSide ? [["OS lists the folder", checkOSListsTheFolder] as [string, Check]] : []),
  ["round-trips", checkRoundTrips],
];

async function applyActive(value: boolean): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("objectscript");
  await cfg.update("conn", { ...cfg.get<Conn>("conn"), active: value }, vscode.ConfigurationTarget.Workspace);
}

async function checkSMResolves(): Promise<void> {
  const spec = await smAPI.getServerSpec(specName);
  assert.ok(spec?.auth, `no spec for '${specName}'`);
  assert.deepStrictEqual(spec.webServer, server.webServer);
  assert.strictEqual(spec.username || "", server.username || "");
  assert.strictEqual(spec.password, server.password);
  assert.strictEqual(spec.auth.resolved(), server.password !== undefined);
}

suite(caseName, () => {
  suiteSetup(async () => {
    const serverManager = vscode.extensions.getExtension<ServerManagerAPI>(SERVER_MANAGER_ID);
    assert.ok(serverManager, `${SERVER_MANAGER_ID} is not installed`);
    smAPI = await serverManager.activate();
    const extension = vscode.extensions.getExtension<VSCodeObjectScriptAPI>(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not installed`);
    // The build under test, not the Marketplace copy Server Manager can pull in
    assert.strictEqual(extension.extensionPath, path.resolve(__dirname, "../../.."));
    osAPI = await extension.activate();
  });

  suiteTeardown(async () => {
    for (const doc of created) {
      await restDoc("DELETE", doc).catch(() => undefined);
    }
  });

  // Each check twice, the second time as the first request on a lapsed session
  for (const [name, check] of checks) {
    test(name, () => check(configuredActive));
    test(`${name} after the session times out`, async () => {
      await sleep(SESSION_TIMEOUT_MS + 3000);
      await check(configuredActive);
    });
  }

  if (canToggle) {
    test("all again with active flipped", async () => {
      await applyActive(!configuredActive);
      for (const [, check] of checks) {
        await check(!configuredActive);
      }
    });
  }
});
