import vscode = require("vscode");

import { InputBoxOptions } from "vscode";

// Interface used internally to track queued input boxes
interface InputBoxSpec {
  key?: string;
  options: InputBoxOptions;
  callback: (answer: string) => void;
}

/**
 * Used in situations where multiple input boxes may be displayed in rapid succession
 * to allow the user to respond to them one at a time.
 */
export class InputBoxManager {
  /** Set to true if an input box is currently shown */
  private static shown = false;

  /** Array of input boxes to show */
  private static specs = new Array<InputBoxSpec>();

  /** Tracks the current key of the input box being shown (to make sure we don't re-queue it) */
  private static currentKey: string;

  /**
   * Queues an input box to be shown via `vscode.window.showInputBox()`. If no input box is shown, will show immediately; otherwise,
   * will show once all previously-queued input boxes have resolved.
   * @param options Set of options for the input box
   * @param callback Function to run when the input box resolves. (If rejected, will move on to the next input box.)
   * @param key A unique identifier for the input box to be shown. If already present in the queue, will not be duplicated.
   */
  public static showInputBox(options: InputBoxOptions, callback: (answer: string) => void, key?: string): void {
    const spec: InputBoxSpec = {
      options: options,
      callback: callback,
    };
    if (key) {
      // If a key was provided, make sure that we aren't already showing (and haven't already queued) an input box with that key.
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

    // Add the input box to the list to show
    this.specs.push(spec);
    if (!this.shown) {
      this.shown = true;
      // If we aren't already showing an input box, show this one.
      this.next();
    }
  }

  /** Shows the next input box in the queue, if any */
  private static next() {
    if (this.specs.length === 0) {
      // All done!
      this.shown = false;
      this.currentKey = undefined;
      return;
    }

    // Get the next input box
    const spec = this.specs.shift();
    this.currentKey = spec.key;

    // Show the input box, then execute the user-provided callback.
    // Always move on to the next input box afterward.
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
