import { generateText } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import { MODEL, systemPrompt, buildUserPrompt, type RequestBody } from '../lib/prompt.js';
import { sanitizeToConventional } from '../lib/validate.js';
import { perUserLimiter, globalLimiter } from '../lib/ratelimit.js';

const MAX_DIFF_BYTES = 60_000;

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return json({ error: 'server_misconfigured' }, 500);

  const machine = req.headers.get('x-commitly-machine') || 'unknown';
  const ip =
    (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'noip';

  try {
    // Global daily kill-switch first, then per-machine+IP bucket.
    const g = await globalLimiter().limit('global');
    if (!g.success) return rateLimited(g.reset);
    const u = await perUserLimiter().limit(`${machine}:${ip}`);
    if (!u.success) return rateLimited(u.reset);
  } catch (err) {
    // KV misconfigured / unreachable — fail loudly, don't run unmetered.
    return json({ error: 'rate_limit_unavailable' }, 503);
  }

  let body: RequestBody | null;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!body || typeof body.diff !== 'string') {
    return json({ error: 'bad_request' }, 400);
  }
  if (Buffer.byteLength(body.diff, 'utf8') > MAX_DIFF_BYTES) {
    return json({ error: 'too_large' }, 413);
  }

  try {
    const groq = createGroq({ apiKey });
    const { text } = await generateText({
      model: groq(MODEL),
      system: systemPrompt(false),
      prompt: buildUserPrompt(body),
      temperature: 0.2,
      maxOutputTokens: 80,
      maxRetries: 1,
    });
    const res = sanitizeToConventional(text, { includeBody: false });
    if (!res.ok || !res.message) return json({ error: 'generation_failed' }, 502);
    return json({ message: res.message, model: MODEL }, 200);
  } catch {
    return json({ error: 'upstream_error' }, 502);
  }
}

// Reject non-POST verbs cleanly.
export function GET(): Response {
  return json({ error: 'method_not_allowed' }, 405);
}

function rateLimited(resetMs: number): Response {
  const retryAfterSec = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
  return new Response(
    JSON.stringify({ error: 'rate_limited', retryAfterSec }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(retryAfterSec),
      },
    }
  );
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
