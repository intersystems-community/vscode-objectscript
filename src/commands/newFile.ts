import * as vscode from "vscode";
import path = require("path");
import { AtelierAPI } from "../api";
import { config, FILESYSTEM_READONLY_SCHEMA, FILESYSTEM_SCHEMA } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { fileExists, notNull, outputChannel } from "../utils";
import { getFileName } from "./export";
import { importFolder } from "./compile";

interface InputStepItem extends vscode.QuickPickItem {
  value?: string;
}

interface InputBoxStepOptions {
  type: "inputBox";
  title: string;
  placeholder?: string;
  validateInput?(value: string): string | undefined | Promise<string | undefined>;
}

interface QuickPickStepOptions {
  type: "quickPick";
  title: string;
  items: InputStepItem[];
}

type InputStepOptions = InputBoxStepOptions | QuickPickStepOptions;

/**
 * Get input from the user using multiple steps.
 */
async function multiStepInput(steps: InputStepOptions[]): Promise<string[] | undefined> {
  if (!steps.length) {
    return undefined;
  }

  const results: string[] = [];
  let step = 0;
  let escape = false;
  while (step < steps.length) {
    // Prompt for the input
    const stepOptions = steps[step];
    if (stepOptions.type == "inputBox") {
      // Show the InputBox
      escape = await new Promise<boolean>((resolve) => {
        let escapeLoop = true;
        const inputBox = vscode.window.createInputBox();
        inputBox.ignoreFocusOut = true;
        inputBox.step = step + 1;
        inputBox.totalSteps = steps.length;
        inputBox.buttons = step > 0 ? [vscode.QuickInputButtons.Back] : [];
        inputBox.placeholder = stepOptions.placeholder;
        inputBox.title = stepOptions.title;
        if (results[step] != undefined) {
          // Restore the past input
          inputBox.value = results[step];
        }
        inputBox.onDidTriggerButton(() => {
          // Save the state in the result array
          results[step] = inputBox.value;
          // Go back a step
          step--;
          // Don't exit parent loop
          escapeLoop = false;
          inputBox.hide();
        });
        inputBox.onDidAccept(() => {
          if (typeof inputBox.validationMessage != "string") {
            // Save the state in the result array
            results[step] = inputBox.value;
            // Go forward a step
            step++;
            // Don't exit parent loop
            escapeLoop = false;
            inputBox.hide();
          }
        });
        inputBox.onDidHide(() => {
          resolve(escapeLoop);
          inputBox.dispose();
        });
        inputBox.onDidChangeValue((value) => {
          if (typeof stepOptions.validateInput == "function") {
            inputBox.enabled = false;
            inputBox.busy = true;
            const validationResult = stepOptions.validateInput(value);
            if (typeof validationResult == "object") {
              validationResult.then((msg) => {
                inputBox.validationMessage = msg;
                inputBox.enabled = true;
                inputBox.busy = false;
              });
            } else {
              inputBox.validationMessage = validationResult;
              inputBox.enabled = true;
              inputBox.busy = false;
            }
          }
        });
        inputBox.show();
      });
    } else {
      // Show the QuickPick
      escape = await new Promise<boolean>((resolve) => {
        let escapeLoop = true;
        const quickPick = vscode.window.createQuickPick<InputStepItem>();
        quickPick.ignoreFocusOut = true;
        quickPick.step = step + 1;
        quickPick.totalSteps = steps.length;
        quickPick.buttons = step > 0 ? [vscode.QuickInputButtons.Back] : [];
        quickPick.items = stepOptions.items;
        quickPick.title = stepOptions.title;
        if (results[step] != undefined) {
          // Restore the past input
          const sel = quickPick.items.find((i) => i.value == results[step] || i.label == results[step]);
          if (sel) {
            quickPick.selectedItems = [];
          }
        }
        quickPick.onDidTriggerButton(() => {
          // Save the state in the result array
          if (quickPick.selectedItems.length) {
            results[step] = quickPick.selectedItems[0].value ?? quickPick.selectedItems[0].label;
          }
          // Go back a step
          step--;
          // Don't exit parent loop
          escapeLoop = false;
          quickPick.hide();
        });
        quickPick.onDidAccept(() => {
          // Save the state in the result array
          results[step] = quickPick.selectedItems[0].value ?? quickPick.selectedItems[0].label;
          // Go forward a step
          step++;
          // Don't exit parent loop
          escapeLoop = false;
          quickPick.hide();
        });
        quickPick.onDidHide(() => {
          resolve(escapeLoop);
          quickPick.dispose();
        });
        quickPick.show();
      });
    }
    if (escape) {
      break;
    }
  }

  return escape ? undefined : results;
}

