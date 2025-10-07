import * as vscode from "vscode";

import { ObjectScriptDefinitionProvider } from "../../providers/ObjectScriptDefinitionProvider";
import { lookupCcsDefinition } from "../features/definitionLookup/lookup";

export class PrioritizedDefinitionProvider implements vscode.DefinitionProvider {
  private readonly delegate: ObjectScriptDefinitionProvider;
  private readonly lookup: typeof lookupCcsDefinition;

  public constructor(
    delegate: ObjectScriptDefinitionProvider,
    lookupFn: typeof lookupCcsDefinition = lookupCcsDefinition
  ) {
    this.delegate = delegate;
    this.lookup = lookupFn;
  }

  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.Location | vscode.Location[] | vscode.DefinitionLink[] | undefined> {
    const location = await this.lookup(document, position, token, {
      onNoResult: () => {
        // No result from CCS resolver, fallback will be triggered
      },
    });
    if (location) {
      return location;
    }

    return this.delegate.provideDefinition(document, position, token);
  }
}
