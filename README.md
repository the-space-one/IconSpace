# Icon Space waitlist

Next.js App Router landing page with animated icons, a signup form, Neon/Postgres
subscriber storage, Resend confirmations, and scheduled email retries and
database mirroring. This is **Icon-Waitlist**, not `iconspace-research`.

## Deploying in a friend's Vercel Pro team

**Yes: the application can run in another Vercel team without moving its data.**
Use the same existing Neon database URLs and Resend account. The databases and
email provider are external services, not files inside the old deployment.
Vercel Pro does not change their plans or increase the Resend email allowance.

The actual workflow is **push the complete code → import into the friend's Pro
team → configure environment variables/build settings → deploy → verify**.
`git clone` by itself only downloads code; it does not publish a website.

### 1. Publish the complete version

- Review, commit and push all intended changes before the friend clones/imports.
  Local modified and untracked files are **not** included by `git clone`.
- Include the mirror worker, cron route, scripts, tests, Drizzle migration,
  runbooks, `.env.example`, `package.json`, and `vercel.json` from the mirroring
  change. A clone with only the old failover router will not mirror signups.
- Never commit `.env`, `.env.local`, credentials, or `.vercel/`. Share secrets
  through a trusted secret-sharing channel, not README, Git, or screenshots.
- Makenfy/Froundy WOFF2 files in `src/app/fonts/` and the artwork in `public/`
  are already tracked. No fonts installed on the friend's computer are needed.

### 2. Create the Vercel project

In the friend's **Pro team** (not their personal Hobby scope), import the Git
repository using **Add New → Project**. Give the Vercel Git integration access
to the repository. Confirm the intended production branch. Check team/commit
author authorization if automatic Git deployments are blocked.

Use these project settings:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root Directory | Repository root containing this README and `package.json` |
| Node.js | `22.x` (the locally verified major version) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Keep the Next.js framework default |

Explicitly use npm: this repo also contains a historical `bun.lock`; do not rely
on package-manager detection choosing the tested install path. Keep
`package-lock.json` committed. Do not configure this app as a static export or
use `npm run dev` as a production command; its API routes need server functions.

A local clone is optional when using Vercel's Git import. If deploying from a
clone with the Vercel CLI, authenticate as the friend, link to the new project
in the correct team, configure its Production variables, then deploy with
`vercel --prod`. Do not copy the old project's `.vercel` directory.

