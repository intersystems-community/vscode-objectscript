import * as assert from "assert";
import { before } from "mocha";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { window, extensions } from "vscode";
import { extensionId } from "../../extension";

suite("Extension Test Suite", () => {
  suiteSetup(async function () {
    // make sure extension is activated
    const serverManager = extensions.getExtension("intersystems-community.servermanager");
    await serverManager?.activate();
    const ext = extensions.getExtension(extensionId);
    await ext?.activate();
  });

  before(() => {
    window.showInformationMessage("Start all tests.");
  });

  test("Sample test", () => {
    assert.ok("All good");
  });
});
