import * as cp from "child_process";
import * as path from "path";

import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runTests } from "@vscode/test-electron";

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

    const vscodeExecutablePath =
      process.env.VSCODE_EXECUTABLE_PATH ?? (await downloadAndUnzipVSCode({ version: "stable", timeout: 60_000 }));
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    const installExtension = (extId) =>
      cp.spawnSync(cli, [...args, "--install-extension", extId], {
        encoding: "utf-8",
        stdio: "inherit",
      });

    // Install dependent extensions
    installExtension("consistem-sistemas.consistem-servermanager");
    installExtension("consistem-sistemas.consistem-language-server");

    const launchArgs = [workspace, "--enable-proposed-api", "consistem-sistemas.consistem-vscode-objectscript"];

    // Download VS Code, unzip it and run the integration test
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs,
      extensionTestsEnv: { ELECTRON_RUN_AS_NODE: undefined },
    });
  } catch (err) {
    console.error("Failed to run tests", err);
    process.exit(1);
  }
}

main();
