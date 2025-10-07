import * as vscode from "vscode";

export function getLanguageConfiguration(lang: string): vscode.LanguageConfiguration {
  const conf = vscode.workspace.getConfiguration("objectscript");
  const onEnterRules: vscode.OnEnterRule[] = [];

  if (lang === "objectscript-class") {
    onEnterRules.push({
      beforeText: /^\/\/\//,
      action: { indentAction: vscode.IndentAction.None, appendText: "/// " },
    });
  }

  if (["objectscript", "objectscript-int"].includes(lang)) {
    onEnterRules.push({
      beforeText: /^\s*;/,
      action: { indentAction: vscode.IndentAction.None, appendText: ";" },
    });
  }
  return {
    wordPattern:
      /((?<=(class|extends|as|of) )(%?\b[a-z0-9]+(\.[a-z0-9]+)*\b))|(\^[a-z0-9]+(\.[a-z0-9]+)*)|((\${1,3}|[irm]?%|\^|#)?[a-z0-9]+)/i,
    brackets: [
      ["{", "}"],
      ["(", ")"],
    ],
    comments: {
      lineComment:
        lang == "objectscript-class"
          ? "//"
          : ["objectscript", "objectscript-macros"].includes(lang)
            ? conf.get("commentToken")
            : conf.get("intCommentToken"),
      blockComment: ["/*", "*/"],
    },
    autoClosingPairs: [
      {
        open: "/*",
        close: "*/",
        notIn: [vscode.SyntaxTokenType.Comment, vscode.SyntaxTokenType.String, vscode.SyntaxTokenType.RegEx],
      },
      {
        open: "{",
        close: "}",
        notIn: [vscode.SyntaxTokenType.Comment, vscode.SyntaxTokenType.String, vscode.SyntaxTokenType.RegEx],
      },
      {
        open: "(",
        close: ")",
        notIn: [vscode.SyntaxTokenType.Comment, vscode.SyntaxTokenType.String, vscode.SyntaxTokenType.RegEx],
      },
      {
        open: '"',
        close: '"',
        notIn: [vscode.SyntaxTokenType.Comment, vscode.SyntaxTokenType.String, vscode.SyntaxTokenType.RegEx],
      },
    ],
    onEnterRules: onEnterRules.length ? onEnterRules : undefined,
  };
}
