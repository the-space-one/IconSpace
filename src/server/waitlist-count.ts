import { db } from "@/db";
import { waitlistSubscribers } from "@/db/schema";
import { count } from "drizzle-orm";
import { unstable_cache } from "next/cache";

/** Public subscriber count.
 *
 *  Cached for 30s and tagged so a successful signup can bust it immediately
 *  (see revalidateTag in the signup route). Every failure path falls back to
 *  the last value we saw rather than flashing 0 — a wrong-but-stale count
 *  reads better than the counter appearing to reset. */

export const WAITLIST_COUNT_CACHE_TAG = "waitlist-count";

const RETRY_DELAYS_MS = [120, 320, 700];
let lastKnownWaitlistCount = 0;
let hasLastKnownWaitlistCount = false;

function summarizeError(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message:
      error instanceof Error ? error.message.split("\n")[0] : String(error),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableDbError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("429") ||
    message.includes("Too Many Requests") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection terminated") ||
    message.includes("connect_timeout")
  );
}

export async function readWaitlistCountFromDb() {
  if (!db) {
    return hasLastKnownWaitlistCount ? lastKnownWaitlistCount : 0;
  }

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const [result] = await db
        .select({
          value: count(waitlistSubscribers.id),
        })
        .from(waitlistSubscribers);

      const nextCount = Number(result?.value ?? 0);
      if (!Number.isFinite(nextCount)) {
        return hasLastKnownWaitlistCount ? lastKnownWaitlistCount : 0;
      }

      lastKnownWaitlistCount = Math.max(0, nextCount);
      hasLastKnownWaitlistCount = true;
      return lastKnownWaitlistCount;
    } catch (error) {
      const isFinalAttempt = attempt === RETRY_DELAYS_MS.length;
      if (isFinalAttempt || !isRetryableDbError(error)) {
        console.error("waitlist_count_read_error", summarizeError(error));
        return hasLastKnownWaitlistCount ? lastKnownWaitlistCount : 0;
      }

      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  return 0;
}

const getCachedWaitlistCountInternal = unstable_cache(
  async () => readWaitlistCountFromDb(),
  ["waitlist-count-v1"],
  {
    revalidate: 30,
    tags: [WAITLIST_COUNT_CACHE_TAG],
  },
);

export async function getCachedWaitlistCount() {
  try {
    return await getCachedWaitlistCountInternal();
  } catch (error) {
    console.error("waitlist_count_cache_error", summarizeError(error));
    return 0;
  }
}
