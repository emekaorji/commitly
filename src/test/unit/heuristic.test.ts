import * as assert from 'assert';
import {
  heuristicMessage,
  guessTypeFromBranch,
  guessTypeFromChanges,
  deriveScope,
  summarizeChanges,
  branchRelevanceOk,
} from '../../heuristics/HeuristicMessage';

suite('HeuristicMessage', () => {
  test('guessTypeFromBranch maps intent branches', () => {
    assert.strictEqual(guessTypeFromBranch('feature/login'), 'feat');
    assert.strictEqual(guessTypeFromBranch('bugfix/crash'), 'fix');
    assert.strictEqual(guessTypeFromBranch('fix-thing'), 'fix');
    assert.strictEqual(guessTypeFromBranch('docs/readme'), 'docs');
    assert.strictEqual(guessTypeFromBranch('main'), undefined);
  });

  test('guessTypeFromChanges infers from content when branch is neutral', () => {
    assert.strictEqual(guessTypeFromChanges(['README.md'], 'main'), 'docs');
    assert.strictEqual(
      guessTypeFromChanges(['src/foo.test.ts'], 'main'),
      'test'
    );
    assert.strictEqual(guessTypeFromChanges(['package.json'], 'main'), 'chore');
    assert.strictEqual(guessTypeFromChanges(['src/a.ts'], 'main'), 'chore');
    // branch intent wins over content
    assert.strictEqual(guessTypeFromChanges(['README.md'], 'feature/x'), 'feat');
  });

  test('deriveScope uses common directory, skipping bare src', () => {
    assert.strictEqual(deriveScope(['src/services/a.ts', 'src/services/b.ts']), 'services');
    assert.strictEqual(deriveScope(['ui/a.ts', 'ui/b.ts']), 'ui');
    assert.strictEqual(deriveScope(['a.ts', 'b.ts']), undefined);
    assert.strictEqual(deriveScope(['src/a.ts', 'ui/b.ts']), undefined);
  });

  test('summarizeChanges scales with file count', () => {
    assert.strictEqual(summarizeChanges(['src/a.ts']), 'update a.ts');
    assert.strictEqual(summarizeChanges(['a.ts', 'b.ts']), 'update a.ts, b.ts');
    assert.strictEqual(summarizeChanges(['a', 'b', 'c', 'd']), 'update 4 files');
  });

  test('heuristicMessage builds a conventional header', () => {
    assert.strictEqual(
      heuristicMessage(['src/services/a.ts'], 'main'),
      'chore(services): update a.ts'
    );
    assert.strictEqual(
      heuristicMessage(['src/services/a.ts'], 'feature/login'),
      'feat(services): update a.ts'
    );
    assert.strictEqual(heuristicMessage([], 'main'), 'chore: update working tree');
  });

  test('branchRelevanceOk enforces branch intent only when relevant', () => {
    assert.strictEqual(branchRelevanceOk('feat: x', 'feature/a', true), true);
    assert.strictEqual(branchRelevanceOk('chore: x', 'feature/a', true), false);
    assert.strictEqual(branchRelevanceOk('feat(scope): x', 'feature/a', true), true);
    assert.strictEqual(branchRelevanceOk('chore: x', 'main', true), true);
    assert.strictEqual(branchRelevanceOk('chore: x', 'feature/a', false), true);
  });
});
