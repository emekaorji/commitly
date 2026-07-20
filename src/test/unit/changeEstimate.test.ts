import * as assert from 'assert';
import { estimateChangedLines } from '../../services/changeEstimate';

const delta = (startLine: number, endLine: number, text: string) => ({
  range: { start: { line: startLine }, end: { line: endLine } },
  text,
});

suite('estimateChangedLines', () => {
  test('single-line insert counts at least one', () => {
    assert.strictEqual(estimateChangedLines([delta(0, 0, 'x')]), 1);
  });

  test('multi-line insert counts inserted lines', () => {
    assert.strictEqual(estimateChangedLines([delta(0, 0, 'a\nb\nc')]), 3);
  });

  test('range deletion counts touched lines', () => {
    assert.strictEqual(estimateChangedLines([delta(2, 5, '')]), 4);
  });

  test('sums across changes', () => {
    assert.strictEqual(
      estimateChangedLines([delta(0, 0, 'a'), delta(1, 1, 'b\nc')]),
      3
    );
  });
});
