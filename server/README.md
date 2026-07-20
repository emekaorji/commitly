# Commitly Proxy

The free/default commit-message tier for the [Commitly](../README.md) VS Code
extension. Holds the owner's Groq API key server-side so it is never shipped in
the extension bundle, and rate-limits per machine + IP with a global daily cap.

This is a **separate Vercel project** from the extension. It is intentionally
excluded from the extension's build and `.vsix`.

## Endpoint

```
POST /api/commit-message
headers: x-commitly-machine, x-commitly-version, user-agent: commitly/<v>
body:    { "diff": string, "meta": { branch, reason, fileCount, additions, deletions, exts }, "truncated": boolean }

200 → { "message": "type(scope): subject", "model": "llama-3.1-8b-instant" }
429 → { "error": "rate_limited", "retryAfterSec": number }   (+ Retry-After header)
413 → { "error": "too_large" }         # diff over 60 KB
5xx → falls back to the extension's built-in heuristic
```

The server owns the model, prompt, token cap, and output validation, so the
endpoint can only produce commit messages — it can't be repurposed as a general
LLM relay.

## Deploy

1. Provision an Upstash Redis (or Vercel KV) store and note its REST URL + token.
2. Set env vars on the Vercel project (Production + Preview):
   - `GROQ_API_KEY` — your Groq key
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN` — the Redis REST credentials
   - `RATE_LIMIT_PER_HOUR` (default 30), `DAILY_GLOBAL_CAP` (default 5000)
3. From this `server/` directory: `pnpm install` then `pnpm run deploy`.
4. Point the extension at it via `commitly.ai.proxyUrl`, or update the default
   in the extension's `package.json` / `src/services/config.ts` to the deployed
   URL.

For local testing: copy `.env.example` to `.env`, fill it in, and run
`pnpm run dev` (`vercel dev`).

If KV is not configured the endpoint returns `503` — it never runs unmetered.
