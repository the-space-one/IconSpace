import { waitlistSubscribers, type WaitlistEmailSendStatus } from "@/db/schema";
import { and, asc, count, eq, gt, gte, ne, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  createStandaloneDb,
  primaryDb,
  resolveFallbackDatabaseUrls,
} from "./index";

/* Write path with failover.
 *
 * A signup tries the primary Neon database first, retrying a couple of times on
 * transient errors. If the primary stays broken it is put in a short cooldown
 * and the next configured fallback takes over, so a Neon incident degrades to
 * "writes land somewhere else" instead of "signups are lost". */

const DEFAULT_FAILOVER_COOLDOWN_MS = 30_000;
const DEFAULT_WRITE_RETRIES = 2;
const RETRY_DELAY_MS = [120, 300, 700, 1_200];

export type InsertWaitlistResult =
  | {
      status: "created";
      source: "primary" | "fallback";
      subscriberId: number;
      targetKey: string;
    }
  | {
      status: "exists";
      source: "primary" | "fallback";
      targetKey: string;
    };

export type EmailDeliveryStatus = Exclude<WaitlistEmailSendStatus, "pending">;

export type DbClientRef = {
  key: string;
  label: string;
  source: "primary" | "fallback";
  db: NonNullable<typeof primaryDb>;
};

export type DbClients = {
  primary: DbClientRef | null;
  fallbacks: DbClientRef[];
};

export class AllDatabasesUnavailableError extends Error {
  code: "ALL_DATABASES_UNAVAILABLE";

  constructor(message = "All configured databases are unavailable.") {
    super(message);
    this.name = "AllDatabasesUnavailableError";
    this.code = "ALL_DATABASES_UNAVAILABLE";
  }
}

type GlobalFailoverState = typeof globalThis & {
  fallbackDbRefs?: Map<string, DbClientRef>;
  dbCooldownUntil?: Map<string, number>;
};

const globalFailoverState = globalThis as GlobalFailoverState;
const fallbackDbRefs =
  globalFailoverState.fallbackDbRefs ?? new Map<string, DbClientRef>();
const dbCooldownUntil =
  globalFailoverState.dbCooldownUntil ?? new Map<string, number>();

if (process.env.NODE_ENV !== "production") {
  globalFailoverState.fallbackDbRefs = fallbackDbRefs;
  globalFailoverState.dbCooldownUntil = dbCooldownUntil;
}

function readNumberEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function getFailoverCooldownMs() {
  return readNumberEnv("DB_FAILOVER_COOLDOWN_MS", DEFAULT_FAILOVER_COOLDOWN_MS);
}

function getWriteRetries() {
  return Math.floor(readNumberEnv("DB_WRITE_RETRIES", DEFAULT_WRITE_RETRIES));
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Walk the `cause` chain so a wrapped driver error still exposes the socket
 *  code we branch on. */
function collectErrorSignals(error: unknown) {
  const messages: string[] = [];
  const codes: string[] = [];

  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) {
      messages.push(current.message);
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string") {
        codes.push(code);
      }

      current = (current as { cause?: unknown }).cause;
      continue;
    }

    messages.push(String(current));
    break;
  }

  return {
    message: messages.join(" | "),
    codes,
  };
}

/** Log-safe error shape — never includes the message, which can carry the
 *  submitted email or a connection string. */
export function getSafeErrorSummary(error: unknown) {
  const { codes } = collectErrorSignals(error);
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: codes[0] ?? null,
  };
}

export function isRetryableDbError(error: unknown) {
  const { message, codes } = collectErrorSignals(error);
  const hasRetryableCode = codes.some((code) =>
    [
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "ECONNREFUSED",
      "57P01",
      "53300",
    ].includes(code),
  );

  return (
    hasRetryableCode ||
    message.includes("429") ||
    message.includes("Too Many Requests") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection terminated") ||
    message.includes("connect_timeout") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("57P01") ||
    message.includes("53300")
  );
}

function isCoolingDown(target: DbClientRef) {
  const until = dbCooldownUntil.get(target.key);
  return typeof until === "number" && until > Date.now();
}

function startCooldown(target: DbClientRef) {
  dbCooldownUntil.set(target.key, Date.now() + getFailoverCooldownMs());
}

function clearCooldown(target: DbClientRef) {
  dbCooldownUntil.delete(target.key);
}

