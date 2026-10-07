import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";
import { LAUNCHES, workspaceFile } from "./cases";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // Generated so the active-flip check can rewrite the workspace file without dirtying the repo
    const generated = path.resolve(extensionDevelopmentPath, "test-fixtures", ".generated");
    fs.mkdirSync(path.join(generated, "client", "src"), { recursive: true });
    for (const l of LAUNCHES) {
      fs.writeFileSync(path.join(generated, `${l.name}.code-workspace`), JSON.stringify(workspaceFile(l), null, "  "));
    }

    const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    const installExtension = (extId) =>
      cp.spawnSync(cli, [...args, "--install-extension", extId], {
        encoding: "utf-8",
        stdio: "inherit",
      });

    // Install dependent extensions
    installExtension("intersystems-community.servermanager");
    installExtension("intersystems.language-server");

    // Inherited from an extension-spawned terminal; would make the downloaded VS Code run as plain Node
    delete process.env.ELECTRON_RUN_AS_NODE;
    // Docker Desktop's CLI plugins would otherwise make the extension's `podman compose` run Docker Compose
    process.env.PODMAN_COMPOSE_PROVIDER ??= "podman-compose";

    const filter = process.argv[2];
    const failed: string[] = [];
    // Each case is a collapsed group in the Actions log
    const ci = !!process.env.GITHUB_ACTIONS;
    for (const l of filter ? LAUNCHES.filter((l) => l.name.includes(filter)) : LAUNCHES) {
      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-objectscript-test-"));
      // Copilot Chat otherwise floods the log
      fs.mkdirSync(path.join(userDataDir, "User"));
      fs.writeFileSync(path.join(userDataDir, "User", "settings.json"), '{ "chat.disableAIFeatures": true }');
      const launchArgs = [
        path.join(generated, `${l.name}.code-workspace`),
        "--user-data-dir",
        userDataDir,
        "--disable-workspace-trust",
        "--disable-gpu",
        "--enable-proposed-api",
        "intersystems-community.vscode-objectscript",
      ];
      console.log(ci ? `::group::${l.name}` : `\n===== ${l.name} =====`);
      try {
        await runTests({ vscodeExecutablePath, extensionDevelopmentPath, extensionTestsPath, launchArgs });
      } catch (err) {
        failed.push(l.name);
        for (const log of fs.readdirSync(userDataDir, { recursive: true }) as string[]) {
          if (/intersystems-community\.[^/\\]+[/\\][^/\\]+\.log$/.test(log)) {
            console.error(`\n===== ${log} =====\n${fs.readFileSync(path.join(userDataDir, log), "utf-8")}`);
          }
        }
      } finally {
        if (ci) {
          console.log("::endgroup::");
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
