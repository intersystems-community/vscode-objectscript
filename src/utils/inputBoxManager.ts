import vscode = require("vscode");

import { InputBoxOptions } from "vscode";

// Used in situations where multiple input boxes may be displayed to ensure that we don't stomp on
// the box that's already shown.
export class InputBoxManager {
  private static shown = false;
  private static specs = new Array<InputBoxSpec>();
  private static currentKey: string;

  public static showInputBox(options: InputBoxOptions, callback: (answer: string) => void, key?: string): void {
    const spec: InputBoxSpec = {
      options: options,
      callback: callback,
    };
    if (key) {
      if (
        InputBoxManager.currentKey === key ||
        InputBoxManager.specs.find((spec) => {
          return spec.key === key;
        })
      ) {
        return;
      }
      spec.key = key;
    }
    this.specs.push(spec);
    if (!this.shown) {
      this.shown = true;
      this.next();
    }
  }

  private static next() {
    if (this.specs.length === 0) {
      this.shown = false;
      this.currentKey = undefined;
      return;
    }
    const spec = this.specs.shift();
    this.currentKey = spec.key;
    vscode.window.showInputBox(spec.options).then(
      (result) => {
        spec.callback(result);
        InputBoxManager.next();
      },
      (ignored) => {
        InputBoxManager.next();
      }
    );
  }
}

interface InputBoxSpec {
  key?: string;
  options: InputBoxOptions;
  callback: (answer: string) => void;
}
