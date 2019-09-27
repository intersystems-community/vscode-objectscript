import { IndentAction, LanguageConfiguration } from "vscode";

export const WORD_PATTERN = /((?<=(class|extends|as|of) )(%?\b[a-z0-9]+(\.[a-z0-9]+)*\b))|(\^[a-z0-9]+(\.[a-z0-9]+)*)|((\${1,3}|[irm]?%|\^|#)?[a-z0-9]+)/i;

export function getLanguageConfiguration(lang: string): LanguageConfiguration {
  return {
    wordPattern: WORD_PATTERN,
    brackets: [["{", "}"], ["(", ")"], ['"', '"']],
    comments: {
      lineComment: lang === "class" ? "//" : "#;",
      blockComment: ["/*", "*/"],
    },
    onEnterRules:
      lang === "class"
        ? [
            {
              beforeText: /^\/\/\//,
              afterText: /.*/,
              action: { indentAction: IndentAction.None, appendText: "/// " },
            },
          ]
        : [],
  };
}
