import * as assert from "assert";
import { before } from "mocha";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import { window, extensions } from "vscode";
import { extensionId } from "../../extension";

suite("Extension Test Suite", () => {
  suiteSetup(async function () {
    // make sure git is activated
    const ext = extensions.getExtension(extensionId);
    await ext?.activate();
  });

  before(() => {
    window.showInformationMessage("Start all tests.");
  });

  test("Sample test", () => {
    assert.equal([1, 2, 3].indexOf(5), -1);
    assert.equal([1, 2, 3].indexOf(0), -1);
  });
});
