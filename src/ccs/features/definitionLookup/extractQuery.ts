import * as vscode from "vscode";

export type QueryKind = "labelRoutine" | "routine" | "macro" | "class";

export interface QueryMatch {
  query: string;
  normalizedQuery: string;
  kind: QueryKind;
  symbolName?: string;
  range: vscode.Range;
}

type DefinitionToken = QueryMatch & { activationRange: vscode.Range };

const LABEL_ROUTINE_REGEX = /\$\$([%A-Za-z][\w]*)\^([%A-Za-z][\w]*(?:\.[%A-Za-z][\w]*)*)/g;
const ROUTINE_INVOCATION_KEYWORDS = ["do", "job"];
const ROUTINE_INVOCATION_PATTERN = ROUTINE_INVOCATION_KEYWORDS.join("|");
const COMMAND_LABEL_ROUTINE_REGEX = new RegExp(
  `\\b(?:${ROUTINE_INVOCATION_PATTERN})\\b\\s+([%A-Za-z][\\w]*)\\^([%A-Za-z][\\w]*(?:\\.[%A-Za-z][\\w]*)*)`,
  "gi"
);
const COMMAND_ROUTINE_REGEX = new RegExp(
  `\\b(?:${ROUTINE_INVOCATION_PATTERN})\\b\\s+\\^([%A-Za-z][\\w]*(?:\\.[%A-Za-z][\\w]*)*)`,
  "gi"
);
const MACRO_REGEX = /\${3}([%A-Za-z][%A-Za-z0-9_]*)/g;
const CLASS_REFERENCE_REGEX = new RegExp(
  "##class\\s*\\(\\s*([%A-Za-z][\\w]*(?:\\.[%A-Za-z][\\w]*)*)\\s*\\)(?:\\s*\\.\\s*([%A-Za-z][\\w]*))?",
  "gi"
);

export function extractDefinitionQuery(
  document: vscode.TextDocument,
  position: vscode.Position
): QueryMatch | undefined {
  const line = position.line;
  const lineText = document.lineAt(line).text;
  const tokens = collectDefinitionTokens(lineText, line);

  const directMatch = tokens.find((token) => containsPosition(token.range, position));
  if (directMatch) {
    return withoutActivationRange(directMatch);
  }

  const activationMatch = tokens.find((token) => containsPosition(token.activationRange, position));
  if (activationMatch) {
    return withoutActivationRange(activationMatch);
  }

  return undefined;
}

export function extractDefinitionQueries(document: vscode.TextDocument): QueryMatch[] {
  const matches: QueryMatch[] = [];
  for (let line = 0; line < document.lineCount; line++) {
    const lineText = document.lineAt(line).text;
    const tokens = collectDefinitionTokens(lineText, line);
    for (const token of tokens) {
      matches.push(withoutActivationRange(token));
    }
  }
  return matches;
}

interface MatchContext {
  line: number;
  start: number;
  text: string;
  match: RegExpExecArray;
}

interface DefinitionMatcher {
  regex: RegExp;
  buildTokens(context: MatchContext): DefinitionToken[];
}