function buildFallbackKey(url: string) {
  return `fallback:${createHash("sha256").update(url).digest("hex").slice(0, 20)}`;
}

export function getDbClients(): DbClients {
  const primary = primaryDb
    ? ({
        key: "primary",
        label: "primary",
        source: "primary",
        db: primaryDb,
      } as const)
    : null;

  const fallbackUrls = resolveFallbackDatabaseUrls();
  const fallbacks: DbClientRef[] = [];

  fallbackUrls.forEach((url, index) => {
    const key = buildFallbackKey(url);
    let clientRef = fallbackDbRefs.get(key);

    if (!clientRef) {
      const { database } = createStandaloneDb(url);
      clientRef = {
        key,
        label: `fallback-${index + 1}`,
        source: "fallback",
        db: database,
      };
      fallbackDbRefs.set(key, clientRef);
    } else {
      clientRef.label = `fallback-${index + 1}`;
    }

    fallbacks.push(clientRef);
  });

  return { primary, fallbacks };
}

export type UnsentConfirmation = {
  id: number;
  email: string;
  targetKey: string;
  createdAt: Date;
  // PostgreSQL retains microseconds; JS Date does not. Preserve exact cursors.
  createdAtCursor?: string;
};

/** Reads must fail closed after retries: an unknown sent count is not zero. */
export async function withDbRetries<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (!isRetryableDbError(error) || attempt >= getWriteRetries())
        throw error;
      await sleep(RETRY_DELAY_MS[Math.min(attempt, RETRY_DELAY_MS.length - 1)]);
    }
  }
}

/** Rows on this database whose confirmation email never reached "sent" —
 *  everything the resend job still owes. Oldest first, so a capped run drains
 *  the earliest signups. `targetKey` is carried through so the caller can settle
 *  the row on the same database via updateEmailSendStatusById. */
export async function selectUnsentConfirmations(
  target: DbClientRef,
  limit: number,
  after?: { id: number; createdAt: Date; createdAtCursor?: string },
): Promise<UnsentConfirmation[]> {
  if (limit <= 0) {
    return [];
  }

  const rows = await withDbRetries(() =>
    target.db
      .select({
        id: waitlistSubscribers.id,
        email: waitlistSubscribers.email,
        createdAt: waitlistSubscribers.createdAt,
        createdAtCursor: sql<string>`${waitlistSubscribers.createdAt}::text`,
      })
      .from(waitlistSubscribers)
      .where(
        and(
          ne(waitlistSubscribers.emailSendStatus, "sent"),
          after
            ? or(
                gt(
                  waitlistSubscribers.createdAt,
                  sql`${after.createdAtCursor ?? after.createdAt.toISOString()}::timestamptz`,
                ),
                and(
                  eq(
                    waitlistSubscribers.createdAt,
                    sql`${after.createdAtCursor ?? after.createdAt.toISOString()}::timestamptz`,
                  ),
                  gt(waitlistSubscribers.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(waitlistSubscribers.createdAt), asc(waitlistSubscribers.id))
      .limit(limit),
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    targetKey: target.key,
    createdAt: row.createdAt,
    createdAtCursor: row.createdAtCursor,
  }));
}

/** How many confirmations this database has already sent since the start of the
 *  current UTC day — used to stay under the provider's daily cap. */
export async function countSentToday(
  target: DbClientRef,
  at = new Date(),
): Promise<number> {
  const startOfUtcDay = new Date(at);
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const [result] = await withDbRetries(() =>
    target.db
      .select({ value: count(waitlistSubscribers.id) })
      .from(waitlistSubscribers)
      .where(
        and(
          eq(waitlistSubscribers.emailSendStatus, "sent"),
          gte(waitlistSubscribers.emailSentAt, startOfUtcDay),
        ),
      ),
  );

  return Number(result?.value ?? 0);
}

/** Returns null when the target is exhausted by retryable failures (caller
 *  should move to the next database); throws on a real error like a constraint
 *  violation, which no other database would handle differently. */
async function attemptInsert(
  target: DbClientRef,
  email: string,
): Promise<InsertWaitlistResult | null> {
  const retries = getWriteRetries();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const inserted = await target.db
        .insert(waitlistSubscribers)
        .values({ email })
        .onConflictDoNothing()
        .returning({ id: waitlistSubscribers.id });

      clearCooldown(target);

      // No row returned means the unique index rejected it — already signed up.
      if (inserted.length === 0) {
        return {
          status: "exists",
          source: target.source,
          targetKey: target.key,
        };
      }

      return {
        status: "created",
        source: target.source,
        subscriberId: inserted[0].id,
        targetKey: target.key,
      };
    } catch (error) {
      if (!isRetryableDbError(error)) {
        throw error;
      }

      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        startCooldown(target);
        console.error("waitlist_write_retryable_error", {
          target: target.label,
          source: target.source,
          error: getSafeErrorSummary(error),
        });
        return null;
      }

      await sleep(RETRY_DELAY_MS[Math.min(attempt, RETRY_DELAY_MS.length - 1)]);
    }
  }

  return null;
}

