/**
 * Integration tests against the IRIS containers in test-fixtures/iris/docker-compose.yml. runTest.ts
 * generates one workspace file per launch (see test-fixtures/README.md) and opens them one at a time;
 * this suite reads its launch back from the open workspace's file name and runs every check that applies.
 * Every check asserts that the extension used the credentials in settings without prompting: a prompt
 * would leave the connection unestablished and the test would time out.
 */
import * as assert from "assert";
import * as path from "path";
import * as vscode from "vscode";
import { parse, SESSION_TIMEOUT_MS, togglesActive } from "../cases";

const EXTENSION_ID = "intersystems-community.vscode-objectscript";
const SERVER_MANAGER_ID = "intersystems-community.servermanager";

const CASE = path.basename(vscode.workspace.workspaceFile!.fsPath, ".code-workspace");
const { kind, server, active } = parse(CASE);
const FOLDER = vscode.workspace.workspaceFolders![0];
const isServerSide = kind === "serverSide-sm";
const canToggle = togglesActive(kind);
/** docker-compose and serverSide are always active; os-host and sm follow objectscript.conn.active */
const configuredActive = canToggle ? active === true : true;
/** getServerSpec key: the entry for the -sm cases, the folder name for the -os- cases (the Current node) */
const specName = kind.endsWith("-sm") ? server.serverName : FOLDER.name;

let osApi: any;
let smApi: any;
let counter = 0;
const created = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(label: string, probe: () => Promise<T | undefined | false>, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result) return result;
    await sleep(1000);
  }
  throw new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`);
}

/** Talks to the container directly, bypassing both extensions, to check what actually landed on the server */
async function restDoc(method: "GET" | "DELETE", name: string): Promise<string | undefined> {
  const response = await fetch(`http://localhost:${server.port}/api/atelier/v1/USER/doc/${name}`, {
    method,
    headers: server.password
      ? { Authorization: "Basic " + Buffer.from(`${server.username}:${server.password}`).toString("base64") }
      : {},
  });
  if (response.status === 404) return undefined;
  assert.ok(response.ok, `${method} ${name} failed with HTTP ${response.status}`);
  const { result } = await response.json();
  return Array.isArray(result.content) ? result.content.join("\n") : undefined;
}

/** Check 1: the extension resolves the folder as configured, without prompting */
async function checkResolves(expectActive: boolean): Promise<void> {
  const deadline = Date.now() + 30000;
  let conn = await osApi.asyncServerForUri(FOLDER.uri);
  while (conn?.active !== expectActive && Date.now() < deadline) {
    await sleep(500);
    conn = await osApi.asyncServerForUri(FOLDER.uri);
  }
  assert.strictEqual(conn.active, expectActive, `expected active=${expectActive}`);
  assert.strictEqual(conn.host, "localhost");
  assert.strictEqual(conn.port, server.port);
  assert.strictEqual(conn.namespace, "USER");
  assert.strictEqual(conn.username || "", server.username || "");
  // A password stored in plaintext in settings must reach API consumers such as Language Server
  assert.strictEqual(conn.password, server.password);
}

/**
 * Check 2: a saved class reaches the server iff the connection is active. With verifyDelete, an active
 * connection also propagates the local delete back to the server; the flip check omits that, because a
 * folder that was inactive at activation time does not wire up delete-sync until the window reloads.
 */
