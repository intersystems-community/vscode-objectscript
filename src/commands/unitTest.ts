import * as vscode from "vscode";
import * as Atelier from "../api/atelier";
import { clsLangId, extensionId, filesystemSchemas, lsExtensionId, sendUnitTestTelemetryEvent } from "../extension";
import {
  getFileText,
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
}

/** A cache of all test classes in a test root */
const classesForRoot: WeakMap<vscode.TestItem, Map<string, vscode.TestItem>> = new WeakMap();

/** The separator between the class URI string and method name in the method's `TestItem` id */
const methodIdSeparator = "\\\\\\";

const textDecoder = new TextDecoder();

/** Find the root `TestItem` for `uri` */
function rootItemForItem(testController: vscode.TestController, uri: vscode.Uri): vscode.TestItem | undefined {
  let rootItem: vscode.TestItem;
  for (const [, i] of testController.items) {
    if (uriIsAncestorOf(i.uri, uri)) {
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
    const rootItem = rootItemForItem(testController, parent.uri);
    if (rootItem) {
      // Add this class to our cache
      // Need to do this here because we need the
      // DocumentSymbols to accurately determine the class
      const classes = classesForRoot.get(rootItem);
      classes.set(parentSymbols[0].name, parent);
      classesForRoot.set(rootItem, classes);
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
    if (filesystemSchemas.includes(parent.uri.scheme)) {
      // Query the server to find inherited Test* methods
      const api = new AtelierAPI(parent.uri);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(parent.uri).name;
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
  let roots: string[] = vscode.workspace.getConfiguration("objectscript.unitTest", uri).get("relativeTestRoots");
  roots = roots.map((r) => r.replaceAll("\\", "/")); // VS Code URIs always use / as a separator
  if (roots.length > 1) {
    // Filter out any duplicate roots, or roots that are a subdirectory of another root
    roots = roots.filter((root, idx) => !roots.some((r, i) => i != idx && (root.startsWith(`${r}/`) || root == r)));
  }
  return roots;
}

/** Compute root `TestItem`s for `folder`. Returns `[]` if `folder` can't contain tests. */
function createRootItemsForWorkspaceFolder(
  testController: vscode.TestController,
  folder: vscode.WorkspaceFolder
): vscode.TestItem[] {
  let newItems: vscode.TestItem[] = [];
  const api = new AtelierAPI(folder.uri);
  const { csp } = isfsConfig(folder.uri);
  // Must have an active server connection to a non-%SYS namespace and Atelier API version 8 or above
  const errorMsg =
    !api.active || api.ns == ""
      ? "Server connection is inactive"
      : api.ns == "%SYS"
        ? "Connected to the %SYS namespace"
        : api.config.apiVersion < 8
          ? "Must be connected to InterSystems IRIS version 2023.3 or above"
          : filesystemSchemas.includes(folder.uri.scheme) && csp
            ? "Web application folder"
            : undefined;
  let itemUris: vscode.Uri[];
  if (notIsfs(folder.uri)) {
    const roots = relativeTestRootsForUri(folder.uri);
    const baseUri = folder.uri.with({ path: `${folder.uri.path}${!folder.uri.path.endsWith("/") ? "/" : ""}` });
    itemUris = roots.map((root) => baseUri.with({ path: `${baseUri.path}${root}` }));
  } else {
    itemUris = [folder.uri];
  }
  newItems = itemUris.map((uri) => {
    const newItem = testController.createTestItem(uri.toString(), folder.name, uri);
    if (notIsfs(uri)) {
      // Add the root as the description
      newItem.description = uri.path.slice(folder.uri.path.length + (!folder.uri.path.endsWith("/") ? 1 : 0));
      newItem.sortText = newItem.label + newItem.description;
    }
    if (errorMsg != undefined) {
      // Show the user why we can't run tests from this folder
      newItem.canResolveChildren = false;
      newItem.error = errorMsg;
    } else {
      newItem.canResolveChildren = true;
    }
    return newItem;
  });
  return newItems;
}

/** Get the `TestItem` for class `uri`. If `create` is true, create intermediate `TestItem`s. */
async function getTestItemForClass(
  testController: vscode.TestController,
  uri: vscode.Uri,
  create = false
): Promise<vscode.TestItem | undefined> {
  let item: vscode.TestItem;
  const rootItem = rootItemForItem(testController, uri);
  if (rootItem && !rootItem.error) {
    // Walk the directory path until we reach a dead end or the TestItem for this class
    let docPath = uri.path.slice(rootItem.uri.path.length);
    docPath = docPath.startsWith("/") ? docPath.slice(1) : docPath;
    const docPathParts = docPath.split("/");
    item = rootItem;
    for (const part of docPathParts) {
      const currUri = item.uri.with({ path: `${item.uri.path}${!item.uri.path.endsWith("/") ? "/" : ""}${part}` });
      let currItem = item.children.get(currUri.toString());
      if (!currItem && create) {
        // We're allowed to create non-existent directory TestItems as we walk the path
        await testController.resolveHandler(item);
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
  const { project, system, generated, mapped } = isfsConfig(item.uri);
  let query: string;
  let parameters: string[];
  let folder = !item.uri.path.endsWith("/") ? item.uri.path + "/" : item.uri.path;
  folder = folder.startsWith("/") ? folder.slice(1) : folder;
  if (folder == "/") {
    // Treat this the same as an empty folder
    folder = "";
  }
  folder = folder.replace(/\//g, ".");
  const folderLen = String(folder.length + 1); // Need the + 1 because SUBSTR is 1 indexed
  const api = new AtelierAPI(item.uri);
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
      fileSpecFromURI(item.uri),
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
  const newUri = item.uri.with({
    path: `${item.uri.path}${!item.uri.path.endsWith("/") ? "/" : ""}${child}`,
  });
  if (!item.children.get(newUri.toString())) {
    // Only add the item if it doesn't already exist
    const newItem = testController.createTestItem(newUri.toString(), child, newUri);
    newItem.canResolveChildren = true;
    item.children.add(newItem);
  }
}

/** Determine the class name of `item` in `root` */
function classNameForItem(item: vscode.TestItem, root: vscode.TestItem): string | undefined {
  let cls: string;
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
      testController.resolveHandler(item);
    }
  }
}

/** The `runHandler` function for the `TestRunProfile`s. */
async function runHandler(
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
  testController: vscode.TestController,
  debug = false
): Promise<void> {
  const action = debug ? "debug" : "run";
  let root: vscode.TestItem;
  const asyncRequest: Atelier.AsyncUnitTestRequest = {
    request: "unittest",
    tests: [],
    debug,
  };
  const clsItemsRun: vscode.TestItem[] = [];

  try {
    // Determine the test root for this run
    let roots: vscode.TestItem[];
    if (request.include?.length) {
      roots = [...new Set(request.include.map((i) => rootItemForItem(testController, i.uri)))];
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
            label: i.label,
            detail: displayableUri(i.uri),
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
    sendUnitTestTelemetryEvent(root.uri, debug);

    // Add the initial items to the queue to process
    const queue: vscode.TestItem[] = [];
    if (request.include?.length) {
      request.include.forEach((i) => {
        if (uriIsAncestorOf(root.uri, i.uri)) {
          queue.push(i);
        }
      });
    } else {
      queue.push(root);
    }

    // Get the autoload configuration for the root
    const autoload = vscode.workspace.getConfiguration("objectscript.unitTest.autoload", root.uri);
    const autoloadFolder: string = autoload.get("folder");
    const autoloadXml: boolean = autoload.get("xml");
    const autoloadUdl: boolean = autoload.get("udl");
    const autoloadEnabled: boolean = autoloadFolder != "" && (autoloadXml || autoloadUdl) && notIsfs(root.uri);
    const autoloadProcessed: string[] = [];

    // Process every test that was queued
    // Recurse down to leaves (methods) and build a map of their parents (classes)
    while (queue.length > 0 && !token.isCancellationRequested) {
      const test = queue.pop();

      // Skip tests the user asked to exclude
      if (request.exclude?.length && request.exclude.some((excludedTest) => excludedTest.id === test.id)) {
        continue;
      }

      if (autoloadEnabled) {
        // Process any autoload folders needed by this item
        const basePath = root.uri.path.endsWith("/") ? root.uri.path.slice(0, -1) : root.uri.path;
        const directories = ["", ...test.uri.path.slice(basePath.length + 1).split("/")];
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
                test.uri.with({ path: `${basePath}${testPath}/${autoloadFolder}` }),
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
        await testController.resolveHandler(test);
      }

      if (test.uri.path.toLowerCase().endsWith(".cls")) {
        if (test.id.includes(methodIdSeparator)) {
          // This is a method item
          // Will only reach this code if this item is in request.include

          // Look up the name of this class
          const cls = classNameForItem(test.parent, root);
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
              if (notIsfs(test.parent.uri)) {
                // Add this class to the list to load
                if (asyncRequest.load == undefined) asyncRequest.load = [];
                asyncRequest.load.push({
                  file: test.parent.uri.fsPath,
                  content: textDecoder.decode(await vscode.workspace.fs.readFile(test.parent.uri)).split(/\r?\n/),
                });
              }
              clsItemsRun.push(test.parent);
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
                if (!request.exclude.some((excludedTest) => excludedTest.id === i.id)) {
                  clsObj.methods.push(i.label);
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
            if (notIsfs(test.uri)) {
              // Add this class to the list to load
              if (asyncRequest.load == undefined) asyncRequest.load = [];
              asyncRequest.load.push({
                file: test.uri.fsPath,
                content: textDecoder.decode(await vscode.workspace.fs.readFile(test.uri)).split(/\r?\n/),
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

  // Ignore console output at the user's request
  asyncRequest.console = vscode.workspace.getConfiguration("objectscript.unitTest", root.uri).get("showOutput");

  // Send the queue request
  const api = new AtelierAPI(root.uri);
  const queueResp: Atelier.Response<any> = await api.queueAsync(asyncRequest, true).catch((error) => {
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
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(root.uri);

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
              currentOutputItem = classes.get(consoleLine.trim().split(" ")[0]);
            } else {
              // This is the end of a class
              if (currentOutputItem != undefined && currentOutputItem.id.includes(methodIdSeparator)) {
                currentOutputItem = currentOutputItem.parent;
              }
            }
          } else if (indent == 6 && consoleLine.endsWith("...")) {
            // This is the beginning of a method
            if (currentOutputItem != undefined) {
              if (currentOutputItem.id.includes(methodIdSeparator)) {
                currentOutputItem = currentOutputItem.parent.children.get(
                  `${currentOutputItem.parent.id}${methodIdSeparator}${consoleLine.trim().slice(4).split("(")[0]}`
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
              new vscode.Location(currentOutputItem.uri, currentOutputItem.range),
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
          const clsItem = classes.get(testResult.class);
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
                            let locationUri: vscode.Uri;
                            if (classes.has(failure.location.document.slice(0, -4))) {
                              // This is one of the known test classes
                              locationUri = classes.get(failure.location.document.slice(0, -4)).uri;
                            } else {
                              // This is some other class. There's a chance that
                              // the class won't exist after the tests are run
                              // but we still want to provide the location
                              // because it will often be useful to the user.
                              locationUri = DocumentContentProvider.getUri(
                                failure.location.document,
                                workspaceFolder.name,
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
                                    failure.location.label,
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
                              workspaceFolder.name,
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
        const rootWsFolderIdx = vscode.workspace.getWorkspaceFolder(root.uri)?.index;
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
            await vscode.window.showTextDocument(classesForRoot.get(root).get(asyncRequest.tests[0].class)?.uri);
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
    "@ext:intersystems-community.vscode-objectscript unitTest"
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
    item.busy = true;
    try {
      if (item.uri.path.toLowerCase().endsWith(".cls")) {
        // Compute items for the Test* methods in this class
        await addTestItemsForClass(testController, item);
      } else {
        if (notIsfs(item.uri)) {
          // Read the local directory for non-autoload subdirectories and classes
          const autoload = vscode.workspace.getConfiguration("objectscript.unitTest.autoload", item.uri);
          const autoloadFolder: string = autoload.get("folder");
          const autoloadEnabled: boolean = autoloadFolder != "" && (autoload.get("xml") || autoload.get("udl"));
          (await vscode.workspace.fs.readDirectory(item.uri)).forEach((element) => {
            if (
              (element[1] == vscode.FileType.Directory &&
                !element[0].startsWith("_") && // %UnitTest.Manager skips subfolders that start with _
                (!autoloadEnabled || (autoloadEnabled && element[0] != autoloadFolder))) ||
              (element[1] == vscode.FileType.File && element[0].toLowerCase().endsWith(".cls"))
            ) {
              // This element is a non-autoload directory or a .cls file
              addChildItem(testController, item, element[0]);
            }
          });
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
    testController.items.forEach((item) => testController.resolveHandler(item));
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
      vscode.extensions.getExtension(extensionId).activate(),
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
            let cls: string;
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
        item.parent.children.delete(uri.toString());
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
          if (uriIsAncestorOf(wf.uri, i.uri)) {
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
        if (
          (notIsfs(item.uri) && e.affectsConfiguration("objectscript.unitTest", item.uri)) ||
          e.affectsConfiguration("objectscript.conn", item.uri) ||
          e.affectsConfiguration("intersystems.servers", item.uri)
        ) {
          replace.push(item);
        }
      });
      // Replace the affected root items
      replace.forEach((item) => {
        classesForRoot.delete(item);
        testController.items.delete(item.id);
        const folder = vscode.workspace.getWorkspaceFolder(item.uri);
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
            testController.resolveHandler(item);
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
