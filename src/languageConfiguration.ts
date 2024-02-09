import * as vscode from "vscode";

export function getLanguageConfiguration(lang: string): vscode.LanguageConfiguration {
  return {
    wordPattern:
      /((?<=(class|extends|as|of) )(%?\b[a-z0-9]+(\.[a-z0-9]+)*\b))|(\^[a-z0-9]+(\.[a-z0-9]+)*)|((\${1,3}|[irm]?%|\^|#)?[a-z0-9]+)/i,
    brackets: [
      ["{", "}"],
      ["(", ")"],
    ],
    comments: {
      lineComment: ["objectscript-class", "objectscript-int"].includes(lang) ? "//" : "#;",
      blockComment: ["/*", "*/"],
    },
    autoClosingPairs: [
      {
        open: "/*",
        close: "*/",
        notIn: [vscode.SyntaxTokenType.Comment, vscode.SyntaxTokenType.String, vscode.SyntaxTokenType.RegEx],
      },
    ],
    onEnterRules:
      lang == "objectscript-class"
        ? [
            {
              beforeText: /^\/\/\//,
              action: { indentAction: vscode.IndentAction.None, appendText: "/// " },
            },
          ]
        : undefined,
  };
}
