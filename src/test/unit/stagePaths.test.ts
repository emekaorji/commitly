import * as assert from 'assert';
import { buildStagePaths } from '../../services/stagePaths';

const ROOT = '/repo';
const mk = (fs: string, orig?: string, rename?: string) =>
  ({
    uri: { fsPath: `${ROOT}/${fs}` },
    originalUri: { fsPath: `${ROOT}/${orig ?? fs}` },
    renameUri: rename ? { fsPath: `${ROOT}/${rename}` } : undefined,
  }) as any;

suite('buildStagePaths', () => {
  test('returns repo-relative paths', () => {
    const out = buildStagePaths([mk('src/a.ts'), mk('src/b.ts')], ROOT);
    assert.deepStrictEqual(out.sort(), ['src/a.ts', 'src/b.ts']);
  });

  test('stages both sides of a rename', () => {
    // rename old.ts -> new.ts: uri=new, renameUri=new, originalUri=old
    const change = mk('new.ts', 'old.ts', 'new.ts');
    const out = buildStagePaths([change], ROOT).sort();
    assert.deepStrictEqual(out, ['new.ts', 'old.ts']);
  });

  test('drops paths outside the repo root', () => {
    const out = buildStagePaths([mk('a.ts'), { uri: { fsPath: '/elsewhere/x.ts' }, originalUri: { fsPath: '/elsewhere/x.ts' }, renameUri: undefined } as any], ROOT);
    assert.deepStrictEqual(out, ['a.ts']);
  });

  test('deduplicates', () => {
    const out = buildStagePaths([mk('a.ts'), mk('a.ts')], ROOT);
    assert.deepStrictEqual(out, ['a.ts']);
  });
});
