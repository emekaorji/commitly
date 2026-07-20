import { CONVENTIONAL_TYPES } from './prompt.js';

const HEADER_RE = new RegExp(
  `^(${CONVENTIONAL_TYPES.join('|')})(\\([a-z0-9._\\-/ ]+\\))?!?: .+`,
  'i'
);
const REFUSAL_RE =
  /^(i\s|i'm|i am|as an|sorry|unfortunately|here('|i)s|sure[,!.]|certainly)/i;
const SUBJECT_MAX = 72;

export interface SanitizeResult {
  ok: boolean;
  message?: string;
}

/** Defense-in-depth: the server validates model output too, so the proxy never
 *  returns junk even if a model misbehaves. Mirrors the extension's validator. */
export function sanitizeToConventional(
  raw: string,
  opts: { includeBody: boolean }
): SanitizeResult {
  if (!raw) return { ok: false };
  const text = stripFences(raw).trim();
  if (!text) return { ok: false };

  const allLines = text.split('\n');
  const headerIdx = allLines.findIndex((l) => HEADER_RE.test(l.trim()));
  if (headerIdx === -1) return { ok: false };

  let header = stripQuotes(allLines[headerIdx].trim());
  if (REFUSAL_RE.test(header) && !HEADER_RE.test(header)) return { ok: false };
  if (!HEADER_RE.test(header)) return { ok: false };
  header = normalizeHeader(header);

  if (!opts.includeBody) return { ok: true, message: header };

  const rest = allLines.slice(headerIdx + 1);
  const body = extractBody(rest);
  return { ok: true, message: body ? `${header}\n\n${body}` : header };
}

function normalizeHeader(header: string): string {
  const colon = header.indexOf(':');
  const typeScope = header.slice(0, colon).toLowerCase();
  let subject = header.slice(colon + 1).trim().replace(/\.+$/, '');
  if (subject.length > SUBJECT_MAX) {
    subject = subject.slice(0, SUBJECT_MAX).replace(/\s+\S*$/, '').trim();
  }
  return `${typeScope}: ${subject}`;
}

function extractBody(lines: string[]): string {
  const trimmed = [...lines];
  while (trimmed.length && trimmed[0].trim() === '') trimmed.shift();
  return trimmed
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
    .slice(0, 3)
    .join('\n')
    .trim();
}

function stripFences(s: string): string {
  const fence = s.match(/```[a-z]*\n?([\s\S]*?)```/i);
  return fence ? fence[1] : s.replace(/```/g, '');
}

function stripQuotes(s: string): string {
  return s.replace(/^["'`]+/, '').replace(/["'`]+$/, '').trim();
}
