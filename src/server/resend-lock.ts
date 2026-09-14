import { randomUUID } from "node:crypto";
import { getRedisClient } from "@/server/redis";

const TTL_SECONDS = 600;
const RENEW =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) else return 0 end";
const RELEASE =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

type LockStore = {
  set: (
    key: string,
    token: string,
    options: { NX: true; EX: number },
  ) => Promise<unknown>;
  eval: (
    script: string,
    options: { keys: string[]; arguments: string[] },
  ) => Promise<unknown>;
};

export function createResendLeaseManager(
  deps: {
    configured: () => boolean;
    client: () => Promise<LockStore>;
    key: () => string;
  } = {
    configured: () => Boolean(process.env.REDIS_URL?.trim()),
    client: getRedisClient,
    key: () =>
      process.env.RESEND_LOCK_KEY?.trim() ||
      "iconspace:resend-confirmations:lock",
  },
) {
  let localRunning = false;
  return async function acquire() {
    if (localRunning) return null;
    localRunning = true;
    try {
      if (!deps.configured()) {
        // Only process-local protection; use Redis for cross-instance exclusion.
        console.warn("resend_lock_local_only");
        return {
          renew: async () => true,
          release: async () => {
            localRunning = false;
          },
        };
      }
      const redis = await deps.client();
      const key = deps.key();
      const token = randomUUID();
      const acquired = await redis.set(key, token, {
        NX: true,
        EX: TTL_SECONDS,
      });
      if (!acquired) {
        localRunning = false;
        return null;
      }
      return {
        renew: async () =>
          Number(
            await redis.eval(RENEW, {
              keys: [key],
              arguments: [token, String(TTL_SECONDS)],
            }),
          ) === 1,
        release: async () => {
          try {
            await redis.eval(RELEASE, { keys: [key], arguments: [token] });
          } finally {
            localRunning = false;
          }
        },
      };
    } catch (error) {
      localRunning = false;
      // Configured but unavailable is NOT permission to run concurrently.
      throw error;
    }
  };
}

export const acquireResendLease = createResendLeaseManager();
