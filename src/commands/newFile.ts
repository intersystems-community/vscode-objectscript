import * as vscode from "vscode";
import { AtelierAPI } from "../api/index";
import { DocumentContentProvider } from "../providers/DocumentContentProvider";
import { NodeBase } from "./../explorer/models/nodeBase";
import { RootNode } from "./../explorer/models/rootNode";
import { PackageNode } from "../explorer/models/packageNode";
import { ClassNode } from "../explorer/models/classesNode";
import { RoutineNode } from "../explorer/models/routineNode";
import { fireOtherStudioAction, OtherStudioAction } from "./studio";

export async function createNewFile(node: NodeBase) {
  try {
    const name = await vscode.window.showInputBox(getInputBoxOptions(node));
    // Check if user cancelled
    if (!name) {
      return;
    }

    const api = new AtelierAPI();
    const response = await api.putDoc(name, { enc: false, content: getContent(name) }, true);

    vscode.commands.executeCommand("vscode-objectscript.explorer.refresh");
    const uri = DocumentContentProvider.getUri(response.result.name, node.workspaceFolder, node.namespace);
    if (response.result.ext && response.result.ext[0] && response.result.ext[1]) {
      // ext is an array containing the responses for actions 1 and 7
      fireOtherStudioAction(OtherStudioAction.CreatedNewDocument, uri, response.result.ext[0]);
      fireOtherStudioAction(OtherStudioAction.FirstTimeDocumentSave, uri, response.result.ext[1]);
    }
    vscode.window.showTextDocument(uri, { preview: false });
  } catch (error) {
    vscode.window.showErrorMessage(error.message);
  }
}

function getInputBoxOptions(node: NodeBase): vscode.InputBoxOptions {
  let fileExtension: string;
  let filePath: string;

  if (node instanceof PackageNode || node instanceof RootNode) {
    if (node.category === "CSP") {
      filePath = node.fullName ? node.fullName + "/" : "";
    } else {
      switch (node.category) {
        case "RTN":
          fileExtension = "mac";
          break;
        case "OTH":
          fileExtension = "";
          break;
        default:
          fileExtension = node.category.toLowerCase();
      }
      filePath = node instanceof PackageNode ? node.fullName + "." : "";
    }
  } else if (node instanceof ClassNode || node instanceof RoutineNode) {
    const clickedFileExtension = node.fullName.match(/.*\.(.*)/)[1];
    // CSP files
    if (node.fullName.includes("/")) {
      filePath = node.fullName.match(/(.*\/)/)[1];
    }
    // Classes and Routines
    else if (clickedFileExtension.match(/(mac|inc|cls)/i)) {
      const match = node.fullName.match(/(.*\.).*\./);
      filePath = match ? match[1] : "";
      fileExtension = clickedFileExtension;
    }
    // Other
    else {
      filePath = "";
    }
  }

  let prompt: string;
  let sampleName: string;
  switch (fileExtension) {
    case "cls":
      prompt = "Create a class:";
      sampleName = "ClassName";
      break;
    case "mac":
    case "inc":
      prompt = "Create a routine:";
      sampleName = "RoutineName";
      break;
    default:
      prompt = "Create a file:";
      sampleName = "FileName";
  }

  return {
    prompt: prompt,
    value: filePath + sampleName + (fileExtension ? "." + fileExtension : ""),
    valueSelection: [filePath.length, filePath.length + sampleName.length],
  };
}

function getContent(fileName: string): string[] {
  const [name, fileExtension] = fileName.match(/(.*)\.(.*)/).slice(1);
  let contentArray: string[];
  switch (fileExtension.toUpperCase()) {
    case "CLS":
      contentArray = ["Class " + name, "{", "", "}"];
      break;
    case "MAC":
      contentArray = ["ROUTINE " + name, ""];
      break;
    case "INC":
      contentArray = ["ROUTINE " + name + " [Type=INC]", ""];
      break;
    case "CSP":
      contentArray = [
        "<html>",
        "<head>",
        "",
        "<!-- Put your page Title here -->",
        "<title>	Cache Server Page </title>",
        "",
        "</head>",
        "",
        "<body>",
        "",
        "\t<!-- Put your page code here -->",
        "\tMy page body",
        "</body>",
        "</html>",
      ];
      break;
    default:
      contentArray = [""];
  }
  return contentArray;
}
