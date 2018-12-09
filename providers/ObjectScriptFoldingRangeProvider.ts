import * as vscode from 'vscode';

export class ObjectScriptFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    let ranges: vscode.FoldingRange[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      let line = document.lineAt(i);

      if (line.text.match(/^\b\w+\b/) && !line.text.match(/^\bROUTINE\b/)) {
        const start = i;
        while (i++ && i < document.lineCount) {
          let line = document.lineAt(i);
          if (line.text.match(/^\b\w+\b/)) {
            break;
          }
        }
        i--;
        const end = i;
        ranges.push({
          start,
          end,
          kind: vscode.FoldingRangeKind.Region
        });
        continue;
      }
    }

    return ranges;
  }
}
