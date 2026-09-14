import { createHash } from "crypto";
import { getRedisClient } from "@/server/redis";

/** Fixed-window IP rate limiter backed by Redis.
 *
 *  INCR + PEXPIRE run as one Lua script so the counter and its TTL are set
 *  atomically — doing them as two round trips can leave a key with no
 *  expiry if the process dies in between, permanently blocking that IP. */

const DEFAULT_WINDOW_MS = 300_000;
const DEFAULT_MAX_REQUESTS = 10;
const DEFAULT_REDIS_PREFIX = "waitlist:ratelimit";
const DEFAULT_FAIL_OPEN = true;

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return { current, ttl }
`;

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function getWindowMs() {
  return readPositiveIntegerEnv("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);
}

function getMaxRequests() {
  return readPositiveIntegerEnv("RATE_LIMIT_MAX_REQUESTS", DEFAULT_MAX_REQUESTS);
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}

function getRedisPrefix() {
  return process.env.RATE_LIMIT_REDIS_PREFIX?.trim() || DEFAULT_REDIS_PREFIX;
}

function isFailOpenEnabled() {
  return readBooleanEnv("RATE_LIMIT_FAIL_OPEN", DEFAULT_FAIL_OPEN);
}

function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.split("\n")[0],
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

/** The raw key contains an IP, so it is hashed before it ever reaches Redis. */
function hashRateLimitKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

function parseScriptResult(result: unknown) {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error("Unexpected Redis rate-limit response.");
  }

  const currentCount = Number(result[0]);
  const ttlMs = Number(result[1]);

  if (!Number.isFinite(currentCount)) {
    throw new Error("Invalid Redis rate-limit count.");
  }

  return {
    currentCount,
    ttlMs: Number.isFinite(ttlMs) ? ttlMs : -1,
  };
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  reason?: "rate_limited" | "limiter_unavailable";
};

export async function checkIpRateLimit(key: string): Promise<RateLimitResult> {
  const windowMs = getWindowMs();
  const maxRequests = getMaxRequests();
  const redisKey = `${getRedisPrefix()}:${hashRateLimitKey(key)}`;

  try {
    const client = await getRedisClient();
    const scriptResult = await client.eval(RATE_LIMIT_SCRIPT, {
      keys: [redisKey],
      arguments: [String(windowMs)],
    });

    const { currentCount, ttlMs } = parseScriptResult(scriptResult);
    const normalizedTtlMs = ttlMs > 0 ? ttlMs : windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil(normalizedTtlMs / 1000));

    if (currentCount > maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        reason: "rate_limited",
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - currentCount),
      retryAfterSeconds,
    };
  } catch (error) {
    const safeError = summarizeError(error);

    // No Redis configured (or it is down). Default is to let signups through
    // rather than block the whole waitlist on a cache dependency.
    if (isFailOpenEnabled()) {
      console.warn("waitlist_rate_limit_bypassed", {
        mode: "fail_open",
        error: safeError,
      });
      return {
        allowed: true,
        remaining: maxRequests,
        retryAfterSeconds: 1,
      };
    }

    console.error("waitlist_rate_limit_error", {
      mode: "fail_closed",
      error: safeError,
    });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
      reason: "limiter_unavailable",
    };
  }
}
