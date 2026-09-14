import {
  asc,
  eq,
  gt,
  lte,
  and,
  max,
  sql,
  inArray,
  getTableColumns,
} from "drizzle-orm";
import {
  getDbClients,
  getSafeErrorSummary,
  withDbRetries,
  type DbClientRef,
} from "./router";
import { waitlistSubscribers, waitlistMirrorCheckpoints } from "./schema";
import {
  normalizeEmail,
  STATUS_ORDER,
  type MirrorRow,
} from "@/server/waitlist-mirror-core";

const mirrorColumns = {
  ...getTableColumns(waitlistSubscribers),
  createdAtExact: sql<string>`to_char(${waitlistSubscribers.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  emailSentAtExact: sql<
    string | null
  >`to_char(${waitlistSubscribers.emailSentAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
};

export function allDbTargets() {
  const { primary, fallbacks } = getDbClients();
  return [primary, ...fallbacks].filter((target) => target !== null);
}

export async function lookupMirrorRows(target: DbClientRef, emails: string[]) {
  if (!emails.length) return [];
  return withDbRetries(() =>
    target.db
      .select(mirrorColumns)
      .from(waitlistSubscribers)
      .where(
        inArray(
          sql`lower(${waitlistSubscribers.email})`,
          emails.map(normalizeEmail),
        ),
      ),
  );
}

/** All SQL identifiers are static. All subscriber values are parameters.
 * The conflict target matches the existing case-insensitive unique index.
 * Merge inside ON CONFLICT, not a stale JavaScript read/modify/write. */
export function mirrorUpsertSql(rows: MirrorRow[]) {
  if (!rows.length) throw new Error("Empty mirror batch.");
  const values = sql.join(
    rows.map(
      (row) => sql`(
    ${normalizeEmail(row.email)}, ${row.createdAtExact ?? row.createdAt.toISOString()}::timestamptz,
    ${row.emailSendStatus}, ${row.emailSendError}, ${row.emailSentAtExact ?? row.emailSentAt?.toISOString() ?? null}::timestamptz
  )`,
    ),
    sql`, `,
  );
  const ranks = sql`ARRAY[${sql.join(
    STATUS_ORDER.map((status) => sql`${status}`),
    sql`, `,
  )}]::text[]`;
  const incomingWins = sql`array_position(${ranks}, excluded.email_send_status) > array_position(${ranks}, current.email_send_status)`;
  const status = sql`CASE WHEN ${incomingWins} THEN excluded.email_send_status ELSE current.email_send_status END`;
  const sent = sql`(current.email_send_status = 'sent' OR excluded.email_send_status = 'sent')`;
  const sentAt = sql`CASE WHEN ${sent} THEN LEAST(
    CASE WHEN current.email_send_status = 'sent' THEN current.email_sent_at END,
    CASE WHEN excluded.email_send_status = 'sent' THEN excluded.email_sent_at END
  ) ELSE NULL END`;
  const error = sql`CASE WHEN ${sent} THEN NULL
    WHEN current.email_send_status = excluded.email_send_status THEN LEAST(current.email_send_error COLLATE "C", excluded.email_send_error COLLATE "C")
    WHEN ${incomingWins} THEN excluded.email_send_error ELSE current.email_send_error END`;
  const createdAt = sql`LEAST(current.created_at, excluded.created_at)`;
  return sql`INSERT INTO waitlist_subscribers AS current
    (email, created_at, email_send_status, email_send_error, email_sent_at)
    VALUES ${values}
    ON CONFLICT (lower(email)) DO UPDATE SET
      created_at = ${createdAt}, email_send_status = ${status},
      email_send_error = ${error}, email_sent_at = ${sentAt}
    WHERE (current.created_at, current.email_send_status, current.email_send_error, current.email_sent_at)
      IS DISTINCT FROM (${createdAt}, ${status}, ${error}, ${sentAt})
    RETURNING id`;
}

export async function writeMirrorRows(target: DbClientRef, rows: MirrorRow[]) {
  if (!rows.length) return 0;
  const result = await withDbRetries(() =>
    target.db.execute(mirrorUpsertSql(rows)),
  );
  return result.rows.length;
}

/** Read-only readiness check: a manually created table may lack the expression
 * index even when its visible columns look identical in the Neon dashboard. */
export async function validateMirrorTarget(target: DbClientRef) {
  const result = await withDbRetries(() =>
    target.db.execute(sql`
    SELECT count(*)::int AS valid FROM pg_index
    WHERE indrelid = to_regclass('waitlist_subscribers')
      AND indisunique AND indisvalid AND indpred IS NULL AND indnkeyatts = 1
      AND pg_get_indexdef(indexrelid, 1, true) = 'lower(email)'
  `),
  );
  if (Number(result.rows[0]?.valid ?? 0) < 1) {
    const error = new Error("Missing case-insensitive waitlist unique index.");
    Object.assign(error, { code: "MIRROR_UNIQUE_INDEX_MISSING" });
    throw error;
  }
}

export function mirrorDbDependencies() {
  const targets = new Map(allDbTargets().map((target) => [target.key, target]));
  const target = (key: string) => targets.get(key)!;
  const validations = new Map<string, Promise<void>>();
  const validate = (key: string) => {
    if (!validations.has(key))
      validations.set(key, validateMirrorTarget(target(key)));
    return validations.get(key)!;
  };
  return {
    keys: [...targets.keys()],
    checkpoint: async (source: string, destination: string) => {
      const [row] = await withDbRetries(() =>
        target(destination)
          .db.select()
          .from(waitlistMirrorCheckpoints)
          .where(eq(waitlistMirrorCheckpoints.sourceKey, source)),
      );
      return row
        ? { afterId: row.afterId, ceilingId: row.ceilingId }
        : { afterId: 0, ceilingId: null };
    },
    highWater: async (source: string) => {
      const [row] = await withDbRetries(() =>
        target(source)
          .db.select({ id: max(waitlistSubscribers.id) })
          .from(waitlistSubscribers),
      );
      return row?.id ?? 0;
    },
    page: async (
      source: string,
      after: number,
      ceiling: number,
      limit: number,
    ) => {
      await validate(source);
      return withDbRetries(() =>
        target(source)
          .db.select(mirrorColumns)
          .from(waitlistSubscribers)
          .where(
            and(
              gt(waitlistSubscribers.id, after),
              lte(waitlistSubscribers.id, ceiling),
            ),
          )
          .orderBy(asc(waitlistSubscribers.id))
          .limit(limit),
      );
    },
    lookup: async (destination: string, emails: string[]) => {
      await validate(destination);
      return lookupMirrorRows(target(destination), emails);
    },
    write: (destination: string, rows: MirrorRow[]) =>
      writeMirrorRows(target(destination), rows),
    save: async (
      source: string,
      destination: string,
      cursor: { afterId: number; ceilingId: number | null },
    ) => {
      await withDbRetries(() =>
        target(destination)
          .db.insert(waitlistMirrorCheckpoints)
          .values({ sourceKey: source, ...cursor })
          .onConflictDoUpdate({
            target: waitlistMirrorCheckpoints.sourceKey,
            set: { ...cursor, updatedAt: new Date() },
          }),
      );
    },
    now: () => Date.now(),
    onError: (source: string, destination: string, error: unknown) => {
      console.error("waitlist_mirror_pair_error", {
        source: target(source).label,
        destination: target(destination).label,
        error: getSafeErrorSummary(error),
      });
    },
  };
}

/** Explicit additive setup only; never called by signup, cron, or dry run. */
export async function setupMirrorCheckpoints() {
  const targets = allDbTargets();
  if (!targets.length) throw new Error("No database configured.");
  await Promise.all(targets.map(validateMirrorTarget));
  for (const target of targets) {
    await target.db
      .execute(sql`CREATE TABLE IF NOT EXISTS waitlist_mirror_checkpoints (
      source_key text PRIMARY KEY,
      after_id integer NOT NULL DEFAULT 0,
      ceiling_id integer,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  return { configuredDatabases: targets.length };
}
