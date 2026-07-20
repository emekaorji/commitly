import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Fails loudly if KV isn't configured — we never run the free tier without
// rate limiting (that would put the owner's Groq quota at risk).
function redis(): Redis {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'KV not configured: set KV_REST_API_URL and KV_REST_API_TOKEN'
    );
  }
  return new Redis({ url, token });
}

let perUser: Ratelimit | undefined;
let global: Ratelimit | undefined;

export function perUserLimiter(): Ratelimit {
  if (!perUser) {
    perUser = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(
        Number(process.env.RATE_LIMIT_PER_HOUR ?? 30),
        '1 h'
      ),
      prefix: 'commitly:user',
      analytics: false,
    });
  }
  return perUser;
}

export function globalLimiter(): Ratelimit {
  if (!global) {
    global = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(
        Number(process.env.DAILY_GLOBAL_CAP ?? 5000),
        '1 d'
      ),
      prefix: 'commitly:global',
      analytics: false,
    });
  }
  return global;
}
