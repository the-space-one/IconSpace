import type { UnsentConfirmation, EmailDeliveryStatus } from "@/db/router";
import type { SendWaitlistConfirmationEmailResult } from "@/server/waitlist-email";

export type ResendRunStoppedReason =
  | "drained"
  | "batch_complete"
  | "budget_exhausted"
  | "quota_reached"
  | "missing_api_key"
  | "too_many_failures"
  | "no_database"
  | "already_running"
  | "lock_lost"
  | "status_update_failed"
  | "time_limit"
  | "day_changed";
export type ResendRunSummary = {
  candidates: number;
  planned: number;
  sent: number;
  skippedQuota: number;
  failed: number;
  remainingBudget: number;
  stoppedReason: ResendRunStoppedReason;
};
export type ResendRunOptions = {
  limit?: number;
  dryRun?: boolean;
  maxRuntimeMs?: number;
};
export type ResendConfig = {
  dailyCap: number;
  headroom: number;
  maxConsecutiveFailures: number;
};
export type ResendDependencies = {
  clientKeys: string[];
  configured: boolean;
  countSent: (key: string, at: Date) => Promise<number>;
  select: (key: string, limit: number) => Promise<UnsentConfirmation[]>;
  send: (email: string) => Promise<SendWaitlistConfirmationEmailResult>;
  update: (
    row: UnsentConfirmation,
    status: EmailDeliveryStatus,
    error?: string,
    sentAt?: Date,
  ) => Promise<boolean>;
  renewLease: () => Promise<boolean>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  preview?: (row: UnsentConfirmation) => void;
  // Recheck delivery immediately before a provider call (copies may change
  // after selection). False skips a recipient already confirmed elsewhere.
  shouldSend?: (row: UnsentConfirmation) => Promise<boolean>;
};

export function emptyResendSummary(
  stoppedReason: ResendRunStoppedReason,
): ResendRunSummary {
  return {
    candidates: 0,
    planned: 0,
    sent: 0,
    skippedQuota: 0,
    failed: 0,
    remainingBudget: 0,
    stoppedReason,
  };
}
export function readResendConfig(
  env: Record<string, string | undefined>,
): ResendConfig {
  const integer = (key: string, fallback: number, minimum = 0) => {
    const raw = env[key]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new Error(`Invalid ${key}; expected an integer >= ${minimum}.`);
    return value;
  };
  return {
    dailyCap: integer("RESEND_DAILY_CAP", 100),
    headroom: integer("RESEND_SEND_HEADROOM", 0),
    maxConsecutiveFailures: integer("RESEND_MAX_CONSECUTIVE_FAILURES", 5, 1),
  };
}

/** Injected I/O lets tests run without credentials, databases, or recipients. */
export async function runResendBatch(
  deps: ResendDependencies,
  config: ResendConfig,
  options: ResendRunOptions = {},
): Promise<ResendRunSummary> {
  const { dryRun = false, limit, maxRuntimeMs } = options;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 0))
    throw new Error("Invalid resend limit.");
  if (
    maxRuntimeMs !== undefined &&
    (!Number.isFinite(maxRuntimeMs) || maxRuntimeMs <= 0)
  )
    throw new Error("Invalid runtime limit.");
  const summary = emptyResendSummary("drained");
  const stop = (reason: ResendRunStoppedReason) => {
    summary.stoppedReason = reason;
    return summary;
  };
  const keys = [...new Set(deps.clientKeys)];
  if (!keys.length) return stop("no_database");
  if (!dryRun && !deps.configured) return stop("missing_api_key");
  const started = deps.now();
  const day = started.toISOString().slice(0, 10);
  const counts = await Promise.all(
    keys.map((key) => deps.countSent(key, started)),
  );
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0))
    throw new Error("Invalid sent count.");
  summary.remainingBudget = Math.min(
    limit ?? Infinity,
    Math.max(
      0,
      config.dailyCap -
        config.headroom -
        counts.reduce((sum, count) => sum + count, 0),
    ),
  );
  if (!summary.remainingBudget) return stop("budget_exhausted");
  // Merge before spending budget so older fallback rows cannot be starved.
  const batchSize = summary.remainingBudget + 1;
  const batches = await Promise.all(
    keys.map((key) => deps.select(key, batchSize)),
  );
  const rows = batches
    .flat()
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.targetKey.localeCompare(b.targetKey) ||
        a.id - b.id,
    );
  const truncated = batches.some((rows) => rows.length === batchSize);
  let failures = 0;
  let attempted = false;
  for (const row of rows) {
    if (dryRun) {
      if (summary.planned >= summary.remainingBudget)
        return stop("budget_exhausted");
      summary.candidates += 1;
      summary.planned += 1;
      deps.preview?.(row);
      continue;
    }
    if (!summary.remainingBudget) return stop("budget_exhausted");
    if (attempted) await deps.sleep(150); // below Resend's default 10 requests/s
    if (
      maxRuntimeMs &&
      deps.now().getTime() - started.getTime() >= maxRuntimeMs
    )
      return stop("time_limit");
    if (deps.now().toISOString().slice(0, 10) !== day)
      return stop("day_changed");
    if (!(await deps.renewLease())) return stop("lock_lost");
    if (deps.shouldSend && !(await deps.shouldSend(row))) continue;
    summary.candidates += 1;
    attempted = true;
    let result: SendWaitlistConfirmationEmailResult;
    try {
      result = await deps.send(row.email);
    } catch {
      summary.failed += 1;
      failures += 1;
      if (
        !(await deps.update(
          row,
          "failed",
          "Confirmation provider request failed.",
        ))
      )
        return stop("status_update_failed");
      if (failures >= config.maxConsecutiveFailures)
        return stop("too_many_failures");
      continue;
    }
    if (result.status === "skipped_config") return stop("missing_api_key");
    if (result.status === "skipped_quota") {
      summary.skippedQuota += 1;
      if (!(await deps.update(row, "skipped_quota", result.reason)))
        return stop("status_update_failed");
      return stop("quota_reached");
    }
    failures = 0;
    summary.sent += 1;
    summary.remainingBudget -= 1;
    // Never continue sending with an uncertain delivery ledger.
    if (!(await deps.update(row, "sent", undefined, deps.now())))
      return stop("status_update_failed");
  }
  if (
    (!dryRun && !summary.remainingBudget) ||
    (dryRun && summary.planned === summary.remainingBudget)
  )
    return stop("budget_exhausted");
  return stop(truncated || summary.failed > 0 ? "batch_complete" : "drained");
}
