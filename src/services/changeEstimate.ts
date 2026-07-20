/**
 * Rough estimate of how many lines a set of text edits touched. Decoupled from
 * `vscode.TextDocumentContentChangeEvent` (accepts a minimal structural shape)
 * so it can be unit-tested without the extension host.
 */
export interface LineDelta {
  range: { start: { line: number }; end: { line: number } };
  text: string;
}

export function estimateChangedLines(changes: readonly LineDelta[]): number {
  let lines = 0;
  for (const c of changes) {
    const touched = Math.max(1, c.range.end.line - c.range.start.line + 1);
    const inserted = c.text ? c.text.split('\n').length : 0;
    lines += Math.max(touched, inserted);
  }
  return lines;
}