const MATCHERS: DefinitionMatcher[] = [
  {
    regex: LABEL_ROUTINE_REGEX,
    buildTokens: ({ line, start, text, match }) => {
      const [, labelName, routineName] = match;
      const normalized = `${labelName}^${routineName}`;
      const labelStart = start + 2;
      const labelEnd = labelStart + labelName.length;
      const caretIndex = text.indexOf("^");
      if (caretIndex < 0) {
        return [];
      }
      const caretColumn = start + caretIndex;
      const routineStart = caretColumn + 1;
      const routineEnd = routineStart + routineName.length;

      return [
        createToken({
          line,
          start: labelStart,
          end: labelEnd,
          query: text,
          normalizedQuery: normalized,
          kind: "labelRoutine",
          symbolName: routineName,
        }),
        createToken({
          line,
          start: routineStart,
          end: routineEnd,
          activationStart: caretColumn,
          query: `^${routineName}`,
          normalizedQuery: `^${routineName}`,
          kind: "routine",
          symbolName: routineName,
        }),
      ];
    },
  },
  {
    regex: COMMAND_LABEL_ROUTINE_REGEX,
    buildTokens: ({ line, start, text, match }) => {
      const [, labelName, routineName] = match;
      const normalized = `${labelName}^${routineName}`;
      const labelOffset = text.indexOf(labelName);
      if (labelOffset < 0) {
        return [];
      }
      const labelStart = start + labelOffset;
      const labelEnd = labelStart + labelName.length;
      const caretIndex = text.indexOf("^");
      if (caretIndex < 0) {
        return [];
      }
      const caretColumn = start + caretIndex;
      const routineOffset = text.lastIndexOf(routineName);
      if (routineOffset < 0) {
        return [];
      }
      const routineStart = start + routineOffset;
      const routineEnd = routineStart + routineName.length;

      return [
        createToken({
          line,
          start: labelStart,
          end: labelEnd,
          query: normalized,
          normalizedQuery: normalized,
          kind: "labelRoutine",
          symbolName: routineName,
        }),
        createToken({
          line,
          start: routineStart,
          end: routineEnd,
          activationStart: caretColumn,
          query: `^${routineName}`,
          normalizedQuery: `^${routineName}`,
          kind: "routine",
          symbolName: routineName,
        }),
      ];
    },
  },
  {
    regex: COMMAND_ROUTINE_REGEX,
    buildTokens: ({ line, start, text, match }) => {
      const [, routineName] = match;
      const caretIndex = text.indexOf("^");
      if (caretIndex < 0) {
        return [];
      }
      const caretColumn = start + caretIndex;
      const routineOffset = text.lastIndexOf(routineName);
      if (routineOffset < 0) {
        return [];
      }
      const routineStart = start + routineOffset;
      const routineEnd = routineStart + routineName.length;

      return [
        createToken({
          line,
          start: routineStart,
          end: routineEnd,
          activationStart: caretColumn,
          query: `^${routineName}`,
          normalizedQuery: `^${routineName}`,
          kind: "routine",
          symbolName: routineName,
        }),
      ];
    },
  },
  {
    regex: MACRO_REGEX,
    buildTokens: ({ line, start, text, match }) => {
      const [, macroName] = match;
      const macroStart = start + (text.length - macroName.length);
      if (macroStart < start) {
        return [];
      }
      const macroEnd = macroStart + macroName.length;

      return [
        createToken({
          line,
          start: macroStart,
          end: macroEnd,
          activationStart: start,
          query: text,
          normalizedQuery: text,
          kind: "macro",
          symbolName: macroName,
        }),
      ];
    },
  },
  {
    regex: CLASS_REFERENCE_REGEX,
    buildTokens: ({ line, start, text, match }) => {
      const [, className, methodName] = match;
      const classOffset = text.indexOf(className);
      if (classOffset < 0) {
        return [];
      }
      const classStart = start + classOffset;
      const classEnd = classStart + className.length;
      const tokens: DefinitionToken[] = [
        createToken({
          line,
          start: classStart,
          end: classEnd,
          query: `##class(${className})`,
          normalizedQuery: `##class(${className})`,
          kind: "class",
          symbolName: className,
        }),
      ];

      if (methodName) {
        const methodOffset = text.lastIndexOf(methodName);
        if (methodOffset < 0) {
          return tokens;
        }
        const methodStart = start + methodOffset;
        const methodEnd = methodStart + methodName.length;
        tokens.push(
          createToken({
            line,
            start: methodStart,
            end: methodEnd,
            query: `##class(${className}).${methodName}`,
            normalizedQuery: `##class(${className}).${methodName}`,
            kind: "class",
            symbolName: className,
          })
        );
      }

      return tokens;
    },
  },
];

function collectDefinitionTokens(lineText: string, line: number): DefinitionToken[] {
  const tokens: DefinitionToken[] = [];
  for (const matcher of MATCHERS) {
    const regex = cloneRegex(matcher.regex);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lineText)) !== null) {
      tokens.push(...matcher.buildTokens({ line, start: match.index, text: match[0], match }));
      if (!regex.global) {
        break;
      }
    }
  }
  return tokens;
}

function createToken(options: {
  line: number;
  start: number;
  end: number;
  activationStart?: number;
  query: string;
  normalizedQuery: string;
  kind: QueryKind;
  symbolName?: string;
}): DefinitionToken {
  const { line, start, end, activationStart = start } = options;
  const activationEnd = Math.max(end, activationStart + 1);
  return {
    query: options.query,
    normalizedQuery: options.normalizedQuery,
    kind: options.kind,
    symbolName: options.symbolName,
    range: new vscode.Range(line, start, line, end),
    activationRange: new vscode.Range(line, activationStart, line, activationEnd),
  };
}

function withoutActivationRange(token: DefinitionToken): QueryMatch {
  const { activationRange: _activationRange, ...rest } = token;
  return rest;
}

function containsPosition(range: vscode.Range, position: vscode.Position): boolean {
  return position.isAfterOrEqual(range.start) && position.isBefore(range.end);
}

function cloneRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags);
}
