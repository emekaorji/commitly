import type { CommitContext } from './DiffContextBuilder';

// Cheap, fast model used for the free/default (proxy) tier.
export const DEFAULT_PROXY_MODEL = 'llama-3.1-8b-instant';
// More capable model unlocked when the user brings their own Groq key.
export const DEFAULT_BYO_MODEL = 'openai/gpt-oss-120b';

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

export function systemPrompt(includeBody: boolean): string {
  const bodyRule = includeBody
    ? 'You MAY add a body: one blank line after the subject, then at most 3 short lines explaining what and why.'
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

export function buildUserPrompt(ctx: CommitContext): string {
  const lines: string[] = [];
  lines.push(`Branch: ${ctx.branch || '(unknown)'}`);
  lines.push(`Trigger: ${ctx.reason}`);
  lines.push(`Files changed: ${ctx.totalFiles}`);
  lines.push('');
  lines.push('File summary:');
  for (const f of ctx.files) {
    lines.push(`  ${f.status}\t+${f.additions}/-${f.deletions}\t${f.path}`);
  }
  lines.push('');
  if (ctx.diffText.trim().length > 0) {
    lines.push(ctx.truncated ? 'Diff (truncated):' : 'Diff:');
    lines.push(ctx.diffText);
  } else {
    lines.push('(No textual diff available — base the message on the file summary.)');
  }
  return lines.join('\n');
}
