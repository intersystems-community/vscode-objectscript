import * as cp from "child_process";
import * as path from "path";

import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from "vscode-test";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    // The path to the workspace file
    const workspace = path.resolve("test-fixtures", "test.code-workspace");

    const vscodeExecutablePath = await downloadAndUnzipVSCode("stable");
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath);

    const installExtension = (extId) =>
      cp.spawnSync(cliPath, ["--install-extension", extId], {
        encoding: "utf-8",
        stdio: "inherit",
      });

    // Install dependent extensions
    installExtension("intersystems-community.servermanager");
    installExtension("intersystems.language-server");

    const launchArgs = ["-n", workspace, "--enable-proposed-api", "intersystems-community.vscode-objectscript"];

    // Download VS Code, unzip it and run the integration test
    await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
