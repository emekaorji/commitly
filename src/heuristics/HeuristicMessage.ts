import * as path from 'path';

/**
 * Deterministic, dependency-free commit-message generator. This is the fallback
 * whenever AI generation is disabled, unavailable, rate-limited, or produces an
 * invalid message — so it must always yield a clean Conventional Commit header.
 */

const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
] as const;

export function heuristicMessage(relPaths: string[], branch: string): string {
  const type = guessTypeFromChanges(relPaths, branch);
  const scope = deriveScope(relPaths);
  const summary = summarizeChanges(relPaths);
  const header = scope ? `${type}(${scope}): ${summary}` : `${type}: ${summary}`;
  return header.trim();
}

export function guessTypeFromBranch(branchName: string): string | undefined {
  const b = branchName.toLowerCase();
  if (b.includes('fix') || b.startsWith('bugfix/')) return 'fix';
  if (b.includes('feat') || b.startsWith('feature/')) return 'feat';
  if (b.includes('docs')) return 'docs';
  if (b.includes('test')) return 'test';
  return undefined;
}

/**
 * Prefer the branch's intent; otherwise infer from what changed (docs-only,
 * tests-only, config/deps), falling back to `chore`.
 */
export function guessTypeFromChanges(relPaths: string[], branch: string): string {
  const fromBranch = guessTypeFromBranch(branch);
  if (fromBranch) return fromBranch;
  if (relPaths.length === 0) return 'chore';

  const every = (pred: (p: string) => boolean) => relPaths.every(pred);
  if (every(isDocs)) return 'docs';
  if (every(isTest)) return 'test';
  if (every(isBuildOrConfig)) return 'chore';
  return 'chore';
}

export function deriveScope(relPaths: string[]): string | undefined {
  if (relPaths.length === 0) return undefined;
  const firstSegs = relPaths.map((p) => {
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts.length > 1 ? parts[0] : undefined;
  });
  const head = firstSegs[0];
  if (head && firstSegs.every((s) => s === head) && head !== 'src') return head;
  // When everything lives under src/, use the next segment if shared.
  if (head === 'src') {
    const secondSegs = relPaths.map((p) => {
      const parts = p.split(/[\\/]/).filter(Boolean);
      return parts.length > 2 ? parts[1] : undefined;
    });
    const s = secondSegs[0];
    if (s && secondSegs.every((x) => x === s)) return s;
  }
  return undefined;
}

export function summarizeChanges(relPaths: string[]): string {
  const sorted = [...relPaths].sort((a, b) => a.localeCompare(b));
  const files = sorted.length;
  if (files === 0) return 'update working tree';
  if (files === 1) return `update ${path.basename(sorted[0])}`;
  if (files <= 3) return `update ${sorted.map((p) => path.basename(p)).join(', ')}`;
  return `update ${files} files`;
}

export function branchRelevanceOk(
  message: string,
  branch: string,
  enabled: boolean
): boolean {
  if (!enabled) return true;
  const b = (branch ?? '').toLowerCase();
  if (!b) return true;
  const msgType = message.split(':')[0]?.toLowerCase() ?? '';
  const wants =
    b.includes('fix') || b.startsWith('bugfix/')
      ? 'fix'
      : b.includes('feat') || b.startsWith('feature/')
        ? 'feat'
        : undefined;
  if (!wants) return true;
  return msgType.startsWith(wants);
}

export function isConventionalType(type: string): boolean {
  return (CONVENTIONAL_TYPES as readonly string[]).includes(type);
}

function isDocs(p: string): boolean {
  return /\.(md|mdx|rst|txt)$/i.test(p) || p.toLowerCase().startsWith('docs/');
}
function isTest(p: string): boolean {
  return /(^|[\\/])(test|tests|__tests__)[\\/]/i.test(p) || /\.(test|spec)\./i.test(p);
}
function isBuildOrConfig(p: string): boolean {
  const base = path.basename(p).toLowerCase();
  return (
    base === 'package.json' ||
    base === 'pnpm-lock.yaml' ||
    base === 'package-lock.json' ||
    base === 'yarn.lock' ||
    base === 'tsconfig.json' ||
    base.endsWith('.config.js') ||
    base.endsWith('.config.mjs') ||
    base.endsWith('.config.ts') ||
    base.endsWith('.yml') ||
    base.endsWith('.yaml')
  );
}
