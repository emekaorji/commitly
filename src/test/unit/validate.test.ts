import * as assert from 'assert';
import { sanitizeToConventional } from '../../services/ai/validate';

const opts = { includeBody: false };

suite('sanitizeToConventional', () => {
  test('accepts a clean conventional header', () => {
    const r = sanitizeToConventional('feat(auth): add login form', opts);
    assert.ok(r.ok);
    assert.strictEqual(r.message, 'feat(auth): add login form');
  });

  test('strips code fences', () => {
    const r = sanitizeToConventional('```\nfix: correct off-by-one\n```', opts);
    assert.ok(r.ok);
    assert.strictEqual(r.message, 'fix: correct off-by-one');
  });

  test('finds the header past a preamble line', () => {
    const r = sanitizeToConventional(
      'Here is your commit message:\nfeat: add thing',
      opts
    );
    assert.ok(r.ok);
    assert.strictEqual(r.message, 'feat: add thing');
  });

  test('lowercases the type and trims a trailing period', () => {
    const r = sanitizeToConventional('FEAT: Add Thing.', opts);
    assert.ok(r.ok);
    assert.strictEqual(r.message, 'feat: Add Thing');
  });

  test('truncates an over-long subject to <= 72 chars', () => {
    const long = 'feat: ' + 'x '.repeat(60);
    const r = sanitizeToConventional(long, opts);
    assert.ok(r.ok);
    const subject = r.message!.split(': ')[1];
    assert.ok(subject.length <= 72, `subject was ${subject.length}`);
  });

  test('rejects refusals and non-conventional text', () => {
    assert.ok(!sanitizeToConventional('I cannot help with that', opts).ok);
    assert.ok(!sanitizeToConventional('just some random text', opts).ok);
    assert.ok(!sanitizeToConventional('', opts).ok);
  });

  test('keeps a body when includeBody is on', () => {
    const r = sanitizeToConventional('feat: add\n\nwhy it matters', {
      includeBody: true,
    });
    assert.ok(r.ok);
    assert.strictEqual(r.message, 'feat: add\n\nwhy it matters');
  });
});
