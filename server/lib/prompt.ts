// NOTE: kept in sync with the extension's src/services/ai/prompt.ts. The server
// owns the authoritative prompt + model so the free tier can't be repurposed.

export const MODEL = 'llama-3.1-8b-instant';

export const CONVENTIONAL_TYPES = [
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

export interface RequestBody {
  diff: string;
  truncated?: boolean;
  meta?: {
    branch?: string;
    reason?: string;
    fileCount?: number;
    additions?: number;
    deletions?: number;
    exts?: string[];
  };
}

export function systemPrompt(includeBody: boolean): string {
  const bodyRule = includeBody
    ? 'You MAY add a body: one blank line after the subject, then at most 3 short lines.'
    : 'Output ONLY the single subject line. No body.';
  return [
    'You write a single Conventional Commit message for a code change.',
    'Output ONLY the commit message — no preamble, no explanation, no code fences, no quotes.',
    '',
    'Rules:',
    '- Format: `type(scope): subject`. The scope is optional.',
    `- type is exactly one of: ${CONVENTIONAL_TYPES.join(', ')}.`,
    '- Imperative mood, lowercase subject, no trailing period, subject <= 72 characters.',
    '- Derive scope from the dominant directory or module; omit it if unclear.',
    '- Describe only what the diff actually changes. Never invent changes.',
    `- ${bodyRule}`,
  ].join('\n');
}

export function buildUserPrompt(body: RequestBody): string {
  const meta = body.meta ?? {};
  const lines: string[] = [];
  lines.push(`Branch: ${meta.branch || '(unknown)'}`);
  lines.push(`Trigger: ${meta.reason || '(unknown)'}`);
  lines.push(`Files changed: ${meta.fileCount ?? '?'}`);
  if (meta.additions !== undefined || meta.deletions !== undefined) {
    lines.push(`Lines: +${meta.additions ?? 0}/-${meta.deletions ?? 0}`);
  }
  if (meta.exts && meta.exts.length) lines.push(`Types: ${meta.exts.join(', ')}`);
  lines.push('');
  if (body.diff.trim().length > 0) {
    lines.push(body.truncated ? 'Diff (truncated):' : 'Diff:');
    lines.push(body.diff);
  } else {
    lines.push('(No textual diff available — base the message on the summary.)');
  }
  return lines.join('\n');
}
