import * as assert from 'assert';
import { matchesSimpleGlob, isEligibleRel } from '../../services/glob';

suite('glob', () => {
  test('matchesSimpleGlob', () => {
    assert.ok(matchesSimpleGlob('a.env', '*.env'));
    assert.ok(matchesSimpleGlob('README.md', 'README.md'));
    assert.ok(matchesSimpleGlob('anything', '*'));
    assert.ok(matchesSimpleGlob('src/x.ts', 'src/*'));
    assert.ok(!matchesSimpleGlob('a.ts', '*.env'));
    assert.ok(!matchesSimpleGlob('lib/x.ts', 'src/*'));
  });

  test('isEligibleRel honours ignore patterns', () => {
    assert.ok(isEligibleRel('src/a.ts', ['*.env', 'README.md']));
    assert.ok(!isEligibleRel('README.md', ['*.env', 'README.md']));
    assert.ok(!isEligibleRel('config.env', ['*.env']));
  });

  test('.commitlyrc is always eligible', () => {
    assert.ok(isEligibleRel('.commitlyrc', ['*']));
  });

  test('paths escaping the repo are rejected', () => {
    assert.ok(!isEligibleRel('../outside.ts', []));
    assert.ok(!isEligibleRel('', []));
  });
});