References: [Vercel Git deployment](https://vercel.com/docs/git),
[deployment overview](https://vercel.com/docs/deployments/overview),
[Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

### 3. Configure Production environment variables

[`.env.example`](.env.example) lists every supported variable and default. Use
actual existing credentials, not the template placeholders. For the complete
current feature set, configure:

| Variable | Migration action |
| --- | --- |
| `PRIMARY_DATABASE_URL` | Existing primary Neon connection string; legacy `DATABASE_URL` is also accepted |
| `FALLBACK_DATABASE_URLS` | Existing backup/mirror Neon URL(s), comma-separated; required to retain mirroring |
| `RESEND_API_KEY` | Key from the existing Resend account |
| `RESEND_FROM_EMAIL` | Existing verified sender; do not use the shared test sender for public signups |
| `RESEND_FROM_NAME` | Keep the brand, normally `Icon Space` |
| `RESEND_REPLY_TO_EMAIL` | Preserve if currently configured |
| `CRON_SECRET` | New random secret of at least 16 characters; both cron routes use it |
| `NEXT_PUBLIC_SITE_URL` | Final public origin, e.g. `https://your-domain.example`, without trailing slash; used for email logo URLs |
| `RESEND_DAILY_CAP` | Preserve the intended Resend budget; default `100`, not raised by Vercel Pro |
| `RESEND_SEND_HEADROOM` | Preserve if used; default `0` |

Optional settings to copy if used:

- `REDIS_URL`, `RESEND_LOCK_KEY`, and `RATE_LIMIT_*`: Redis supplies signup rate
  limiting and a distributed email-worker lock. Mirroring does not require it.
  Without Redis, signup rate limiting defaults to fail-open and the email lock
  only protects one process. Do not overlap manual resend runs with the cron.
- `WAITLIST_SHEET_WEBHOOK_URL`, `WAITLIST_SHEET_WEBHOOK_SECRET`, and
  `WAITLIST_SHEET_TIMEOUT_MS`: keep these to retain the Google Sheets copy.
- `DB_FAILOVER_COOLDOWN_MS`, `DB_WRITE_RETRIES`,
  `RESEND_MAX_CONSECUTIVE_FAILURES`: preserve any deliberate overrides.
- `ALLOWED_ORIGINS`: normally leave empty for the same-site form/API. Set only
  if a deliberately separate frontend needs access; it is not needed merely
  because the Vercel hostname changed.

Keep production DB/email credentials out of **Preview** and **Development**;
use separate test databases and omit the email key there unless intentionally
testing with a controlled recipient. Preview signup routes can still write/send
if given real credentials, even though scheduled crons run in production.

Set variables before the production build. If any variable or the public site
URL changes afterward, redeploy; editing settings does not change an existing
deployment. Only public, non-secret values may use a `NEXT_PUBLIC_` prefix.
See [Vercel environment variables](https://vercel.com/docs/environment-variables).

### 4. Database preparation: existing versus brand-new databases

**Reusing our existing Neon databases:** no data export/import is needed for a
Vercel account change. The subscriber tables already exist, and checkpoint
tables were initialized in both locally configured databases on 2026-09-14.
This is historical setup information, not proof the friend's URLs are correct.
Verify them before running commands.

On a trusted machine, from the new checkout with the intended credentials in
`.env.local` (or the process environment):

```sh
npm ci
npm run db:mirror -- --dry-run
# Additive/idempotent checkpoint setup, only if needed:
npm run db:mirror -- --setup
```

**Using brand-new Neon databases instead:** a clone/build does not create tables.
Provision the schema on each new database first. `db:migrate` targets only
`PRIMARY_DATABASE_URL` (or `DATABASE_URL`); explicitly target each new database
when provisioning. `db:mirror -- --setup` only creates checkpoint tables, not
subscriber tables. Do not replay the initial create-table migration or use a
destructive schema reset against the populated databases.

See the [mirroring runbook](docs/database-mirroring.md) for schema requirements,
merge rules, timestamps, retry behavior, and the backfill procedure.

### 5. Cut over without two production email workers

1. Disable the **old project's Cron Jobs** before enabling the new production
   deployment. Stop any manual resend CLI runs too.
2. For this planned downtime, pause/disable the old application as well so its
   old URL cannot keep accepting signups. Removing a custom domain or
   disconnecting Git alone is not a shutdown of the old deployed application.
   Verify the old endpoint is inactive; wait for in-flight jobs to finish.
3. Deploy the new replica-aware version in the friend's Pro team. Configure or
   move the custom domain to that project and follow Vercel's DNS/ownership
   verification prompts. Check HTTPS and update `NEXT_PUBLIC_SITE_URL` if needed.
4. Keep the old deployment/cron inactive. Do not delete the shared Neon databases,
   Resend account, or Sheets webhook when retiring the old Vercel project.
5. After the new version is deployed and old workers have stopped, backfill:

   ```sh
   npm run db:mirror -- --apply
   npm run db:mirror -- --dry-run
   ```

   These commands copy data but send no emails. A quiet, reconciled audit should
   show zero missing/different copies. Alternatively, let the new repair cron
   perform the backfill. Do not run an old resend script against mirrored data.

Disabling cron scheduling is separate from stopping the app. Changing/removing
old environment variables is also not enough to alter an already deployed
function. Do not rely on sharing `CRON_SECRET` to coordinate deployments: it
authenticates requests; it is not a lock. Vercel exposes cron controls under
[project Settings → Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

If you prefer moving the existing Vercel project instead of recreating it,
[project transfer](https://vercel.com/docs/projects/transferring-projects) is a
separate option with team permissions and integration checks. It is not what a
Git clone does. No project transfer or shutdown is performed by this README.

### 6. Verify before calling the migration complete

- Confirm Vercel deployed the intended commit and reports a successful build.
- Visit the public URL without being logged into Vercel; the landing page and
  email logo asset must not require team authentication.
- Make one deliberate signup with an inbox you control. This sends a real
  confirmation if configured. Verify one subscriber in each database and a
  consistent `sent` status. Retry the same email: it should not send another.
- Check the two production cron entries from `vercel.json`:
  - `/api/cron/mirror-waitlist`: daily **07:00 UTC / 12:30 India**.
  - `/api/cron/resend-confirmations`: daily **08:00 UTC / 13:30 India**.
- Confirm `CRON_SECRET` is configured and inspect the first run's logs:
  `waitlist_mirror_complete` and `resend_cron_complete`. An unauthenticated GET
  should return 401 and HEAD 405; don't share the secret to test this.
- A manual **Run** of the email cron sends real pending confirmations; it is
  not a dry-run. Preview safely with:

  ```sh
  npm run email:resend-pending -- --dry-run
  ```

- Keep the old project stopped. A rollback must also disable new workers before
  re-enabling an old deployment, and must retain replica-aware email code.

## Local development and checks

Use Node 22.x and npm. Create `.env.local` from the variable template, configure
test services, then run:

```sh
npm ci
npm run dev
```

The app is at `http://localhost:3000`. `npm run email` opens the email-template
preview on port 3001. Local development does not schedule the Vercel cron jobs.

```sh
npm run test:mirror
npm run test:resend
npx tsc --noEmit
npm run build
```

The two test suites use offline fixtures/mocked email delivery, not production
subscribers. The optional real-SQL test creates its own local PostgreSQL cluster:

```sh
# Requires local initdb, pg_ctl and psql; never uses production DB URLs.
MIRROR_TEST_POSTGRES=1 npm run test:mirror:postgres
```

## Context for the next developer or coding agent

Read `AGENTS.md` first, including its requirement to consult the installed
Next.js guides before code changes. Do not assume this repo is the separate
research project, or that a live deployment matches this checkout.

| Area | Entry points |
| --- | --- |
| Hero, fonts, page | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` |
| Signup and immediate confirmation | `src/app/api/waitlist/route.ts`, `src/server/waitlist-email.ts` |
| DB schema and primary-first failover | `src/db/schema.ts`, `src/db/index.ts`, `src/db/router.ts` |
| Atomic mirroring and resumable repair | `src/db/mirror.ts`, `src/server/waitlist-mirror*.ts` |
| Replica-aware email eligibility/budget | `src/db/replica-delivery.ts`, `src/server/replica-delivery-core.ts` |
| Resend worker and optional lock | `src/server/resend-confirmations*.ts`, `src/server/resend-lock.ts` |
| Cron endpoints and schedule | `src/app/api/cron/`, `vercel.json` |
| Operations | [Mirroring](docs/database-mirroring.md), [email retries](docs/resend-confirmations.md), `.env.example` |

Important invariants:

- A saved signup must not fail just because a mirror or email provider is down.
- Email is the cross-database identity; serial IDs can differ. Any `sent` copy
  suppresses another confirmation. Unknown replica history defers sending.
- Mirrors are eventual, bidirectional copies, not point-in-time backups.
  `after()` is a fast path; repeated durable sweeps repair missed copies.
- Never add physical mirror counts to the public subscriber count or daily
  email budget. The public count reads primary only; delivery counts deduplicate.
- No Redis is required for mirroring. Exactly-once email delivery across a
  provider call and a failed database write is not guaranteed; read the resend
  runbook before retrying ambiguous failures.
- Never log credentials or full subscriber addresses. Do not test real sends,
  run a backfill, deploy, shut down services, or reset databases without the
  owner's authorization and verification of the exact target environment.
