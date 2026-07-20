import * as assert from 'assert';
import {
  mergeConfig,
  normalizeRc,
  defaultConfig,
} from '../../services/config';

suite('config merge', () => {
  test('normalizeRc maps legacy + nested ai fields', () => {
    assert.deepStrictEqual(normalizeRc({ aiCommitMessage: false }).ai, {
      enabled: false,
    });
    assert.deepStrictEqual(normalizeRc({ ai: { tier: 'byo' } }).ai, {
      tier: 'byo',
    });
  });

  test('normalizeRc maps the triggers array to an object', () => {
    const t = normalizeRc({ triggers: ['idle', 'testPass'] }).triggers!;
    assert.strictEqual(t.idle, true);
    assert.strictEqual(t.testPass, true);
    assert.strictEqual(t.saveBurst, false);
  });

  test('normalizeRc supports the *Over aliases', () => {
    const rc = normalizeRc({ lineChangesOver: 10, fileChangesOver: 2 });
    assert.strictEqual(rc.lineChangeThreshold, 10);
    assert.strictEqual(rc.fileChangeThreshold, 2);
  });

  test('mergeConfig clamps numeric bounds', () => {
    const out = mergeConfig(defaultConfig, { idleThresholdSec: 1 });
    assert.strictEqual(out.idleThresholdSec, 5);
  });

  test('mergeConfig validates enums', () => {
    const out = mergeConfig(defaultConfig, {
      pushStrategy: 'bogus' as any,
      ai: { tier: 'nope' as any },
    });
    assert.strictEqual(out.pushStrategy, 'manual');
    assert.strictEqual(out.ai.tier, 'auto');
  });

  test('mergeConfig deep-merges the ai block', () => {
    const out = mergeConfig(defaultConfig, { ai: { tier: 'byo' } });
    assert.strictEqual(out.ai.tier, 'byo');
    // untouched ai defaults survive
    assert.strictEqual(out.ai.enabled, defaultConfig.ai.enabled);
    assert.strictEqual(out.ai.timeoutMs, defaultConfig.ai.timeoutMs);
  });

  test('later overrides win (settings over rc)', () => {
    const out = mergeConfig(
      defaultConfig,
      { idleThresholdSec: 30 },
      { idleThresholdSec: 45 }
    );
    assert.strictEqual(out.idleThresholdSec, 45);
  });
});
