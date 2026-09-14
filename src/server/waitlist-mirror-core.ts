/** Pure merge rules shared by the repair worker and offline verification. */
export type MirrorRow = {
  email: string;
  createdAt: Date;
  emailSendStatus: string;
  emailSendError: string | null;
  emailSentAt: Date | null;
  createdAtExact?: string;
  emailSentAtExact?: string | null;
};

export const STATUS_ORDER = [
  "pending",
  "skipped_config",
  "skipped_quota",
  "failed",
  "sent",
] as const;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const exactDate = (date: Date, exact?: string | null) =>
  exact ?? date.toISOString().replace(/(\.\d{3})Z$/, "$1000Z");

export function mergeMirrorRows(a: MirrorRow, b: MirrorRow): MirrorRow {
  if (normalizeEmail(a.email) !== normalizeEmail(b.email))
    throw new Error("Cannot merge different subscribers.");
  const rank = (row: MirrorRow) =>
    STATUS_ORDER.indexOf(row.emailSendStatus as (typeof STATUS_ORDER)[number]);
  const winner = rank(a) >= rank(b) ? a : b;
  const sent = winner.emailSendStatus === "sent";
  const sentDates = [a, b]
    .filter((row) => row.emailSendStatus === "sent")
    .flatMap((row) =>
      row.emailSentAt ? [exactDate(row.emailSentAt, row.emailSentAtExact)] : [],
    )
    .sort();
  const createdAtExact = [a, b]
    .map((row) => exactDate(row.createdAt, row.createdAtExact))
    .sort()[0];
  const errors = [a, b]
    .filter((row) => row.emailSendStatus === winner.emailSendStatus)
    .flatMap((row) => (row.emailSendError === null ? [] : [row.emailSendError]))
    .sort();
  return {
    email: normalizeEmail(a.email),
    createdAt: new Date(createdAtExact),
    createdAtExact,
    emailSendStatus: winner.emailSendStatus,
    emailSendError: sent ? null : (errors[0] ?? null),
    emailSentAt: sent && sentDates.length ? new Date(sentDates[0]) : null,
    emailSentAtExact: sent ? (sentDates[0] ?? null) : null,
  };
}

export function sameMirrorRow(a: MirrorRow, b: MirrorRow) {
  return (
    normalizeEmail(a.email) === normalizeEmail(b.email) &&
    exactDate(a.createdAt, a.createdAtExact) ===
      exactDate(b.createdAt, b.createdAtExact) &&
    a.emailSendStatus === b.emailSendStatus &&
    a.emailSendError === b.emailSendError &&
    (a.emailSentAt ? exactDate(a.emailSentAt, a.emailSentAtExact) : null) ===
      (b.emailSentAt ? exactDate(b.emailSentAt, b.emailSentAtExact) : null)
  );
}

export type MirrorCheckpoint = { afterId: number; ceilingId: number | null };
export type MirrorRecord = MirrorRow & { id: number };
export type MirrorDependencies = {
  keys: string[];
  checkpoint: (
    source: string,
    destination: string,
  ) => Promise<MirrorCheckpoint>;
  highWater: (source: string) => Promise<number>;
  page: (
    source: string,
    after: number,
    ceiling: number,
    limit: number,
  ) => Promise<MirrorRecord[]>;
  lookup: (destination: string, emails: string[]) => Promise<MirrorRow[]>;
  write: (destination: string, rows: MirrorRow[]) => Promise<number>;
  save: (
    source: string,
    destination: string,
    checkpoint: MirrorCheckpoint,
  ) => Promise<void>;
  now: () => number;
  onError?: (source: string, destination: string, error: unknown) => void;
};
export type MirrorOptions = {
  dryRun?: boolean;
  maxRuntimeMs?: number;
  maxBatches?: number;
};
export type MirrorSummary = {
  scanned: number;
  missing: number;
  different: number;
  written: number;
  completedPairs: number;
  totalPairs: number;
  failures: number;
  complete: boolean;
};

/** A full sweep revisits old statuses. Durable destination cursors allow safe
 * replay after any crash between writes and checkpointing. One page per pair
 * per round prevents a slow or unavailable mirror from monopolizing the run. */
export async function runMirrorSweep(
  deps: MirrorDependencies,
  options: MirrorOptions = {},
) {
  const summary: MirrorSummary = {
    scanned: 0,
    missing: 0,
    different: 0,
    written: 0,
    completedPairs: 0,
    totalPairs: 0,
    failures: 0,
    complete: false,
  };
  const keys = [...new Set(deps.keys)];
  const pairs = keys.flatMap((source) =>
    keys
      .filter((key) => key !== source)
      .map((destination) => ({
        source,
        destination,
        done: false,
        cursor: null as MirrorCheckpoint | null,
      })),
  );
  summary.totalPairs = pairs.length;
  const started = deps.now();
  let batches = 0;
  const outOfTime = () =>
    options.maxRuntimeMs !== undefined &&
    deps.now() - started >= options.maxRuntimeMs;
  while (pairs.some((pair) => !pair.done)) {
    for (const pair of pairs) {
      if (pair.done) continue;
      if (outOfTime() || batches >= (options.maxBatches ?? Infinity))
        return summary;
      batches += 1;
      try {
        pair.cursor ??= options.dryRun
          ? { afterId: 0, ceilingId: null }
          : await deps.checkpoint(pair.source, pair.destination);
        const ceiling =
          pair.cursor.ceilingId ?? (await deps.highWater(pair.source));
        const rows = await deps.page(
          pair.source,
          pair.cursor.afterId,
          ceiling,
          100,
        );
        const existing = new Map(
          (
            await deps.lookup(
              pair.destination,
              rows.map((row) => row.email),
            )
          ).map((row) => [normalizeEmail(row.email), row]),
        );
        summary.scanned += rows.length;
        for (const row of rows) {
          const other = existing.get(normalizeEmail(row.email));
          if (!other) summary.missing += 1;
          else if (!sameMirrorRow(other, mergeMirrorRows(other, row)))
            summary.different += 1;
        }
        // Upsert even apparently unchanged rows: the database decides atomically
        // whether anything changed, protecting against concurrent sends.
        if (!options.dryRun && rows.length)
          summary.written += await deps.write(pair.destination, rows);
        const done = rows.length < 100 || rows.at(-1)!.id >= ceiling;
        const next = done
          ? { afterId: 0, ceilingId: null }
          : {
              afterId: rows.at(-1)!.id,
              ceilingId: ceiling,
            };
        if (!options.dryRun)
          await deps.save(pair.source, pair.destination, next);
        pair.cursor = next;
        if (done) {
          pair.done = true;
          summary.completedPairs += 1;
        }
      } catch (error) {
        // No cursor advance on error. Other pairs may still make progress.
        pair.done = true;
        summary.failures += 1;
        deps.onError?.(pair.source, pair.destination, error);
      }
    }
  }
  summary.complete = summary.completedPairs === summary.totalPairs;
  return summary;
}
