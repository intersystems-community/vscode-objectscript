import * as vscode from "vscode";
import { DOMParser } from "@xmldom/xmldom";
import { lt } from "semver";
import { AtelierAPI } from "../api";
import { handleError } from "../utils";
import { iscIcon } from "../extension";

const viewType = "isc-show-plan";
const viewTitle = "Show Plan";

let panel: vscode.WebviewPanel;

/** Escape any HTML characters so they are rendered literally */
function htmlEncode(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Convert a block of text (for example, the plan) to HTML */
function formatTextBlock(text: string): string {
  let newText = "<p>\n";
  let prevIndent = 0;
  let ulLevel = 0;
  for (const line of text.split(/\r?\n/)) {
    let lineTrim = htmlEncode(line.trim());
    if (!lineTrim.length) continue; // Line is only whitespace
    // Render references to modules or subqueries in the same color as the headers
    // for those sections to help users visually draw the link between them
    if (lineTrim.includes(" module ") || lineTrim.includes("subquery ") || lineTrim.includes("subqueries ")) {
      lineTrim = lineTrim
        .replace(/(Call|in) (module [A-Z]|\d{1,5})/g, '$1 <span class="module">$2</span>')
        .replace(/subquery [A-Z]|\d{1,5}/g, '<span class="subquery">$&</span>')
        .replace(/subqueries (?:[A-Z]|\d{1,5})(?:, [A-Z]|\d{1,5})*,? and [A-Z]|\d{1,5}/g, (match: string): string =>
          match
            .replace(/subqueries [A-Z]|\d{1,5}/, '<span class="subquery">$&</span>')
            .replace(/(,|and) ([A-Z]|\d{1,5})/g, '$1 <span class="subquery">$2</span>')
        );
    }
    const indent = line.search(/\S/) - 1;
    if (indent == 0) {
      const oldUlLevel = ulLevel;
      while (ulLevel) {
        newText += "</ul>\n";
        if (ulLevel > 1) newText += "</li>\n";
        ulLevel--;
      }
      if (oldUlLevel) newText += "</p>\n<p>\n";
      newText += `${lineTrim}<br/>\n`;
    } else {
      if (indent > prevIndent) {
        if (ulLevel) {
          newText = `${newText.slice(0, -6)}\n<ul>\n`;
        } else {
          newText += "<ul>\n";
        }
        ulLevel++;
      } else if (indent < prevIndent) {
        newText += `</ul>\n</li>\n`;
      }
      newText += `<li>${lineTrim}</li>\n`;
    }
    prevIndent = indent;
  }
  while (ulLevel) {
    newText += "</ul>\n";
    if (ulLevel > 1) newText += "</li>\n";
    ulLevel--;
  }
  return `${newText}</p>\n`;
}

/** Create a `Show Plan` Webview, or replace the contents of the one that already exists */
export async function showPlanWebview(args: {
  uri: vscode.Uri;
  sqlQuery: string;
  selectMode: string;
  includes: string[];
  imports: string[];
  className?: string;
}): Promise<void> {
  const api = new AtelierAPI(args.uri);
  if (!api.active) {
    vscode.window.showErrorMessage("Show Plan requires an active server connection.", "Dismiss");
    return;
  }
  if (lt(api.config.serverVersion, "2024.1.0")) {
    vscode.window.showErrorMessage("Show Plan requires InterSystems IRIS version 2024.1 or above.", "Dismiss");
    return;
  }
  if (args.className) {
    // Query %Dictionary.CompiledClass for a list of all Includes and Imports
    await api
      .actionQuery(
        "SELECT $LISTTOSTRING(Importall) AS Imports, $LISTTOSTRING(IncludeCodeall) AS Includes FROM %Dictionary.CompiledClass WHERE Name = ?",
        [args.className]
      )
      .then((data) => {
        if (!data?.result?.content?.length) return;
        const row = data.result.content.pop();
        if (row.Imports) {
          args.imports.push(...row.Imports.replace(/[^\x20-\x7E]/g, "").split(","));
        }
        if (row.Includes) {
          args.includes.push(...row.Includes.replace(/[^\x20-\x7E]/g, "").split(","));
        }
      })
      .catch(() => {
        // Swallow errors and try with the info that was in the document
      });
  }
  // Get the plan in XML format
  const planXML: string = await api
    .actionQuery("SELECT %SYSTEM.QUERY_PLAN(?,,,,,?) XML", [
      args.sqlQuery.trimEnd(),
      `{"selectmode":"${args.selectMode}"${args.imports.length ? `,"packages":"$LFS(\\"${[...new Set(args.imports)].join(",")}\\")"` : ""}${args.includes.length ? `,"includeFiles":"$LFS(\\"${[...new Set(args.includes)].join(",")}\\")"` : ""}}`,
    ])
    .then((data) => data?.result?.content[0]?.XML)
    .catch((error) => {
      handleError(error, "Failed to fetch query plan.");
    });
  if (!planXML) return;
  // Convert the XML into HTML
  let planHTML = "";
  try {
    // Parse the XML into a Document object
    const xmlDoc = new DOMParser().parseFromString(planXML, "text/xml");
    // Get the single <plan> Element, which contains everything else
    const planElem = xmlDoc.getElementsByTagName("plan").item(0);

    // Loop through the child elements of the plan
    let capturePlan = false;
    let planText = "";
    let planChild = <Element>planElem.firstChild;
    while (planChild) {
      switch (planChild.nodeName) {
        case "sql":
          planHTML += '<h3>Statement Text</h3>\n<div class="code-block">\n';
          for (const line of planChild.textContent.trim().split(/\r?\n/)) {
            planHTML += `${htmlEncode(line.trim())}\n`;
          }
          planHTML += `</div>\n<hr class="vscode-divider">\n`;
          break;
        case "warning":
          planHTML += `<h3 class="warning-h">Warning</h3>\n<p>\n${formatTextBlock(planChild.textContent)}</p>\n<hr class="vscode-divider">\n`;
          break;
        case "info":
          planHTML += `<h3 class="info-h">Information</h3>\n${formatTextBlock(planChild.textContent)}<hr class="vscode-divider">\n`;
          break;
        case "cost":
          planHTML += `<h4>Relative Cost `;
          // The plan might not have a cost
          planHTML +=
            planChild.attributes.length &&
            planChild.attributes.item(0).nodeName == "value" &&
            +planChild.attributes.item(0).value
              ? `= ${planChild.attributes.item(0).value}`
              : "Unavailable";
          planHTML += "</h4>\n";
          capturePlan = true;
          break;
        case "#text":
          if (capturePlan) {
            planText += planChild.textContent;
            if (!planChild.nextSibling || planChild.nextSibling.nodeName != "#text") {
              // This is the end of the plan text, so convert the text to HTML
              planHTML += `${formatTextBlock(planText)}<hr class="vscode-divider">\n`;
              capturePlan = false;
            }
          }
          break;
        case "module": {
          let moduleText = "";
          let moduleChild = planChild.firstChild;
          while (moduleChild) {
            moduleText += moduleChild.textContent;
            moduleChild = moduleChild.nextSibling;
          }
          planHTML += `<h3 class="module">Module ${planChild.attributes.item(0).value}</h3>\n${formatTextBlock(moduleText)}<hr class="vscode-divider">\n`;
          break;
        }
        case "subquery": {
          let subqueryText = "";
          let subqueryChild = planChild.firstChild;
          while (subqueryChild) {
            subqueryText += subqueryChild.textContent;
            subqueryChild = subqueryChild.nextSibling;
          }
          planHTML += `<h3 class="subquery">Subquery ${planChild.attributes.item(0).value}</h3>\n${formatTextBlock(subqueryText)}<hr class="vscode-divider">\n`;
          break;
        }
      }
      planChild = <Element>planChild.nextSibling;
    }
    // Remove the last divider
    planHTML = planHTML.slice(0, -28);
  } catch (error) {
    handleError(error, "Failed to convert query plan to HTML.");
    return;
  }

  // If a ShowPlan panel exists, replace the content instead of the panel
  if (!panel) {
    // Create the webview panel
    panel = vscode.window.createWebviewPanel(
      viewType,
      viewTitle,
      { preserveFocus: false, viewColumn: vscode.ViewColumn.Beside },
      {
        localResourceRoots: [],
      }
    );
    panel.onDidDispose(() => (panel = undefined));
    panel.iconPath = iscIcon;
  } else if (!panel.visible) {
    // Make the panel visible
    panel.reveal(vscode.ViewColumn.Beside, false);
  }
  // Set the HTML content
  panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en-us">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${viewTitle}</title>
        <style>
          .vscode-divider {
            background-color: var(--vscode-widget-border);
            border: 0;
            display: block;
            height: 1px;
            margin-bottom: 10px;
            margin-top: 10px;
          }
          .warning-h {
            color: var(--vscode-terminal-ansiYellow);
          }
          .info-h {
            color: var(--vscode-terminal-ansiBlue);
          }
          .module {
            color: var(--vscode-terminal-ansiMagenta);
          }
          .subquery {
            color: var(--vscode-terminal-ansiGreen);
          }
          div.code-block {
            background-color: var(--vscode-textCodeBlock-background);
            border-radius: 5px;
            font-family: monospace;
            white-space: pre;
            padding: 10px;
            padding-top: initial;
            overflow-x: scroll;
          }
        </style>
      </head>
      <body>
        ${planHTML}
      </body>
      </html>`;
}