/** Use the export settings to determine the local URI */
function getLocalUri(cls: string, wsFolder: vscode.WorkspaceFolder): vscode.Uri {
  const { atelier, folder, addCategory, map } = config("export", wsFolder.name);
  const root = [wsFolder.uri.fsPath, typeof folder === "string" && folder.length ? folder : null]
    .filter(notNull)
    .join(path.sep);
  const fileName = getFileName(root, `${cls}.cls`, atelier, addCategory, map);
  let clsUri = vscode.Uri.file(fileName);
  if (wsFolder.uri.scheme != "file") {
    clsUri = wsFolder.uri.with({ path: clsUri.path });
  }
  return clsUri;
}

/**
 * Check if `cls` is a valid class name.
 * Returns `undefined` if yes, and the reason if no.
 */
function validateClassName(cls: string): string | undefined {
  if (cls == "") {
    return "Class name cannot be empty";
  }
  if (!cls.includes(".")) {
    return "Class name must include a package";
  }
  if (cls.toLowerCase().endsWith(".cls")) {
    return "Class name must not include the file extension";
  }
  if (
    cls
      .split(".")
      .find((part, idx) => (idx == 0 ? !/^%?[\p{L}\p{N}]+$/u.test(part) : !/^\p{L}[\p{L}\p{N}]*$/u.test(part)))
  ) {
    return "Class name is invalid";
  }
}

/** Types of adapter classes */
enum AdapaterClassType {
  Inbound = "In",
  Outbound = "Out",
}

/** Prompt the user to select an adapter class. */
function getAdapterPrompt(adapters: InputStepItem[], type: AdapaterClassType): InputStepOptions {
  if (adapters.length) {
    return {
      type: "quickPick",
      title: `Pick an associated ${type}bound Adapter class`,
      items: adapters,
    };
  } else {
    // Use InputBox since we have no suggestions
    return {
      type: "inputBox",
      title: `Enter the name of the associated ${type}bound Adapter class`,
      placeholder: "Package.Subpackage.Class",
      validateInput: validateClassName,
    };
  }
}

/** The types of classes we can create */
export enum NewFileType {
  BusinessOperation = "Business Operation",
  BusinessService = "Business Service",
  BPL = "Business Process",
  DTL = "Data Transformation",
  Rule = "Business Rule",
}

interface RuleAssistClasses {
  [className: string]: {
    hasProduction: boolean;
  };
}

