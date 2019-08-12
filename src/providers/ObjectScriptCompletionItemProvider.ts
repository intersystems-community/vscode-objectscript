import * as vscode from "vscode";

import { AtelierAPI } from "../api/index";
import { ClassDefinition } from "../utils/classDefinition";
import { currentFile, onlyUnique } from "../utils/index";
import commands = require("./completion/commands.json");
import structuredSystemVariables = require("./completion/structuredSystemVariables.json");
import systemFunctions = require("./completion/systemFunctions.json");
import systemVariables = require("./completion/systemVariables.json");
import { Formatter } from "./Formatter";

export class ObjectScriptCompletionItemProvider implements vscode.CompletionItemProvider {
  private _formatter: Formatter;

  public constructor() {
    this._formatter = new Formatter();
  }

  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter) {
      if (context.triggerCharacter === "#") {
        return (
          this.macro(document, position, token, context) || this.entities(document, position, token, context) || null
        );
      }
      if (context.triggerCharacter === "$") {
        return this.macrolist(document, position, token, context);
      }
      if (context.triggerCharacter === ".") {
        if (document.getWordRangeAtPosition(position, /\$system(\.\b\w+\b)?\./i)) {
          return this.system(document, position, token, context);
        }
        return (
          this.classes(document, position, token, context) || this.entities(document, position, token, context) || null
        );
      }
    }
    const completions =
      this.classes(document, position, token, context) ||
      this.macrolist(document, position, token, context) ||
      this.dollarsComplete(document, position) ||
      this.commands(document, position) ||
      this.entities(document, position, token, context) ||
      this.macro(document, position, token, context) ||
      this.constants(document, position, token, context) ||
      null;

    return completions;
  }

  public macro(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter !== "#") {
      return null;
    }
    const range = document.getWordRangeAtPosition(position, /#+\b\w+[\w\d]*\b/);
    const line = range ? document.getText(range) : "";
    if (range && line && line !== "") {
      return [
        {
          command: { title: "", command: "editor.action.triggerSuggest" },
          insertText: new vscode.SnippetString("##class($0)"),
          label: "##class()",
          range,
        },
        {
          insertText: new vscode.SnippetString("##super($0)"),
          label: "##super()",
          range,
        },
        {
          insertText: new vscode.SnippetString("#dim $1 As $2"),
          label: "#dim",
          range,
        },
      ];
    }
    return null;
  }

  public macrolist(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const range = document.getWordRangeAtPosition(position, /\${3}(\b\w[\w\d]*\b)?/);
    const text = range ? document.getText(range) : "";
    if (range) {
      const macro = text.toLowerCase().slice(3);
      const file = currentFile();
      const api = new AtelierAPI();
      return api
        .getmacrollist(file.name, [])
        .then(data => data.result.content.macros)
        .then(list => list.filter(el => el.toLowerCase().startsWith(macro)))
        .then(list => list.map(el => "$$$" + el))
        .then(list =>
          list.map(el => ({
            label: el,
            // kind: vscode.CompletionItemKind.Constant,
            // insertText: el,
            range,
          }))
        );
    }
    return null;
  }

  public commands(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const word = document.getWordRangeAtPosition(position, /\s+\b\w+[\w\d]*\b/);
    const line = word ? document.getText(word) : "";

    if (line.match(/^\s+\b[a-z]+\b$/i)) {
      const search = line.trim().toUpperCase();
      const items = commands
        .filter(el => el.label.startsWith(search) || el.alias.findIndex(el2 => el2.startsWith(search)) >= 0)
        .map(el => ({
          ...el,
          label: this._formatter.command(el.label),
          insertText: el.insertText ? this._formatter.command(el.insertText) : null,
        }))
        .map(el => ({
          ...el,
          documentation: new vscode.MarkdownString(el.documentation.join("")),
          insertText: new vscode.SnippetString(el.insertText || `${el.label} $0`),
          kind: vscode.CompletionItemKind.Keyword,
          preselect: el.alias.includes(search),
        }));
      if (!items.length) {
        return null;
      }
      return {
        // isIncomplete: items.length > 0,
        items,
      };
    }
    return null;
  }

  public dollarsComplete(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const range = document.getWordRangeAtPosition(position, /\^?\$*\b\w+[\w\d]*\b/);
    const text = range ? document.getText(range) : "";
    const textAfter = "";

    const dollarsMatch = text.match(/(\^?\$+)(\b\w+\b)?$/);
    if (dollarsMatch) {
      let search = dollarsMatch.shift();
      const dollars = dollarsMatch.shift();
      search = (search || "").toUpperCase();
      if (dollars === "$") {
        const items = [...this.listSystemFunctions(search, textAfter.length > 0), ...this.listSystemVariables(search)];
        return {
          isIncomplete: items.length > 1,
          items: items.map(el => {
            return {
              ...el,
              label: this._formatter.function(el.label),
              insertText: this._formatter.function(el.insertText),
              range,
            };
          }),
        };
      } else if (dollars === "^$") {
        return this.listStructuredSystemVariables(search, textAfter.length > 0).map(el => {
          return {
            ...el,
            label: this._formatter.function(el.label),
            range,
          };
        });
      }
    }
    return null;
  }

  public listSystemFunctions(search: string, open = false): vscode.CompletionItem[] {
    return systemFunctions
      .filter(el => el.label.startsWith(search) || el.alias.findIndex(el2 => el2.startsWith(search)) >= 0)
      .map(el => {
        return {
          ...el,
          documentation: new vscode.MarkdownString(el.documentation.join("")),
          insertText: new vscode.SnippetString(el.label.replace("$", "\\$") + "($0" + (open ? "" : ")")),
          kind: vscode.CompletionItemKind.Function,
          preselect: el.alias.includes(search),
        };
      });
  }

  public listSystemVariables(search: string) {
    return systemVariables
      .filter(el => el.label.startsWith(search) || el.alias.findIndex(el2 => el2.startsWith(search)) >= 0)
      .map(el => {
        return {
          ...el,
          insertText: el.label,
          documentation: new vscode.MarkdownString(el.documentation.join("\n")),
          kind: vscode.CompletionItemKind.Variable,
          preselect: el.alias.includes(search),
        };
      });
  }

  public listStructuredSystemVariables(search: string, open = false) {
    return structuredSystemVariables.map(el => {
      return {
        ...el,
        documentation: new vscode.MarkdownString(el.documentation.join("\n")),
        insertText: new vscode.SnippetString(el.label.replace("$", "\\$") + "($0" + (open ? "" : ")")),
        kind: vscode.CompletionItemKind.Variable,
      };
    });
  }

  public constants(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    const range = document.getWordRangeAtPosition(position, /%?\b\w+[\w\d]*\b/);
    const kind = vscode.CompletionItemKind.Variable;
    if (context.triggerKind === vscode.CompletionTriggerKind.Invoke) {
      return [
        {
          label: "%session",
        },
        {
          label: "%request",
        },
        {
          label: "%response",
        },
        {
          label: "SQLCODE",
        },
        {
          label: "%ROWCOUNT",
        },
      ].map(el => ({ ...el, kind, range }));
    }
    return null;
  }

  public entities(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const range = document.getWordRangeAtPosition(position, /%?\b\w+[\w\d]*\b/) || new vscode.Range(position, position);
    const textBefore = document.getText(new vscode.Range(new vscode.Position(position.line, 0), range.start));
    const curFile = currentFile();
    const searchText = document.getText(range);

    const method = el => ({
      documentation: el.desc.length ? new vscode.MarkdownString(el.desc.join("")) : null,
      insertText: new vscode.SnippetString(`${el.name}($0)`),
      kind: vscode.CompletionItemKind.Method,
      label: el.name,
    });

    const parameter = el => ({
      documentation: el.desc.length ? new vscode.MarkdownString(el.desc.join("")) : null,
      insertText: new vscode.SnippetString(`${el.name}`),
      kind: vscode.CompletionItemKind.Constant,
      label: `${el.name}`,
      range,
    });

    const property = el => ({
      documentation: el.desc.length ? new vscode.MarkdownString(el.desc.join("")) : null,
      insertText: new vscode.SnippetString(`${el.name}`),
      kind: vscode.CompletionItemKind.Property,
      label: el.name,
    });

    const search = el => el.name.startsWith(searchText);

    const classRef = textBefore.match(/##class\(([^)]+)\)\.#?$/i);
    if (classRef) {
      const [, className] = classRef;
      const classDef = new ClassDefinition(className);
      if (textBefore.endsWith("#")) {
        return classDef.parameters().then(data => data.filter(search).map(parameter));
      }
      return classDef.methods("class").then(data => data.filter(search).map(method));
    }

    if (curFile.fileName.endsWith("cls")) {
      const selfRef = textBefore.match(/(?<!\.)\.\.#?$/i);
      if (selfRef) {
        const classDef = new ClassDefinition(curFile.name);
        if (textBefore.endsWith("#")) {
          return classDef.parameters().then(data => data.filter(search).map(parameter));
        }
        return Promise.all([classDef.methods(), classDef.properties()]).then(data => {
          const [methods, properties] = data;
          return [...methods.filter(search).map(method), ...properties.filter(search).map(property)];
        });
      }
    }

    return null;
  }

  public classes(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
    const curFile = currentFile();
    let pattern = /##class\(([^)]*)\)/i;
    let range = document.getWordRangeAtPosition(position, pattern);
    let text = range ? document.getText(range) : "";
    let [, className] = range ? text.match(pattern) : "";
    if (!range) {
      pattern = /(\b(?:Of|As)\b (%?\b[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]+)*\b\.?)?(?! of))/i;
      range = document.getWordRangeAtPosition(position, pattern);
      text = range ? document.getText(range) : "";
      className = text.split(" ").pop();
    }
    // tslint:disable-next-line: max-line-length
    pattern = /(?:(Extends |CompileAfter *=|DependsOn *=|PropertyClass *=) *\(? *)((%?[a-zA-Z0-9]*(?:\.[a-zA-Z0-9]*)*)(, *%?[a-zA-Z0-9]*(?:\.[a-zA-Z0-9]*)*|, *)*.?)?/i;
    if (
      !range &&
      // && (!document.getWordRangeAtPosition(position, /\bExtends\b\s*/i))
      document.getWordRangeAtPosition(position, pattern)
    ) {
      range =
        document.getWordRangeAtPosition(position, /%?[a-zA-Z][a-zA-Z0-9.]*|%/) || new vscode.Range(position, position);
      text = document.getText(range);
      className = text.split(/\s|\(/).pop();
    }
    if (range) {
      const percent = className.startsWith("%");
      const library = percent && className.indexOf(".") < 0;
      className = className || "";
      const searchName = className.replace(/(^%|")/, "").toLowerCase();
      const part = className.split(".").length;
      const params = [];

      let sql = "";
      /// Classes from the current class's package
      if (part === 1 && curFile.fileName.endsWith("cls")) {
        const packageName = curFile.name
          .split(".")
          .slice(0, -2)
          .join(".");
        const className2 = curFile.name
          .split(".")
          .slice(0, -1)
          .join(".");
        const part2 = packageName.split(".").length + 1;
        sql += `
        SELECT
        DISTINCT
          $Piece(Name, '.', ${part2}) PartName,
          0 AsPackage,
          0 Priority
        FROM %Dictionary.ClassDefinition
        WHERE Hidden=0
          AND Name %STARTSWITH ?
          AND Name <> ?
          AND $Length(Name, '.') = ${part2}
        `;
        params.push(packageName + ".");
        params.push(className2);
        sql += "\nUNION ALL\n";
      }

      sql += `
        SELECT
          DISTINCT
            $Piece(Name, '.', ${part}) PartName,
            CASE
              WHEN GREATEST($Length(Name,'.'),${part}) > ${part} THEN 1
              ELSE 0
            END AsPackage,
            2 Priority
        FROM %Dictionary.ClassDefinition
        WHERE Hidden=0
          AND LOWER(Name) %STARTSWITH ?`;
      params.push(className.toLowerCase());

      /// %Library.* classes when entered %*
      if (library) {
        sql += `
          UNION ALL
          SELECT
            STRING('%', $PIECE(Name,'.',2)) PartName ,
            0 AsPackage,
            1 Priority
          FROM %Dictionary.ClassDefinition
          WHERE Hidden=0
            AND LOWER(Name) %STARTSWITH ?
        `;
        params.push(`%library.${searchName}`);
      }
      sql += " ORDER BY PartName,AsPackage DESC";

      const api = new AtelierAPI();
      return api.actionQuery(sql, params).then(data => {
        return data.result.content
          .map(el => ({
            ...el,
            AsPackage: el.AsPackage === "1",
          }))
          .map(el => ({
            command: el.AsPackage ? { title: "", command: "editor.action.triggerSuggest" } : null,
            insertText: new vscode.SnippetString(el.PartName + (el.AsPackage ? "." : "")),
            kind: el.AsPackage ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.Class,
            label: el.PartName,
            range: document.getWordRangeAtPosition(position, /%?\b[a-zA-Z][a-zA-Z0-9]*\b|%/),
            sortText: el.Priority + el.PartName + (el.AsPackage ? "0" : "1"),
          }));
      });
    }

    return null;
  }

  public system(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ) {
    const range = document.getWordRangeAtPosition(position, /\$system(\.\b\w+\b)?(\.\b\w+\b)?\./i);
    const text = range ? document.getText(range) : "";
    const [, className] = text.match(/\$system(\.\b\w+\b)?(\.\b\w+\b)?\./i);

    const api = new AtelierAPI();
    if (!className) {
      return api.getDocNames({ category: "CLS", filter: "%SYSTEM." }).then(data => {
        return data.result.content
          .map(el => el.name)
          .filter(el => el.startsWith("%SYSTEM."))
          .map(el => el.split(".")[1])
          .filter(onlyUnique)
          .map(el => ({
            command: { title: "", command: "editor.action.triggerSuggest" },
            insertText: el + ".",
            kind: vscode.CompletionItemKind.Class,
            label: el,
          }));
      });
    } else {
      return api.actionIndex([`%SYSTEM${className}.cls`]).then(data => {
        return data.result.content
          .pop()
          .content.methods.filter(el => !el.private)
          .filter(el => !el.internal)
          .map(el => ({
            documentation: el.desc.length ? new vscode.MarkdownString(el.desc.join("")) : null,
            insertText: new vscode.SnippetString(`${el.name}($0)`),
            kind: vscode.CompletionItemKind.Method,
            label: el.name,
          }));
      });
    }
  }
}
