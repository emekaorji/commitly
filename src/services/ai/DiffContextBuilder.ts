import * as path from 'path';
import type { Change, Repository } from '../../types/git';
import type { AutoCommitReason } from '../types';

export interface FileSummary {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export interface CommitContext {
  branch: string;
  reason: AutoCommitReason;
  files: FileSummary[];
  diffText: string;
  truncated: boolean;
  totalFiles: number;
}

/**
 * Build the model input from a set of changes. Uses `diffWithHEAD(path)` per
 * file (equals what the commit records, independent of what is staged), then
 * caps total size: full patches smallest-first until the byte/file budget is
 * hit; the rest are represented by the summary table with `truncated: true`.
 */
export async function buildContext(
  repo: Repository,
  changes: Change[],
  opts: { reason: AutoCommitReason; maxDiffBytes: number; maxFiles: number }
): Promise<CommitContext> {
  const branch = repo.state.HEAD?.name ?? '';
  const root = repo.rootUri.fsPath;

  const perFile: { rel: string; patch: string }[] = [];
  for (const c of changes) {
    const rel = path.relative(root, c.uri.fsPath);
    if (!rel || rel.startsWith('..')) continue;
    let patch = '';
    try {
      patch = await repo.diffWithHEAD(c.uri.fsPath);
    } catch {
      patch = '';
    }
    perFile.push({ rel, patch });
  }

  const files: FileSummary[] = perFile.map(({ rel, patch }) => ({
    path: rel,
    status: statusFromPatch(patch),
    ...countChanges(patch),
  }));

  const sorted = [...perFile].sort((a, b) => a.patch.length - b.patch.length);
  let used = 0;
  let includedCount = 0;
  let truncated = false;
  const included: string[] = [];
  for (const { rel, patch } of sorted) {
    if (!patch.trim()) continue;
    if (
      includedCount >= opts.maxFiles ||
      used + patch.length > opts.maxDiffBytes
    ) {
      truncated = true;
      continue;
    }
    const safe = redactSecrets(patch.trim());
    included.push(`--- ${rel} ---\n${safe}`);
    used += patch.length;
    includedCount++;
  }

  return {
    branch,
    reason: opts.reason,
    files,
    diffText: included.join('\n\n'),
    truncated,
    totalFiles: files.length,
  };
}

export function countChanges(patch: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return { additions, deletions };
}

/**
 * Best-effort scrub of obvious secrets before a diff leaves the machine. Not a
 * guarantee — `.env`-style files should also be covered by `ignorePatterns`.
 */
export function redactSecrets(text: string): string {
  return (
    text
      // key: value / key = "value" for sensitive-looking keys
      .replace(
        /((?:api[_-]?key|secret|token|password|passwd|authorization|bearer|client[_-]?secret)["'\s]*[:=]["'\s]*)[^\s"']+/gi,
        '$1«redacted»'
      )
      // common token prefixes
      .replace(/\b(sk|gsk|ghp|ghs|xox[baprs]|AKIA)[A-Za-z0-9_-]{16,}\b/g, '«redacted»')
      // private key blocks
      .replace(
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        '«redacted-private-key»'
      )
  );
}

export function statusFromPatch(patch: string): string {
  if (/^new file mode/m.test(patch)) return 'added';
  if (/^deleted file mode/m.test(patch)) return 'deleted';
  if (/^rename from/m.test(patch)) return 'renamed';
  if (/^Binary files/m.test(patch)) return 'binary';
  return 'modified';
}
