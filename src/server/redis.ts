import { createClient } from "redis";

/** Shared Redis client used by the rate limiter.
 *
 *  Tuned to fail fast rather than queue: if Redis is unreachable the signup
 *  path should not stall, it should fall through to the limiter's fail-open
 *  behavior. Hence `disableOfflineQueue`, a short connect timeout, and a
 *  reconnect strategy that gives up instead of retrying in the background. */

// Derived from our own factory rather than `typeof createClient`: node-redis v6
// narrows the client generics based on the options passed, so the bare
// `ReturnType<typeof createClient>` is a different (incompatible) type.
type WaitlistRedisClient = ReturnType<typeof createRedis>;

type GlobalRedisState = typeof globalThis & {
  waitlistRedisClient?: WaitlistRedisClient;
  waitlistRedisConnectPromise?: Promise<WaitlistRedisClient> | null;
};

const globalRedisState = globalThis as GlobalRedisState;
const REDIS_CONNECT_TIMEOUT_MS = 1_200;

function resolveRedisUrl() {
  return process.env.REDIS_URL?.trim() || null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Redis connection timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function createRedis() {
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured.");
  }

  const client = createClient({
    url: redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy() {
        // Let the request path fail fast and rely on fail-open behavior.
        return false;
      },
    },
  });

  // Without a listener, a socket error would surface as an unhandled
  // 'error' event and crash the process.
  client.on("error", () => {});

  return client;
}

export async function getRedisClient(): Promise<WaitlistRedisClient> {
  if (!globalRedisState.waitlistRedisClient) {
    globalRedisState.waitlistRedisClient = createRedis();
  }

  const client = globalRedisState.waitlistRedisClient;
  if (!client) {
    throw new Error("Redis client failed to initialize.");
  }

  if (client.isOpen) {
    return client;
  }

  // Collapse concurrent connects so a burst of signups opens one socket.
  if (!globalRedisState.waitlistRedisConnectPromise) {
    globalRedisState.waitlistRedisConnectPromise = withTimeout(
      client.connect().then(() => client),
      REDIS_CONNECT_TIMEOUT_MS + 300,
    ).finally(() => {
      globalRedisState.waitlistRedisConnectPromise = null;
    });
  }

  return globalRedisState.waitlistRedisConnectPromise;
}