export async function insertWaitlistWithFailover(
  email: string,
): Promise<InsertWaitlistResult> {
  const { primary, fallbacks } = getDbClients();
  const writableTargets: DbClientRef[] = [];

  if (primary && !isCoolingDown(primary)) {
    writableTargets.push(primary);
  }

  for (const fallback of fallbacks) {
    if (!isCoolingDown(fallback)) {
      writableTargets.push(fallback);
    }
  }

  // Everything is cooling down: probe anyway rather than reject the signup —
  // a cooldown is a hint, not proof the database is still down.
  if (writableTargets.length === 0) {
    if (primary) {
      writableTargets.push(primary);
    }

    writableTargets.push(...fallbacks);
  }

  if (writableTargets.length === 0) {
    throw new AllDatabasesUnavailableError("No database URLs are configured.");
  }

  let sawRetryableOutage = false;

  for (const target of writableTargets) {
    const result = await attemptInsert(target, email);
    if (result) {
      return result;
    }

    sawRetryableOutage = true;
  }

  if (sawRetryableOutage) {
    throw new AllDatabasesUnavailableError();
  }

  throw new AllDatabasesUnavailableError(
    "No writable database targets are available.",
  );
}

type UpdateEmailSendStatusInput = {
  subscriberId: number;
  targetKey: string;
  status: EmailDeliveryStatus;
  error?: string;
  sentAt?: Date;
};

function truncateStatusError(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");

  return normalized.slice(0, 400) || null;
}

function findDbTargetByKey(targetKey: string) {
  const { primary, fallbacks } = getDbClients();

  if (primary?.key === targetKey) {
    return primary;
  }

  return fallbacks.find((target) => target.key === targetKey) ?? null;
}

/** Settles the row's email status. Deliberately never throws: the signup is
 *  already saved, so a bookkeeping failure must not turn into a 500. */
export async function updateEmailSendStatusById(
  input: UpdateEmailSendStatusInput,
): Promise<boolean> {
  const target = findDbTargetByKey(input.targetKey);
  if (!target) {
    console.error("waitlist_email_status_target_missing", {
      targetType: input.targetKey === "primary" ? "primary" : "fallback",
    });
    return false;
  }

  const normalizedError = truncateStatusError(input.error);
  const emailSentAt =
    input.status === "sent" ? (input.sentAt ?? new Date()) : null;
  const emailSendError =
    input.status === "sent" || input.status === "skipped_config"
      ? null
      : normalizedError;

  try {
    const rows = await withDbRetries(() =>
      target.db
        .update(waitlistSubscribers)
        .set({
          emailSendStatus: input.status,
          emailSendError,
          emailSentAt,
        })
        // Never downgrade a concurrently settled confirmation.
        .where(
          and(
            eq(waitlistSubscribers.id, input.subscriberId),
            ne(waitlistSubscribers.emailSendStatus, "sent"),
          ),
        )
        .returning({ id: waitlistSubscribers.id }),
    );
    if (rows.length > 0) return true;
    const [row] = await withDbRetries(() =>
      target.db
        .select({ status: waitlistSubscribers.emailSendStatus })
        .from(waitlistSubscribers)
        .where(eq(waitlistSubscribers.id, input.subscriberId))
        .limit(1),
    );
    return row?.status === "sent";
  } catch (error) {
    console.error("waitlist_email_status_update_error", {
      source: target.source,
      label: target.label,
      error: getSafeErrorSummary(error),
    });
    return false;
  }
}
