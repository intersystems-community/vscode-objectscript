import * as vscode from "vscode";

export class ObjectScriptClassFoldingRangeProvider implements vscode.FoldingRangeProvider {
  public provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    const ranges: vscode.FoldingRange[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const prevLine = i > 0 ? document.lineAt(i - 1) : { text: "" };

      // Documenation block
      const docPattern = /\/{3}/;
      if (line.text.match(docPattern)) {
        const start = i;
        while (i++ && i < document.lineCount) {
          const text = document.lineAt(i).text;
          if (!text.match(docPattern)) {
            i--;
            break;
          }
        }
        const end = i;
        if (end - start > 3) {
          ranges.push({
            end,
            kind: vscode.FoldingRangeKind.Comment,
            start,
          });
        }
        continue;
      }
      if (line.text.match("^{") && !prevLine.text.match(/^\bClass\b/i)) {
        const start = i - 1;
        while (i++ && i < document.lineCount) {
          const text = document.lineAt(i).text;
          if (text.match(/^}/)) {
            break;
          }
        }
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
