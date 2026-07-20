import type { CommitContext } from './DiffContextBuilder';
import { systemPrompt, buildUserPrompt } from './prompt';

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super('rate_limited');
    this.name = 'RateLimitError';
  }
}

// Lazy-load the AI SDK so cold activation and the heuristic path pay nothing,
// and a bundling issue can never break extension activation. The return type is
// inferred from the runtime dynamic imports (avoids a type-only ESM import,
// which Node16 module resolution rejects from this CommonJS output).
async function loadSdkImpl() {
  const [aiMod, groqMod] = await Promise.all([
    import('ai'),
    import('@ai-sdk/groq'),
  ]);
  return { generateText: aiMod.generateText, createGroq: groqMod.createGroq };
}

let sdkPromise: ReturnType<typeof loadSdkImpl> | undefined;

async function loadSdk() {
  if (!sdkPromise) sdkPromise = loadSdkImpl();
  return sdkPromise;
}

/** BYO tier: call Groq directly with the user's key. */
export async function callByo(params: {
  apiKey: string;
  modelId: string;
  ctx: CommitContext;
  includeBody: boolean;
  timeoutMs: number;
}): Promise<string> {
  const { generateText, createGroq } = await loadSdk();
  const groq = createGroq({ apiKey: params.apiKey });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs);
  try {
    const { text } = await generateText({
      model: groq(params.modelId),
      system: systemPrompt(params.includeBody),
      prompt: buildUserPrompt(params.ctx),
      temperature: 0.2,
      maxOutputTokens: params.includeBody ? 200 : 80,
      abortSignal: ac.signal,
      maxRetries: 1,
    });
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Free/default tier: send the context to the owner-hosted proxy. */
export async function callProxy(params: {
  proxyUrl: string;
  ctx: CommitContext;
  timeoutMs: number;
  machineId: string;
  version: string;
}): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), params.timeoutMs);
  try {
    const res = await fetch(params.proxyUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-commitly-machine': params.machineId,
        'x-commitly-version': params.version,
        'user-agent': `commitly/${params.version}`,
      },
      body: JSON.stringify({
        diff: params.ctx.diffText,
        meta: metaOf(params.ctx),
        truncated: params.ctx.truncated,
      }),
      signal: ac.signal,
    });
    if (res.status === 429) {
      const body = await safeJson(res);
      throw new RateLimitError(Number(body?.retryAfterSec) || 60);
    }
    if (!res.ok) throw new Error(`proxy responded ${res.status}`);
    const body = await safeJson(res);
    if (!body || typeof body.message !== 'string' || !body.message.trim()) {
      throw new Error('proxy returned no message');
    }
    return body.message;
  } finally {
    clearTimeout(timer);
  }
}

function metaOf(ctx: CommitContext) {
  const exts = [
    ...new Set(ctx.files.map((f) => extOf(f.path)).filter(Boolean)),
  ];
  return {
    branch: ctx.branch,
    reason: ctx.reason,
    fileCount: ctx.totalFiles,
    additions: ctx.files.reduce((s, f) => s + f.additions, 0),
    deletions: ctx.files.reduce((s, f) => s + f.deletions, 0),
    exts,
  };
}

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i > 0 ? p.slice(i + 1).toLowerCase() : '';
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}
