# Mirrored waitlist: implementation and rollout plan

## Contract

`PRIMARY_DATABASE_URL` remains the preferred signup destination. The existing
`FALLBACK_DATABASE_URLS` become both failover destinations and asynchronous
mirrors. No Redis service or new dependency is required for replication.

This is an eventual, bidirectional copy of subscriber data, not a transactional
replica or point-in-time backup. A signup acknowledged by one database survives
a temporary failure of another; there is still a vulnerability window until its
copy succeeds. Deletions are deliberately NOT propagated. Keep provider backups
for accidental deletion recovery; coordinate erasure across all copies.

## Implementation sequence

1. Use normalized email, not database-local serial IDs, as shared identity.
   Preserve the earliest signup time. `sent` always wins over an unsent state;
   preserve delivery timestamps. Merge other statuses deterministically rather
   than letting repeated scans flip them. Never copy IDs or reset sequences.
2. Add idempotent, atomic per-row/batch PostgreSQL upserts. A stale mirror must
   never downgrade a concurrently sent row. Repeated copies must be safe.
3. Mirror the saved subscriber after the signup response, including repeat
   signups. Read current source data after delivery bookkeeping. Log failures
   without exposing emails, URLs, credentials, or failing an accepted signup.
4. Add a separate protected daily repair cron and a no-email CLI. Walk every
   source→destination pair in keyset-paginated batches. Store checkpoints in the
   destination database, advancing only after the whole batch is copied. Capture
   a source high-water ID for each sweep; reset at the end to revisit old rows
   whose delivery status changed or whose prior fast-path copy failed. Crashes
   replay safely. Bound work and rotate pairs so one outage cannot starve others.
5. Backfill uses the same repair path. Dry-run reads only (including when the
   checkpoint table is not installed), reports aggregate missing/different rows,
   and never sends mail. Apply resumes checkpoints until a sweep completes.
6. Make delivery replica-aware BEFORE enabling copying: count distinct sent
   emails once, deduplicate candidates, exclude any recipient marked sent in
   any database, and recheck immediately before sending. Read failures stop
   sending; live signups remain saved and wait for a later retry. After a send,
   persist the source status first and copy it to other databases. Existing
   provider idempotency keys and optional Redis resend lock stay in place.
7. Add offline regression tests for merge rules, mixed-case identity, retries,
   checkpoint recovery, interrupted sweeps, status changes behind the cursor,
   mirroring failures, sent/unsent conflicts, unique budgets and repeat runs.
   Run targeted lint, TypeScript, tests and production build.

## Rollout order (important)

1. Verify Production URLs name the intended databases. Do not print secrets.
2. Install the additive checkpoint table on each configured database using
   `npm run db:mirror -- --setup`. Existing subscriber tables and their
   case-insensitive unique indexes must already exist. This does not copy rows.
3. Deploy the new replica-aware email worker and signup handler before backfill.
   Do not run an old resend CLI against mirrored databases. No deployment is
   performed implicitly by local implementation/testing.
4. Preview with `npm run db:mirror -- --dry-run` (no writes or mail).
5. Copy with `npm run db:mirror -- --apply`; repeat if the report is incomplete.
6. Run another dry-run: missing/different counts should reach zero when signups
   and sends are quiet. Inspect both Neon tables; IDs may differ intentionally.
7. Verify both cron entries are registered after deployment and monitor
   `waitlist_mirror_complete` / `waitlist_mirror_error`. Nonzero failures return
   HTTP 503. `CRON_SECRET` protects both jobs; no URLs/secrets in query strings.

The repair schedule is **07:00 UTC / 12:30 India**, followed by email retries
at **08:00 UTC / 13:30 India**. Email safety does not depend on repair finishing
first: the sender always checks all physical copies.

## Commands and verification

