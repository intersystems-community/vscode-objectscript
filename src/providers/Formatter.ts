import * as vscode from "vscode";
import { config } from "../extension.js";

export type WordCase = "word" | "upper" | "lower";

export class Formatter {
  private _commandCase: WordCase;
  private _functionCase: WordCase;

  public constructor() {
    this.loadConfig();
    vscode.workspace.onDidChangeConfiguration(event => {
      this.loadConfig();
    });
  }

  private loadConfig() {
    const { commandCase, functionCase } = config("format");
    this._commandCase = commandCase;
    this._functionCase = functionCase;
  }

  public setCase<T extends string | vscode.SnippetString>(wordCase: WordCase, value: T): T {
    let inputValue: string, resultValue: string;
    if (value instanceof vscode.SnippetString) {
      inputValue = value.value;
    } else {
      inputValue = value as string;
    }
    switch (wordCase) {
      case "lower": {
        resultValue = inputValue.toLowerCase();
        break;
      }
      case "upper": {
        resultValue = inputValue.toUpperCase();
        break;
      }
      case "word": {
        resultValue = inputValue.toLowerCase();
        /** commands */
        resultValue = resultValue.replace(/^(Z+\w|TS|TC|TRO|\w)/i, v => v.toUpperCase());
        resultValue = resultValue.replace(/^elseif$/i, "ElseIf");
        /** functions */
        resultValue = resultValue.replace(/\^?\$(Z+\w|\w)/i, v => v.toUpperCase());
        resultValue = resultValue.replace(/\$isobject/i, "$IsObject");
        resultValue = resultValue.replace(/\$classmethod/i, "$ClassMethod");
        resultValue = resultValue.replace(/\$classname/i, "$ClassName");
        break;
      }
      default: {
        break;
      }
    }
    if (value instanceof vscode.SnippetString) {
      return new vscode.SnippetString(resultValue) as T;
    } else {
      return resultValue as T;
    }
  }

  public command(value: string): string {
    return value.replace(/\b(\w+)\b/g, v => this.setCase(this._commandCase, v));
  }

  public function<T extends string | vscode.SnippetString>(value: T): T {
    return this.setCase(this._functionCase, value);
  }
}
