import Redis from "ioredis";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, Bucket>();

let redisClient: Redis | null | undefined;

function getOptionalRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    redisClient.on("error", () => {
      /* memory fallback handles failures */
    });
    return redisClient;
  } catch {
    redisClient = null;
    return null;
  }
}

function pruneMemory(now: number) {
  if (memoryBuckets.size < 500) return;
  for (const [key, bucket] of memoryBuckets) {
    if (bucket.resetAt <= now) memoryBuckets.delete(key);
  }
}

function consumeMemory(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateLimitResult {
  pruneMemory(now);
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
    };
  }

  existing.count += 1;
  memoryBuckets.set(key, existing);
  const remaining = Math.max(0, limit - existing.count);
  return {
    allowed: existing.count <= limit,
    limit,
    remaining,
    resetAt: existing.resetAt,
  };
}

async function consumeRedis(
  redis: Redis,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult | null> {
  const redisKey = `rl:${key}`;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    if (redis.status !== "ready") {
      await redis.connect().catch(() => undefined);
    }
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.pexpire(redisKey, windowMs);
    }
    const pttl = await redis.pttl(redisKey);
    const resetAt = now + (pttl > 0 ? pttl : windowMs);
    // Keep key alive if TTL was lost somehow
    if (pttl < 0) {
      await redis.pexpire(redisKey, windowMs);
    }
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch {
    // Fall back to memory if Redis is unavailable
    void windowSeconds;
    return null;
  }
}

/**
 * Fixed-window rate limit. Prefers Redis when REDIS_URL is set; falls back to process memory.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const redis = getOptionalRedis();
  if (redis) {
    const redisResult = await consumeRedis(redis, key, limit, windowMs, now);
    if (redisResult) return redisResult;
  }
  return consumeMemory(key, limit, windowMs, now);
}

/** Client IP from common proxy headers, with a safe fallback. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : {
          "Retry-After": String(
            Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
          ),
        }),
  };
}

/** Auth endpoints: 20 requests / 10 minutes per IP. */
export const AUTH_RATE_LIMIT = {
  limit: 20,
  windowMs: 10 * 60 * 1000,
} as const;