```sh
npm run db:mirror -- --help
npm run db:mirror -- --dry-run
# After verifying URLs and deploying the replica-aware sender:
npm run db:mirror -- --setup
npm run db:mirror -- --apply
npm run db:mirror -- --dry-run

npm run test:mirror
npm run test:resend
# Optional real SQL tests: requires local initdb, pg_ctl and psql.
# Creates its OWN temporary PostgreSQL cluster; never uses your database URLs.
MIRROR_TEST_POSTGRES=1 npm run test:mirror:postgres
npx tsc --noEmit
npm run build
```

`scanned`, `missing` and `different` count source→destination comparisons, not
unique subscribers. `written` counts rows actually inserted/updated. With two
databases, two completed pairs mean primary→fallback and fallback→primary.
`complete: false` without failures means the bounded cron will resume its
persisted cursor on the next run. Run the CLI for faster completion. An apply
pass can change rows a previously processed pair did not yet see; repeat the
dry-run/apply until the audit is clean (especially with three or more mirrors).

`--setup` only creates `waitlist_mirror_checkpoints`, idempotently, on all
configured databases. The same additive table is tracked in Drizzle migration
`0001_mean_tigra.sql`. Do not replay the initial subscriber-table migration on an
already provisioned production database. The CLI intentionally requires exactly
one explicit mode; an accidental bare invocation does not write anything.

Conflict policy: normalized email is the identity; earliest signup timestamp
wins; sent beats failed, skipped-quota, skipped-config, pending (in that order).
For equal non-sent states, a deterministic error string wins. These diagnostics
are not a chronological attempt log. Once any copy is sent, all copies converge
to sent with no error and the earliest known delivery timestamp. Original
PostgreSQL timestamp precision is preserved; serial ID gaps are normal.

## Implementation verification (2026-09-14)

- Read-only audit of the two locally configured Neon databases: two missing
  copies, zero divergent existing copies, zero failures, zero subscriber writes.
  Both databases passed the case-insensitive unique-index readiness check.
- Added the checkpoint table to both configured databases via `--setup`.
  No subscriber backfill or real email send was executed.
- Email dry-run: zero pending recipients, two unique confirmations already
  sent today, remaining configured daily allowance 98.
- 17 mirror tests, 23 existing email/resend tests, and the opt-in isolated
  PostgreSQL integration test pass. The SQL test exercises all 25 status pairs,
  case-insensitive collisions, no-op retries and microsecond timestamps.
- Targeted ESLint, standalone TypeScript, production build and diff whitespace
  checks pass. The served production build rejects unauthenticated mirror GET
  with 401 and HEAD with 405, both no-store, without doing any database writes.
- Vercel Doctor reported no cost issues in the changed files it scanned.
- Code has not been committed, pushed, or deployed by this implementation.
  Deploy first; then apply the backfill or allow the daily repair cron to do it.

## Safety and limits

- Mirroring sends NO emails. Tests send NO real mail and use no production rows.
- Do not assume `after()` is a durable queue. The persisted subscriber rows and
  resumable repeated sweeps are the repair mechanism if post-response work dies.
- A database outage delays confirmations because its delivery history is
  unknown; signup failover still accepts subscribers. This is intentional.
- Cross-database transactions and exactly-once provider delivery are not
  promised. Simultaneous senders still rely on the existing provider idempotency
  window (24 hours) and optional shared Redis lock. An accepted email with no
  successfully saved delivery status requires operator reconciliation.
- Background recovery is daily, not instantaneous. At larger scale increase
  the schedule on a supported plan or run the resumable CLI more frequently.
- A full repair sweep revisits existing rows, trading database reads for simple
  recovery without triggers or a separate queue. Batches are bounded and
  unchanged rows are not rewritten. This is intended for this small waitlist.
- The public count still reads the primary only; copies are never added to it.

Implementation references: [PostgreSQL atomic upserts](https://www.postgresql.org/docs/current/sql-insert.html),
[Vercel cron operation](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and
the installed Next.js `after` documentation in `node_modules/next/dist/docs/`.
