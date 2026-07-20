import * as path from 'path';
import type { Change } from '../types/git';

/**
 * Build the exact list of repo-relative paths to `git add` for a set of
 * changes. Renames contribute both the new path (`uri`) and the original path
 * (`originalUri`) so the deletion side is recorded and git detects the rename.
 * Deletions are staged by their path (`git add <path>` stages removals).
 *
 * Pure and vscode-free so it can be unit-tested without the extension host.
 * Deliberately avoids the `Status` const enum, which has no runtime value.
 */
export function buildStagePaths(
  changes: readonly Pick<Change, 'uri' | 'originalUri' | 'renameUri'>[],
  rootFsPath: string
): string[] {
  const set = new Set<string>();
  for (const c of changes) {
    const rel = toRel(rootFsPath, c.uri.fsPath);
    if (rel) set.add(rel);
    if (c.renameUri && c.originalUri) {
      const orig = toRel(rootFsPath, c.originalUri.fsPath);
      if (orig) set.add(orig);
    }
  }
  return [...set];
}

function toRel(rootFsPath: string, fsPath: string): string | undefined {
  const rel = path.relative(rootFsPath, fsPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined;
  return rel;
}
