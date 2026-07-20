/**
 * Minimal, dependency-free glob + eligibility helpers used to decide whether a
 * repo-relative path is a candidate for auto-commit. Pure so it can be
 * unit-tested directly.
 */

export function matchesSimpleGlob(relPath: string, pattern: string): boolean {
  // Supports exact match, "*", "*.ext", and "prefix*suffix".
  if (pattern === relPath) return true;
  if (pattern === '*') return true;
  if (pattern.startsWith('*.')) {
    return relPath.endsWith(pattern.slice(1));
  }
  if (pattern.includes('*')) {
    const [a, b] = pattern.split('*');
    return relPath.startsWith(a) && relPath.endsWith(b ?? '');
  }
  return false;
}

/**
 * `rel` must already be repo-relative (POSIX or platform separators). The
 * `.commitlyrc` config file is always eligible so config changes get committed.
 */
export function isEligibleRel(rel: string, ignorePatterns: string[]): boolean {
  if (!rel || rel.startsWith('..')) return false;
  if (rel === '.commitlyrc') return true;
  return !ignorePatterns.some((p) => matchesSimpleGlob(rel, p));
}