async function roundTrip(expectActive: boolean, verifyDelete = true): Promise<void> {
  const className = `CiTest.${CASE.replace(/[^A-Za-z0-9]/g, "")}${counter++}`;
  const doc = `${className}.cls`;
  const file = isServerSide
    ? vscode.Uri.joinPath(FOLDER.uri, `${className.replace(/\./g, "/")}.cls`)
    : // Written straight into the pre-existing src/ folder: creating a directory tree and a file in it at
      // once can lose the file's watcher event on Linux, which is not what this is testing
      vscode.Uri.joinPath(FOLDER.uri, "src", `${className}.cls`);
  const source = `Class ${className}\n{\n\nClassMethod Hello() As %String\n{\n\tQuit "hello"\n}\n\n}\n`;
  created.add(doc);
  await vscode.workspace.fs.writeFile(file, Buffer.from(source));
  if (expectActive) {
    const onServer = await waitFor(`${doc} on the server`, () => restDoc("GET", doc));
    assert.match(onServer, new RegExp(`^Class ${className}`));
    await vscode.workspace.fs.delete(file);
    if (verifyDelete) {
      await waitFor(`${doc} deleted from the server`, async () => !(await restDoc("GET", doc)));
      created.delete(doc);
    }
  } else {
    // Give any erroneous sync time to happen before asserting it did not
    await sleep(5000);
    assert.strictEqual(await restDoc("GET", doc), undefined, "inactive connection must not reach the server");
    await vscode.workspace.fs.delete(file);
    created.delete(doc);
  }
}

/** Rewrite objectscript.conn.active in the generated (gitignored) workspace file */
async function applyActive(value: boolean): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("objectscript");
  await cfg.update("conn", { ...(cfg.get("conn") as object), active: value }, vscode.ConfigurationTarget.Workspace);
}

/** Check 5: Server Manager resolves the spec as configured, without prompting */
async function checkSpec(): Promise<void> {
  const spec = await smApi.getServerSpec(specName);
  assert.ok(spec?.auth, `no spec for '${specName}'`);
  assert.strictEqual(spec.webServer.scheme, "http");
  assert.strictEqual(spec.webServer.host, "localhost");
  assert.strictEqual(spec.webServer.port, server.port);
  assert.strictEqual(spec.webServer.pathPrefix, "");
  assert.strictEqual(spec.username || "", server.username || "");
  assert.strictEqual(spec.password, server.password);
  assert.strictEqual(spec.auth.resolved(), server.password !== undefined);
}

suite(CASE, () => {
  suiteSetup(async () => {
    // The released Server Manager gets installed alongside; check 5 resolves specs through its API
    smApi = await vscode.extensions.getExtension(SERVER_MANAGER_ID)?.activate();
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not installed`);
    // The build under test must be the one that ends up running, not a Marketplace copy
    assert.strictEqual(extension.extensionPath, path.resolve(__dirname, "../../.."));
    // Hangs here (and fails on the mocha timeout) if activation blocks on a credential prompt
    osApi = await extension.activate();
  });

  suiteTeardown(async () => {
    for (const doc of created) await restDoc("DELETE", doc).catch(() => undefined);
  });

  // Checks 1 and 2
  test("resolves and round-trips as configured", async () => {
    await checkResolves(configuredActive);
    await roundTrip(configuredActive);
  });

  // Check 4
  if (isServerSide) {
    test("lists the namespace through the folder", async () => {
      const entries = await vscode.workspace.fs.readDirectory(FOLDER.uri);
      assert.ok(entries.length > 0, "namespace listing is empty");
    });
  }

  // Check 5
  test("Server Manager resolves the spec", () => checkSpec());

  // Checks 1 and 2 again, after idling past the session timeout so a cached cookie must be renewed.
  // Skips the delete round-trip: this proves the save reconnects, and older releases don't re-wire
  // delete-sync after a session lapses (fixed on the dev build, so re-verifying it here would be flaky).
  test("still resolves and round-trips after the session times out", async () => {
    await sleep(SESSION_TIMEOUT_MS + 3000);
    await checkResolves(configuredActive);
    await roundTrip(configuredActive, false);
  });

  // Check 3, last, so the connection it establishes can't leak a session into the idle check above
  if (canToggle) {
    test("flipping objectscript.conn.active is honored", async () => {
      try {
        await applyActive(!configuredActive);
        await checkResolves(!configuredActive);
        await roundTrip(!configuredActive, false);
      } finally {
        await applyActive(configuredActive);
        await checkResolves(configuredActive);
      }
    });
  }
});
