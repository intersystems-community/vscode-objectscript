import * as vscode from "vscode";
import path = require("path");
import { AtelierAPI } from "../api";
import { config, FILESYSTEM_READONLY_SCHEMA, FILESYSTEM_SCHEMA } from "../extension";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { fileExists, notNull, outputChannel } from "../utils";
import { getFileName } from "./export";
import { importFolder } from "./compile";

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
function getAdapter(adapters: string[], type: AdapaterClassType): Thenable<string | undefined> {
  if (adapters.length) {
    return vscode.window.showQuickPick(adapters, {
      title: `Pick an associated ${type}bound Adapter class`,
      ignoreFocusOut: true,
    });
  } else {
    // Use InputBox since we have no suggestions
    return vscode.window.showInputBox({
      title: `Enter the name of the associated ${type}bound Adapter class`,
      placeHolder: "Package.Subpackage.Class",
      ignoreFocusOut: true,
      validateInput: validateClassName,
    });
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
    if (vscode.workspace.workspaceFolders.length == 0) {
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

    let inboundAdapters: string[] = [];
    let outboundAdapters: string[] = [];
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
          api.getEnsClassList(3).then((data) => data.result.content),
          classesPromise,
        ]);
      } else if (type == NewFileType.BusinessService) {
        // Get a list of the inbound adapter classes for the QuickPick and a list of classes on the server to validate the name
        [inboundAdapters, classes] = await Promise.all([
          api.getEnsClassList(2).then((data) => data.result.content),
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

    // Prompt for the class name
    const cls = await vscode.window.showInputBox({
      title: `Enter a name for the new ${type} class`,
      placeHolder: "Package.Subpackage.Class",
      ignoreFocusOut: true,
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
    });
    if (!cls) {
      return;
    }

    // Prompt for a description
    const desc = await vscode.window.showInputBox({
      title: "Enter an optional description for this class",
      ignoreFocusOut: true,
    });

    // Generate the file's URI
    let clsUri: vscode.Uri;
    if (wsFolder.uri.scheme == FILESYSTEM_SCHEMA) {
      clsUri = DocumentContentProvider.getUri(`${cls}.cls`, undefined, undefined, undefined, wsFolder.uri);
    } else {
      // Use the export settings to determine the URI
      clsUri = getLocalUri(cls, wsFolder);
    }

    // Prompt for type-specific elements, then use them to generate the content
    let clsContent: string;
    if (type == NewFileType.BusinessOperation) {
      // Prompt for the invocation style
      const invocation = await vscode.window.showQuickPick(
        [
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
        {
          title: "Pick the invocation style",
          ignoreFocusOut: true,
        }
      );
      if (!invocation) {
        return;
      }

      // Prompt for an outbound adapter class
      const adapter = await getAdapter(outboundAdapters, AdapaterClassType.Outbound);

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
Parameter INVOCATION = "${invocation.value}";

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
      // Prompt for an inbound adapter class
      const adapter = await getAdapter(inboundAdapters, AdapaterClassType.Inbound);

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
      // Prompt for the implementation style
      const bpl: boolean | undefined = await vscode.window
        .showQuickPick(["Using the Business Process Editor", "Using Custom Code"], {
          title: "This Business Process is implemented:",
          ignoreFocusOut: true,
        })
        .then((value) => (typeof value == "string" ? value.includes("Business") : value));
      if (typeof bpl != "boolean") {
        return;
      }

      // Generate the file's content
      if (bpl) {
        clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.BusinessProcessBPL [ ClassType = persistent, ProcedureBlock ]
{

/// BPL Definition
XData BPL [ XMLNamespace = "http://www.intersystems.com/bpl" ]
{${
          api
            ? `
<!--
You can edit this class in the Business Process Editor by pasting the following URL into your web browser.
You can also edit this XML block directly.
${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
                api.config.pathPrefix
              }/csp/${api.config.ns.toLowerCase()}/EnsPortal.BPLEditor.zen?BP=${cls}.BPL\n-->`
            : ""
        }
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
      // Prompt for the implementation style
      const dtl: boolean | undefined = await vscode.window
        .showQuickPick(["Using the Data Transformation Editor", "Using Custom Code"], {
          title: "This Data Transformation is implemented:",
          ignoreFocusOut: true,
        })
        .then((value) => (typeof value == "string" ? value.includes("Data") : value));
      if (typeof dtl != "boolean") {
        return;
      }

      // Prompt for a source class
      let sourceCls: string;
      if (dtlClassQPItems.length) {
        sourceCls = await vscode.window
          .showQuickPick(dtlClassQPItems, {
            ignoreFocusOut: true,
            title: "Pick a source class",
          })
          .then((qpi) => (qpi ? qpi.label : undefined));
      } else {
        // Use InputBox since we have no suggestions
        sourceCls = await vscode.window.showInputBox({
          title: "Enter the name of a source class",
          placeHolder: "Package.Subpackage.Class",
          ignoreFocusOut: true,
          validateInput: validateClassName,
        });
      }
      if (!sourceCls) {
        return;
      }

      // Prompt for a target class
      let targetCls: string;
      if (dtlClassQPItems.length) {
        targetCls = await vscode.window
          .showQuickPick(dtlClassQPItems, {
            ignoreFocusOut: true,
            title: "Pick a target class",
          })
          .then((qpi) => (qpi ? qpi.label : undefined));
      } else {
        // Use InputBox since we have no suggestions
        targetCls = await vscode.window.showInputBox({
          title: "Enter the name of a target class",
          placeHolder: "Package.Subpackage.Class",
          ignoreFocusOut: true,
          validateInput: validateClassName,
        });
      }
      if (!targetCls) {
        return;
      }

      // Generate the file's content
      if (dtl) {
        clsContent = `
${typeof desc == "string" ? "/// " + desc.replace(/\n/g, "\n/// ") : ""}
Class ${cls} Extends Ens.DataTransformDTL [ DependsOn = ${
          sourceCls == targetCls ? sourceCls : `(${sourceCls}, ${targetCls})`
        } ]
{

Parameter IGNOREMISSINGSOURCE = 1;

Parameter REPORTERRORS = 1;

Parameter TREATEMPTYREPEATINGFIELDASNULL = 0;

XData DTL [ XMLNamespace = "http://www.intersystems.com/dtl" ]
{${
          api
            ? `
<!--
You can edit this class in the Data Transformation Editor by pasting the following URL into your web browser.
You can also edit this XML block directly.
${api.config.https ? "https" : "http"}://${api.config.host}:${api.config.port}${
                api.config.pathPrefix
              }/csp/${api.config.ns.toLowerCase()}/EnsPortal.DTLEditor.zen?DT=${cls}.DTL\n-->`
            : ""
        }
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
      // Prompt for the rule assist class
      let assistCls: string;
      if (Object.keys(ruleAssists).length) {
        assistCls = await vscode.window.showQuickPick(Object.keys(ruleAssists), {
          ignoreFocusOut: true,
          title: "Pick a Rule Assist class",
        });
      } else {
        // Use InputBox since we have no suggestions
        assistCls = await vscode.window.showInputBox({
          title: "Enter the name of a Rule Assist class",
          placeHolder: "Package.Subpackage.Class",
          ignoreFocusOut: true,
          validateInput: validateClassName,
        });
      }
      if (!assistCls) {
        return;
      }

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
