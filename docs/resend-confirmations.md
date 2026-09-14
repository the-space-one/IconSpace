# Automatic confirmation-email retries

The daily job sends confirmations previously marked `pending`, `failed`,
`skipped_quota`, or `skipped_config`. It does not send a marketing campaign or
repeat rows already marked `sent`. The existing signup and Sheets backup paths
remain in place. Welcome-email content is left-aligned in its 440px container.

The Neon fallback URLs now also act as asynchronous mirrors. Follow the
[mirroring rollout order](database-mirroring.md): deploy this replica-aware
sender **before** copying records or enabling the repair cron.

## Enable in production (one-time setup)

1. In the existing Vercel project's **Production** environment, configure
   `CRON_SECRET` with a random value of at least 16 characters. Keep it secret;
   never use a `NEXT_PUBLIC_` prefix or put it in a URL.
2. Confirm `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL`, and the primary and
   fallback database URLs point to the intended production account/databases.
   Set `NEXT_PUBLIC_SITE_URL` to the public production origin for the email logo.
3. Configure `REDIS_URL` for the distributed lock. Cron and CLI must use the same
   `RESEND_LOCK_KEY` and Redis instance. The default key is
   `iconspace:resend-confirmations:lock`. Without Redis, protection is only within
   one process: don't overlap CLI runs or run the same job from multiple projects.
4. Deploy this repository to Vercel. `vercel.json` registers the protected GET
   `/api/cron/resend-confirmations` daily at **08:00 UTC / 13:30 Asia/Kolkata**.
   The local dev server does not schedule jobs. A code change alone does not
   activate the cron; environment changes also need a deployment.
5. Check **Settings → Cron Jobs** and the first scheduled run's function logs.
   `resend_cron_complete` contains aggregate counts only. Configuration, database,
   delivery-bookkeeping, and repeated-provider failures return non-2xx responses.
   Vercel does not automatically retry failed cron invocations; the next daily
   run revisits rows still unsent. Inspect failures rather than assuming delivery.

No deployment, production secret changes, or real email sends are performed by
the regression tests below.

## Budget configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `RESEND_DAILY_CAP` | `100` | Application's daily sending allowance; `0` pauses sends |
| `RESEND_SEND_HEADROOM` | `0` | Capacity left for live signups/other provider traffic |
| `RESEND_MAX_CONSECUTIVE_FAILURES` | `5` | Abort after this many consecutive send errors |

Blank/unset values use defaults; invalid, negative, or fractional values are
rejected. The failure threshold must be at least 1.

Budget = max(0, daily cap − headroom − distinct sent-today emails across all configured DBs).
Two physical copies of one subscriber count once, not twice.
The day is UTC, counted using `email_sent_at`. `--limit=N` lowers the run budget;
it **never bypasses** the daily cap or makes a Free account send faster.

Counts only cover this app's persisted confirmations. Live signups, other apps,
received email, and a provider-accepted message whose status write failed can
make provider usage higher. The provider's own quota remains authoritative; a
quota/rate response stops the run. Monthly quota exhaustion also stops safely,
but is not pre-counted locally. Reserve headroom when sharing the account.

## Manual use

```sh
npm run email:resend-pending -- --help
npm run email:resend-pending -- --dry-run
npm run email:resend-pending -- --dry-run --limit=5
# The following sends REAL emails to the oldest unsent subscribers:
npm run email:resend-pending -- --limit=5
```

The CLI loads `.env.local` before `.env`, without overriding existing environment
variables. Verify the target environment before using it. Dry run only reads the
databases: no provider requests, Redis locks, or status updates. It prints IDs
and source roles, not recipients. `planned` is the simulated send count;
`remainingBudget` stays unchanged in a dry run. The CLI has no run-time cap.

## Ordering, safety, and recovery

- Candidates from every DB are merged by `created_at`, with deterministic ties,
  and deduplicated by normalized email. A `sent` record on ANY database excludes
  that recipient, even when another copy is still `pending`. Selection paginates
  past stale copies so they cannot block later eligible recipients. Delivery
  history is rechecked immediately before sending; an unavailable replica stops
  the run. Live signups remain saved but defer sending while history is unknown.
  Failed rows don't silently starve older fallback signups. Bounded batches avoid
  loading the whole table; `batch_complete` means unsent work may still remain.
- Successful sends persist `sent` and `email_sent_at` on the row's original DB.
  Then an awaited best-effort mirror copies the status; the repair cron catches
  missed copies. Re-runs skip sent emails across all databases. A concurrent
  stale mirror update cannot downgrade a sent row.
- Transient DB reads/status writes retry; a failed count aborts instead of being
  treated as zero. Status-write failure stops sending immediately.
- Redis uses an owned expiring lock, renewed before sends and released only by
  its owner. If configured Redis is unavailable, the run fails closed. A stale
  lock expires after 10 minutes. `already_running` is a harmless skipped run.
- Signup and resend use the same opaque per-recipient Resend idempotency key.
  **Provider deduplication lasts 24 hours, not forever.** Exactly-once delivery
  across a provider send and a DB write cannot be guaranteed without a durable
  delivery ledger. On `status_update_failed`, reconcile provider logs with the
  row before retrying after 24 hours; use `RESEND_DAILY_CAP=0` to pause if needed.
  A changed email payload inside that window may cause an idempotency conflict.
- Requests are spaced by at least 150ms. Provider requests time out after 20s.
  The cron stops starting new sends after 180s to leave room within its 300s
  Vercel duration for the active request and DB retries. Remaining rows wait.
- `HEAD` never executes the job. GET requires the exact secret bearer header;
  responses are `no-store` and never include database/provider error messages.

## Verification

```sh
npm run test:resend
npx tsc --noEmit
npm run build
```

Tests use in-memory rows and a mocked provider, including the real template
render: dry runs, defaults, global ordering, quota/headroom/limit, UTC rollover,
failure breaker/reset, repeat-run no-op, failed status writes, lock loss,
deadline, strict CLI parsing, auth, and opaque provider retry keys. The old
`_resend-verify.ts` now runs this safe suite; it no longer inserts/deletes rows
or drains real subscribers. Do not run real-send tests against the production
backlog; use a separate database and a recipient inbox you control.

References: [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs),
[Resend limits](https://resend.com/docs/api-reference/rate-limit),
[Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys).
