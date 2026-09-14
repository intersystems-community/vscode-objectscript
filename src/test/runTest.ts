import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";
import { allLaunches, workspaceFile } from "./cases";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // One workspace file per launch, generated so the active-flip check can rewrite it without
    // dirtying the repo. Folders point at the committed test-fixtures/client and .../iris.
    const generated = path.resolve(extensionDevelopmentPath, "test-fixtures", ".generated");
    fs.rmSync(generated, { recursive: true, force: true });
    fs.mkdirSync(generated, { recursive: true });
    const launches = allLaunches();
    for (const l of launches) {
      fs.writeFileSync(path.join(generated, `${l.name}.code-workspace`), JSON.stringify(workspaceFile(l), null, "  "));
    }

    const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    // Server Manager resolves the intersystems.servers entries and getServerSpec used by the fixtures
    cp.spawnSync(cli, [...args, "--install-extension", "intersystems-community.servermanager"], {
      encoding: "utf-8",
      stdio: "inherit",
    });

    // Inherited from a VS Code extension host (e.g. a terminal spawned by an extension); would make
    // the downloaded VS Code run as plain Node and try to execute the workspace file as a script
    delete process.env.ELECTRON_RUN_AS_NODE;

    // Optional substring to run a subset of cases locally, e.g. `npm test -- os-host`
    const filter = process.argv[2];
    const failed: string[] = [];
    for (const l of filter ? launches.filter((l) => l.name.includes(filter)) : launches) {
      // A fresh user-data-dir so cached connection state from a previous run can't mask activation bugs
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-objectscript-test-"));
      const workspace = path.join(generated, `${l.name}.code-workspace`);
      const launchArgs = [
        workspace,
        "--user-data-dir",
        userDataDir,
        "--disable-workspace-trust",
        "--enable-proposed-api",
        "intersystems-community.vscode-objectscript",
      ];
      console.log(`\n===== ${l.name} =====`);
      try {
        await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, launchArgs });
      } catch (err) {
        failed.push(l.name);
        // The two extensions' log channels are the best record of what they sent to the servers
        for (const log of fs.readdirSync(userDataDir, { recursive: true }) as string[]) {
          if (/intersystems-community\.[^/\\]+[/\\][^/\\]+\.log$/.test(log)) {
            console.error(`\n===== ${log} =====\n${fs.readFileSync(path.join(userDataDir, log), "utf-8")}`);
          }
        }
      }
    }
    if (failed.length) {
      throw new Error(`Failed cases: ${failed.join(", ")}`);
    }
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
