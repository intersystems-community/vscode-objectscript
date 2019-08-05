import * as vscode from "vscode";

export class ObjectScriptFoldingRangeProvider implements vscode.FoldingRangeProvider {
  public provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    const ranges: vscode.FoldingRange[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);

      if (line.text.match(/^\b\w+\b/) && !line.text.match(/^\bROUTINE\b/)) {
        const start = i;
        while (i++ && i < document.lineCount) {
          const text = document.lineAt(i).text;
          if (text.match(/^\b\w+\b/)) {
            break;
          }
        }
        i--;
        const end = i;
        ranges.push({
          end,
          kind: vscode.FoldingRangeKind.Region,
          start,
        });
        continue;
      }
    }

    return ranges;
  }
}