export async function newFile(type: NewFileType): Promise<void> {
  try {
    // Select a workspace folder
    let wsFolder: vscode.WorkspaceFolder;
    if (vscode.workspace.workspaceFolders == undefined || vscode.workspace.workspaceFolders.length == 0) {
      vscode.window.showErrorMessage("No workspace folders are open.", "Dismiss");
      return;
    } else if (vscode.workspace.workspaceFolders.length == 1) {
      wsFolder = vscode.workspace.workspaceFolders[0];
    } else {
      wsFolder = await vscode.window.showWorkspaceFolderPick({
        placeHolder: "Pick the workspace folder to create the file in.",
      });
    }
    if (!wsFolder) {
      return;
    }
    if (wsFolder.uri.scheme == FILESYSTEM_READONLY_SCHEMA) {
      vscode.window.showErrorMessage(`Workspace folder '${wsFolder.name}' is read-only.`, "Dismiss");
      return;
    }

    // Check if workspace folder has an active connection
    let api = new AtelierAPI(wsFolder.uri);
    if (!api.active) {
      if (wsFolder.uri.scheme == FILESYSTEM_SCHEMA) {
        vscode.window.showErrorMessage(
          `Workspace folder '${wsFolder.name}' does not have an active server connection.`,
          "Dismiss"
        );
        return;
      }
      api = undefined;
    }

    // Check if we're connected to an Interoperability namespace
    const ensemble: boolean = api
      ? await api.getNamespace().then((data) => data.result.content.features[0].enabled)
      : true;
    if (!ensemble) {
      vscode.window.showErrorMessage(
        `Workspace folder '${wsFolder.name}' is not connected to an Interoperability namespace.`,
        "Dismiss"
      );
      return;
    }

    const inputSteps: InputStepOptions[] = [];
    let inboundAdapters: InputStepItem[] = [];
    let outboundAdapters: InputStepItem[] = [];
    let classes: string[] = [];
    let ruleAssists: RuleAssistClasses = {};
    let dtlClassQPItems: vscode.QuickPickItem[] = [];
    if (api) {
      const classesPromise: Promise<string[]> = api
        .actionQuery("SELECT Name FROM %Dictionary.ClassDefinition", [])
        .then((data) => data.result.content.map((obj: { Name: string }) => obj.Name.toLowerCase()));
      if (type == NewFileType.BusinessOperation) {
        // Get a list of the outbound adapter classes for the QuickPick and a list of classes on the server to validate the name
        [outboundAdapters, classes] = await Promise.all([
          api.getEnsClassList(3).then((data) =>
            data.result.content.map((e: string) => {
              return { label: e };
            })
          ),
          classesPromise,
        ]);
      } else if (type == NewFileType.BusinessService) {
        // Get a list of the inbound adapter classes for the QuickPick and a list of classes on the server to validate the name
        [inboundAdapters, classes] = await Promise.all([
          api.getEnsClassList(2).then((data) =>
            data.result.content.map((e: string) => {
              return { label: e };
            })
          ),
          classesPromise,
        ]);
      } else if (type == NewFileType.Rule) {
        // Get a list of the rule assist classes for the QuickPick and a list of classes on the server to validate the name
        [ruleAssists, classes] = await Promise.all([
          api
            .actionQuery(
              "SELECT so.Name AS Class, me.Name AS Method " +
                "FROM %Dictionary.MethodDefinition AS me " +
                "JOIN %Dictionary.ClassDefinition_SubclassOf('Ens.Rule.Assist') AS so " +
                "ON so.Name = me.Parent " +
                "WHERE me.Name IN ('GetDescription', 'GetIsRoutingRule', 'IsHidden')",
              []
            )
            .then((data) => {
              const newRuleAssists: RuleAssistClasses = {};
              data.result.content.forEach((obj: { Class: string; Method: string }) => {
                if (!(obj.Class in newRuleAssists)) {
                  newRuleAssists[obj.Class] = {
                    hasProduction: false,
                  };
                }
                if (obj.Method == "GetIsRoutingRule") {
                  newRuleAssists[obj.Class].hasProduction = true;
                } else if (obj.Method == "IsHidden") {
                  delete newRuleAssists[obj.Class];
                }
              });
              return newRuleAssists;
            }),
          classesPromise,
        ]);
      } else if (type == NewFileType.DTL) {
        // Get a list of classes on the server to validate the name and build the source/target class QuickPickItem list
        [dtlClassQPItems, classes] = await Promise.all([
          api
            .actionQuery(
              "SELECT Name, 'm' AS Type FROM EnsPortal.Utils_EnumerateMessageClasses('','messages') " +
                "UNION " +
                "SELECT Name, 'd' AS Type FROM EnsPortal.Utils_EnumerateMessageClasses('','classvdoc')",
              []
            )
            .then((data) => {
              const newDtlClassQPItems: vscode.QuickPickItem[] = [];
              data.result.content.forEach((obj: { Name: string; Type: "d" | "m" }, idx: number) => {
                if (idx == 0) {
                  newDtlClassQPItems.push(
                    {
                      label: "Message",
                      kind: vscode.QuickPickItemKind.Separator,
                    },
                    {
                      label: obj.Name,
                      kind: vscode.QuickPickItemKind.Default,
                    }
                  );
                } else {
                  if (obj.Type == "d" && data.result.content[idx - 1].Type == "m") {
                    newDtlClassQPItems.push({
                      label: "Virtual Document",
                      kind: vscode.QuickPickItemKind.Separator,
                    });
                  }
                  newDtlClassQPItems.push({
                    label: obj.Name,
                    kind: vscode.QuickPickItemKind.Default,
                  });
                }
              });
              return newDtlClassQPItems;
            }),
          classesPromise,
        ]);
      } else {
        // Get a list of classes on the server to validate the name
        classes = await classesPromise;
      }
    }

    // Create the class name and description prompts
    inputSteps.push(
      {
        type: "inputBox",
        title: `Enter a name for the new ${type} class`,
        placeholder: "Package.Subpackage.Class",
        validateInput: (value: string) => {
          const valid = validateClassName(value);
          if (typeof valid == "string") {
            return valid;
          }
          if (classes.length && classes.includes(value.toLowerCase())) {
            return "A class with this name already exists on the server";
          }
          if (wsFolder.uri.scheme != FILESYSTEM_SCHEMA) {
            return fileExists(getLocalUri(value, wsFolder)).then((exists) =>
              exists ? `A class with this name already exists in workspace folder '${wsFolder.name}'` : undefined
            );
          }
        },
      },
      {
        type: "inputBox",
        title: "Enter an optional description for this class",
      }
    );

    // Create the type-specific elements prompts, then use them to generate the content
    let clsContent: string;
    let cls: string;
    if (type == NewFileType.BusinessOperation) {
      // Create the prompts for the invocation style and adapter class
      inputSteps.push(
        {
          type: "quickPick",
          title: "Pick the invocation style",
          items: [
            {
              label: "In Process",
              value: "InProc",
              detail: "Messages are formulated, sent, and delivered in the same job in which they were created.",
            },
            {
              label: "Queued",
              value: "Queue",
              detail:
                "Messages are created within one background job and placed on a queue, then are processed by a different background job.",
            },
          ],
        },
        getAdapterPrompt(outboundAdapters, AdapaterClassType.Outbound)
      );

      // Prompt the user
      const results = await multiStepInput(inputSteps);
      if (!results) {
        return;
      }
      cls = results[0];
      const [, desc, invocation, adapter] = results;

      // Generate the file's content
      clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.BusinessOperation
{
${
  adapter
    ? `
Parameter ADAPTER = "${adapter}";

Property Adapter As ${adapter};
`
    : "\n"
}
Parameter INVOCATION = "${invocation}";

/// <b>NOTE:</b> This is an example operation method.
/// You should replace it and its entry in the MessageMap with your custom operation methods.
/// See <a href="https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=EGDV_busop#EGDV_busop_message_handlers">the documentation</a>
/// for tips on how to implement operation methods.
Method SampleCall(pRequest As Ens.Request, Output pResponse As Ens.Response) As %Status
{
  Quit $$$ERROR($$$NotImplemented)
}

XData MessageMap
{
<MapItems>
  <MapItem MessageType="Ens.Request">
    <Method>SampleCall</Method>
  </MapItem>
</MapItems>
}

}
`;
    } else if (type == NewFileType.BusinessService) {
      // Create the prompt for an inbound adapter class
      inputSteps.push(getAdapterPrompt(inboundAdapters, AdapaterClassType.Inbound));

      // Prompt the user
      const results = await multiStepInput(inputSteps);
      if (!results) {
        return;
      }
      cls = results[0];
      const [, desc, adapter] = results;

      // Generate the file's content
      clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.BusinessService
{
${
  adapter
    ? `
Parameter ADAPTER = "${adapter}";
`
    : "\n"
}
/// See <a href="https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=EGDV_busservice#EGDV_busservice_onprocessinput">the documentation</a>
/// for tips on how to implement this method.
Method OnProcessInput(pInput As %RegisteredObject, pOutput As %RegisteredObject) As %Status
{
  Quit $$$ERROR($$$NotImplemented)
}

}
`;
    } else if (type == NewFileType.BPL) {
      // Create the prompt for the implementation style
      inputSteps.push({
        type: "quickPick",
        title: "This Business Process is implemented:",
        items: [{ label: "Using the Business Process Editor" }, { label: "Using Custom Code" }],
      });

      // Prompt the user
      const results = await multiStepInput(inputSteps);
      if (!results) {
        return;
      }
      cls = results[0];
      const [, desc, impl] = results;

      // Generate the file's content
      if (impl.includes("Business")) {
        clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.BusinessProcessBPL [ ClassType = persistent, ProcedureBlock ]
{
${
  api
    ? `
/*
You can edit this class in the Business Process Editor by pasting the following URL into your web browser.
You can also edit this XML block directly.
${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
        api.config.pathPrefix
      }/csp/${api.config.ns.toLowerCase()}/EnsPortal.BPLEditor.zen?BP=${cls}.BPL\n*/\n`
    : ""
}
/// BPL Definition
XData BPL [ XMLNamespace = "http://www.intersystems.com/bpl" ]
{
<process language='objectscript' request='Ens.Request' response='Ens.Response' height='2000' width='2000' >
<sequence xend='300' yend='450' >
</sequence>
</process>
}

Storage Default
{
<Type>%Storage.Persistent</Type>
}

}
`;
      } else {
        clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.BusinessProcess [ ClassType = persistent ]
{

/// See <a href="https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=EGDV_busproc#EGDV_busproc_onrequest">the documentation</a>
/// for tips on how to implement this method.
Method OnRequest(pRequest As Ens.Request, Output pResponse As Ens.Response) As %Status
{
  Quit $$$ERROR($$$NotImplemented)
}

}
`;
      }
    } else if (type == NewFileType.DTL) {
      // Create the prompts for the implementation style, source class and target class
      inputSteps.push({
        type: "quickPick",
        title: "This Data Transformation is implemented:",
        items: [{ label: "Using the Data Transformation Editor" }, { label: "Using Custom Code" }],
      });
      if (dtlClassQPItems.length) {
        inputSteps.push(
          {
            type: "quickPick",
            title: "Pick a source class",
            items: dtlClassQPItems,
          },
          {
            type: "quickPick",
            title: "Pick a target class",
            items: dtlClassQPItems,
          }
        );
      } else {
        // Use InputBox since we have no suggestions
        inputSteps.push(
          {
            type: "inputBox",
            title: "Enter the name of a source class",
            placeholder: "Package.Subpackage.Class",
            validateInput: validateClassName,
          },
          {
            type: "inputBox",
            title: "Enter the name of a target class",
            placeholder: "Package.Subpackage.Class",
            validateInput: validateClassName,
          }
        );
      }

      // Prompt the user
      const results = await multiStepInput(inputSteps);
      if (!results) {
        return;
      }
      cls = results[0];
      const [, desc, impl, sourceCls, targetCls] = results;

      // Generate the file's content
      if (impl.includes("Data")) {
        clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.DataTransformDTL [ DependsOn = ${
          sourceCls == targetCls ? sourceCls : `(${sourceCls}, ${targetCls})`
        } ]
{
${
  api
    ? `
/*
You can edit this class in the Data Transformation Editor by pasting the following URL into your web browser.
You can also edit this XML block directly.
${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
        api.config.pathPrefix
      }/csp/${api.config.ns.toLowerCase()}/EnsPortal.DTLEditor.zen?DT=${cls}.DTL\n*/\n`
    : ""
}
Parameter IGNOREMISSINGSOURCE = 1;

Parameter REPORTERRORS = 1;

Parameter TREATEMPTYREPEATINGFIELDASNULL = 0;

XData DTL [ XMLNamespace = "http://www.intersystems.com/dtl" ]
{
<transform sourceClass='${sourceCls}' targetClass='${targetCls}' create='new' language='objectscript' >
</transform>
}

}
`;
      } else {
        clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.DataTransform
{

/// See <a href="https://docs.intersystems.com/irislatest/csp/docbook/DocBook.UI.Page.cls?KEY=EGDV_xform#EGDV_xform_custom">the documentation</a>
/// for tips on how to implement this method.
ClassMethod Transform(source As ${sourceCls}, ByRef target As ${targetCls}) As %Status
{
  Quit $$$ERROR($$$NotImplemented)
}

}
`;
      }
    } else if (type == NewFileType.Rule) {
      // Create the prompt for the rule assist class
      if (Object.keys(ruleAssists).length) {
        inputSteps.push({
          type: "quickPick",
          title: "Pick a Rule Assist class",
          items: Object.keys(ruleAssists).map((e: string) => {
            return { label: e };
          }),
        });
      } else {
        // Use InputBox since we have no suggestions
        inputSteps.push({
          type: "inputBox",
          placeholder: "Package.Subpackage.Class",
          title: "Enter the name of a Rule Assist class",
          validateInput: validateClassName,
        });
      }

      // Prompt the user
      const results = await multiStepInput(inputSteps);
      if (!results) {
        return;
      }
      cls = results[0];
      const [, desc, assistCls] = results;

      // Determine the context class, if possible
      let contextClass: string;
      switch (assistCls) {
        case "Ens.Alerting.Rule.CreateAlertAssist":
          contextClass = "Ens.Alerting.Context.CreateAlert";
          break;
        case "Ens.Alerting.Rule.OverdueAlertAssist":
          contextClass = "Ens.Alerting.Context.OverdueAlert";
          break;
        case "EnsLib.EDI.MsgRouter.SegmentedRuleAssist":
          contextClass = "EnsLib.EDI.MsgRouter.SegmentedRoutingEngine";
          break;
        case "EnsLib.MsgRouter.RuleAssist":
          contextClass = "EnsLib.MsgRouter.RoutingEngine";
          break;
        case "EnsLib.MsgRouter.VDocRuleAssist":
          contextClass = "EnsLib.MsgRouter.VDocRoutingEngine";
          break;
      }

      // Prompt for the production, if required
      let production: string;
      if (Object.keys(ruleAssists).length && assistCls in ruleAssists && ruleAssists[assistCls].hasProduction) {
        const productions: string[] = await api.getEnsClassList(11).then((data) => data.result.content);
        if (productions.length) {
          production = await vscode.window.showQuickPick(productions, {
            ignoreFocusOut: true,
            title: "Pick a Production",
          });
        }
      }

      // Generate the file's content
      clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.Rule.Definition
{

Parameter RuleAssistClass = "${assistCls}";

XData RuleDefinition [ XMLNamespace = "http://www.intersystems.com/rule" ]
{
<ruleDefinition alias="" context="${contextClass || ""}" production="${production || ""}">
<ruleSet name="" effectiveBegin="" effectiveEnd="">
</ruleSet>
</ruleDefinition>
}

}
`;
    }

    // Generate the file's URI
    let clsUri: vscode.Uri;
    if (wsFolder.uri.scheme == FILESYSTEM_SCHEMA) {
      clsUri = DocumentContentProvider.getUri(`${cls}.cls`, undefined, undefined, undefined, wsFolder.uri);
    } else {
      // Use the export settings to determine the URI
      clsUri = getLocalUri(cls, wsFolder);
    }

    if (clsUri && clsContent) {
      // Write the file content
      await vscode.workspace.fs.writeFile(clsUri, new TextEncoder().encode(clsContent.trimStart()));
      if (clsUri.scheme != FILESYSTEM_SCHEMA && api && config("importOnSave", wsFolder.name)) {
        // Save this local file on the server
        await importFolder(clsUri, true);
      }
      // Show the file
      vscode.window.showTextDocument(clsUri, { preview: false });
    }
  } catch (error) {
    outputChannel.appendLine(
      typeof error == "string" ? error : error instanceof Error ? error.message : JSON.stringify(error)
    );
    vscode.window.showErrorMessage(
      `An error occurred while creating a ${type} class. Check 'ObjectScript' Output channel for details.`,
      "Dismiss"
    );
  }
}
