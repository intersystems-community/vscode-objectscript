import * as vscode from 'vscode';

export class ObjectScriptClassFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    let ranges: vscode.FoldingRange[] = [];

    for (let i = 0; i < document.lineCount; i++) {
      let line = document.lineAt(i);
      let prevLine = i > 0 ? document.lineAt(i - 1) : { text: '' };

      // Documenation block
      const docPattern = /\/{3}/;
      if (line.text.match(docPattern)) {
        const start = i;
        while (i++ && i < document.lineCount) {
          let line = document.lineAt(i);
          if (!line.text.match(docPattern)) {
            i--;
            break;
          }
        }
        const end = i;
        ranges.push({
          start,
          end,
          kind: vscode.FoldingRangeKind.Comment
        });
        continue;
      }
      if (line.text.match('^{') && !prevLine.text.match(/^\bClass\b/i)) {
        const start = i - 1;
        while (i++ && i < document.lineCount) {
          let line = document.lineAt(i);
          if (line.text.match(/^}/)) {
            break;
          }
        }
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
