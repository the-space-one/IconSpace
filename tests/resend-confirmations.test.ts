import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyResendSummary,
  readResendConfig,
  runResendBatch,
  type ResendDependencies,
} from "../src/server/resend-confirmations-core";
import { createResendCronHandler } from "../src/server/resend-cron";
import { parseResendArgs } from "../scripts/resend-cli-options";
import { createResendLeaseManager } from "../src/server/resend-lock";
import type { UnsentConfirmation } from "../src/db/router";

const config = { dailyCap: 100, headroom: 0, maxConsecutiveFailures: 5 };
function fixture(count = 3) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    email: `test-${i}@example.invalid`,
    targetKey: "primary",
    createdAt: new Date(Date.UTC(2026, 8, 10, 0, 0, i)),
  }));
  const sent = new Set<number>();
  const sends: string[] = [];
  const updates: Array<{
    id: number;
    target: string;
    status: string;
    sentAt?: Date;
  }> = [];
  const sleeps: number[] = [];
  const previews: number[] = [];
  let time = Date.UTC(2026, 8, 14, 8);
  const deps: ResendDependencies = {
    clientKeys: ["primary"],
    configured: true,
    countSent: async () => sent.size,
    select: async (key, limit) =>
      rows
        .filter((row) => row.targetKey === key && !sent.has(row.id))
        .slice(0, limit),
    send: async (email) => {
      sends.push(email);
      return { status: "sent", from: "test", to: email, providerId: "test-id" };
    },
    update: async (row, status, _error, sentAt) => {
      updates.push({ id: row.id, target: row.targetKey, status, sentAt });
      if (status === "sent") sent.add(row.id);
      return true;
    },
    now: () => new Date(time),
    sleep: async (ms) => {
      sleeps.push(ms);
      time += ms;
    },
    renewLease: async () => true,
    preview: (row) => {
      previews.push(row.id);
    },
  };
  return {
    deps,
    rows,
    sends,
    updates,
    sleeps,
    previews,
    setTime: (value: number) => {
      time = value;
    },
  };
}

test("unset and blank env use the 100/day defaults; zero is intentional", () => {
  assert.deepEqual(readResendConfig({}), config);
  assert.deepEqual(readResendConfig({ RESEND_DAILY_CAP: " " }), config);
  assert.equal(readResendConfig({ RESEND_DAILY_CAP: "0" }).dailyCap, 0);
  for (const value of ["NaN", "Infinity", "-1", "1.5"]) {
    assert.throws(() => readResendConfig({ RESEND_DAILY_CAP: value }));
  }
  assert.throws(() =>
    readResendConfig({ RESEND_MAX_CONSECUTIVE_FAILURES: "0" }),
  );
});

test("dry-run previews only, leaves statuses and available budget unchanged", async () => {
  const f = fixture();
  const summary = await runResendBatch(f.deps, config, { dryRun: true });
  assert.equal(summary.planned, 3);
  assert.equal(summary.sent, 0);
  assert.equal(summary.remainingBudget, 100);
  assert.equal(summary.stoppedReason, "drained");
  assert.deepEqual(f.previews, [1, 2, 3]);
  assert.deepEqual(f.sends, []);
  assert.deepEqual(f.updates, []);
});

test("global oldest-first order across primary and fallback, correct target updates", async () => {
  const f = fixture();
  f.rows[0].targetKey = "fallback";
  f.deps.clientKeys = ["primary", "fallback", "fallback"];
  const summary = await runResendBatch(f.deps, config, { limit: 1 });
  assert.equal(summary.sent, 1);
  assert.equal(summary.stoppedReason, "budget_exhausted");
  assert.equal(f.updates[0].target, "fallback");
  assert.equal(f.updates[0].id, 1);
});

test("sent counts across DBs and headroom reduce budget; --limit cannot raise it", async () => {
  const f = fixture();
  f.deps.clientKeys = ["primary", "fallback"];
  f.deps.countSent = async (key) => (key === "primary" ? 90 : 5);
  const summary = await runResendBatch(
    f.deps,
    { ...config, headroom: 4 },
    { limit: 1000 },
  );
  assert.equal(summary.sent, 1);
  assert.equal(summary.remainingBudget, 0);
});

test("zero/exhausted cap sends nothing and does not select candidates", async () => {
  const f = fixture();
  f.deps.select = async () => {
    throw new Error("should not select");
  };
  assert.equal(
    (await runResendBatch(f.deps, { ...config, dailyCap: 0 })).stoppedReason,
    "budget_exhausted",
  );
  assert.equal((await runResendBatch(f.deps, config, { limit: 0 })).sent, 0);
});

test("successful run persists timestamps, spaces requests, and rerun is a no-op", async () => {
  const f = fixture();
  assert.equal((await runResendBatch(f.deps, config)).sent, 3);
  assert.ok(
    f.updates.every(
      (row) => row.status === "sent" && row.sentAt instanceof Date,
    ),
  );
  assert.deepEqual(f.sleeps, [150, 150]);
  assert.equal((await runResendBatch(f.deps, config)).candidates, 0);
  assert.equal(f.sends.length, 3);
});

test("quota marks one row and stops immediately", async () => {
  const f = fixture();
  f.deps.send = async () => ({
    status: "skipped_quota",
    reason: "daily_quota_exceeded",
  });
  const summary = await runResendBatch(f.deps, config);
  assert.equal(summary.stoppedReason, "quota_reached");
  assert.equal(summary.skippedQuota, 1);
  assert.deepEqual(
    f.updates.map((row) => row.status),
    ["skipped_quota"],
  );
});

test("configuration failures abort without status writes; dry run still works", async () => {
  const f = fixture();
  f.deps.configured = false;
  assert.equal(
    (await runResendBatch(f.deps, config)).stoppedReason,
    "missing_api_key",
  );
  assert.equal(
    (await runResendBatch(f.deps, config, { dryRun: true })).planned,
    3,
  );
  f.deps.configured = true;
  f.deps.send = async () => ({
    status: "skipped_config",
    reason: "missing_api_key",
  });
  assert.equal(
    (await runResendBatch(f.deps, config)).stoppedReason,
    "missing_api_key",
  );
  assert.deepEqual(f.updates, []);
});

test("consecutive failure breaker stops after N without leaking provider errors", async () => {
  const f = fixture(8);
  f.deps.send = async () => {
    throw new Error("secret test@example.invalid");
  };
  const summary = await runResendBatch(f.deps, config);
  assert.equal(summary.stoppedReason, "too_many_failures");
  assert.equal(summary.failed, 5);
  assert.equal(f.updates.length, 5);
  assert.equal(summary.remainingBudget, 100);
});

test("a success resets the failure streak and a failed row is not reported drained", async () => {
  const f = fixture(5);
  const send = f.deps.send;
  let index = 0;
  f.deps.send = async (email) => {
    if (index++ % 2 === 0) throw new Error("temporary");
    return send(email);
  };
  const summary = await runResendBatch(f.deps, {
    ...config,
    maxConsecutiveFailures: 2,
  });
  assert.equal(summary.sent, 2);
  assert.equal(summary.failed, 3);
  assert.equal(summary.stoppedReason, "batch_complete");
});

test("DB count/select failures fail closed before sending", async () => {
  for (const method of ["countSent", "select"] as const) {
    const f = fixture();
    f.deps[method] = async () => {
      throw new Error("db unavailable");
    };
    await assert.rejects(runResendBatch(f.deps, config));
    assert.deepEqual(f.sends, []);
  }
});

test("status-write failure stops after the accepted email", async () => {
  const f = fixture();
  f.deps.update = async () => false;
  const summary = await runResendBatch(f.deps, config);
  assert.equal(summary.sent, 1);
  assert.equal(summary.stoppedReason, "status_update_failed");
  assert.equal(f.sends.length, 1);
});

test("lost lock, deadline, and UTC day rollover stop before the next send", async () => {
  const f = fixture();
  f.deps.renewLease = async () => false;
  assert.equal(
    (await runResendBatch(f.deps, config)).stoppedReason,
    "lock_lost",
  );
  assert.equal(f.sends.length, 0);
  const timed = fixture();
  assert.equal(
    (await runResendBatch(timed.deps, config, { maxRuntimeMs: 100 }))
      .stoppedReason,
    "time_limit",
  );
  assert.equal(timed.sends.length, 1);
  const midnight = fixture();
  midnight.setTime(Date.UTC(2026, 8, 14, 23, 59, 59, 950));
  assert.equal(
    (await runResendBatch(midnight.deps, config)).stoppedReason,
    "day_changed",
  );
  assert.equal(midnight.sends.length, 1);
});

test("no databases and invalid programmatic limits", async () => {
  const f = fixture();
  f.deps.clientKeys = [];
  assert.equal(
    (await runResendBatch(f.deps, config)).stoppedReason,
    "no_database",
  );
  for (const limit of [NaN, Infinity, -1, 1.5])
    await assert.rejects(runResendBatch(f.deps, config, { limit }));
});

test("CLI rejects typos, empty/fractional limits, duplicates and extra arguments", () => {
  assert.deepEqual(parseResendArgs(["--dry-run", "--limit=1"]), {
    dryRun: true,
    help: false,
    limit: 1,
  });
  assert.equal(parseResendArgs(["--help"]).help, true);
  for (const args of [
    ["--dryrun"],
    ["--limit="],
    ["--limit=1.5"],
    ["--limit=-1"],
    ["--limit=Infinity"],
    ["--limit=1", "--limit=2"],
    ["oops"],
  ])
    assert.throws(() => parseResendArgs(args));
});

test("cron rejects missing/wrong auth before work, accepts valid secret without caching", async () => {
  let calls = 0;
  const run = async () => {
    calls += 1;
    return emptyResendSummary("drained");
  };
  const request = (token?: string) =>
    new Request("http://localhost/api/cron/resend-confirmations", {
      headers: token ? { authorization: token } : {},
    });
  assert.equal(
    (await createResendCronHandler(run, () => undefined)(request())).status,
    401,
  );
  const handler = createResendCronHandler(run, () => "test-secret");
  assert.equal((await handler(request())).status, 401);
  assert.equal((await handler(request("Bearer wrong"))).status, 401);
  assert.equal(calls, 0);
  const response = await handler(request("Bearer test-secret"));
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("cron exposes actionable failures but never raw errors or secrets", async () => {
  const request = new Request("http://localhost/cron", {
    headers: { authorization: "Bearer test" },
  });
  const unavailable = createResendCronHandler(
    async () => emptyResendSummary("missing_api_key"),
    () => "test",
  );
  assert.equal((await unavailable(request)).status, 503);
  const broken = createResendCronHandler(
    async () => {
      throw new Error("postgres://secret@example.invalid");
    },
    () => "test",
  );
  const response = await broken(request);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Resend run failed." });
});

test("DB readers keep createdAt and UTC boundaries and order by timestamp plus id", async () => {
  const { selectUnsentConfirmations, countSentToday } =
    await import("../src/db/router");
  const f = fixture(1);
  let selected: Record<string, unknown> = {};
  let ordering: unknown[] = [];
  const fake = {
    select(fields: Record<string, unknown>) {
      selected = fields;
      return this;
    },
    from() {
      return this;
    },
    where() {
      return this;
    },
    orderBy(...args: unknown[]) {
      ordering = args;
      return this;
    },
    async limit() {
      return f.rows;
    },
  };
  type Target = Parameters<typeof selectUnsentConfirmations>[0];
  const target = {
    key: "primary",
    source: "primary",
    label: "primary",
    db: fake,
  } as unknown as Target;
  const rows: UnsentConfirmation[] = await selectUnsentConfirmations(target, 1);
  assert.ok(selected.createdAt);
  assert.equal(ordering.length, 2);
  assert.equal(rows[0].createdAt, f.rows[0].createdAt);
  assert.deepEqual(await selectUnsentConfirmations(target, 0), []);
  let predicate: unknown;
  const counter = {
    select() {
      return this;
    },
    from() {
      return this;
    },
    where(where: unknown) {
      predicate = where;
      return Promise.resolve([{ value: 7 }]);
    },
  };
  const at = new Date("2026-09-14T18:45:00Z");
  assert.equal(
    await countSentToday(
      { ...target, db: counter as unknown as Target["db"] },
      at,
    ),
    7,
  );
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const query = new PgDialect().sqlToQuery(
    predicate as Parameters<InstanceType<typeof PgDialect>["sqlToQuery"]>[0],
  );
  assert.ok(
    query.params.some(
      (value) =>
        (value instanceof Date ? value.toISOString() : value) ===
        "2026-09-14T00:00:00.000Z",
    ),
  );
  assert.equal(at.toISOString(), "2026-09-14T18:45:00.000Z");
});

test("distributed lease excludes another worker, renews, and never deletes a new owner's lock", async () => {
  let owner: string | undefined;
  const store = {
    set: async (
      _key: string,
      token: string,
      options: { NX: true; EX: number },
    ) => {
      assert.equal(options.NX, true);
      assert.equal(options.EX, 600);
      if (owner) return null;
      owner = token;
      return "OK";
    },
    eval: async (
      script: string,
      options: { keys: string[]; arguments: string[] },
    ) => {
      assert.equal(options.keys[0], "test-lock");
      if (owner !== options.arguments[0]) return 0;
      if (script.includes("'del'")) owner = undefined;
      return 1;
    },
  };
  const deps = {
    configured: () => true,
    client: async () => store,
    key: () => "test-lock",
  };
  const acquireA = createResendLeaseManager(deps),
    acquireB = createResendLeaseManager(deps);
  const lease = await acquireA();
  assert.ok(lease);
  assert.equal(await acquireA(), null);
  assert.equal(await acquireB(), null);
  assert.equal(await lease.renew(), true);
  owner = "new-owner-after-expiry";
  assert.equal(await lease.renew(), false);
  await lease.release();
  assert.equal(owner, "new-owner-after-expiry");
  owner = undefined;
  const next = await acquireB();
  assert.ok(next);
  await next.release();
  assert.equal(owner, undefined);
});

test("configured Redis outage fails closed and resets local acquisition state", async () => {
  let calls = 0;
  const acquire = createResendLeaseManager({
    configured: () => true,
    key: () => "test",
    client: async () => {
      calls += 1;
      throw new Error("offline");
    },
  });
  await assert.rejects(acquire(), /offline/);
  await assert.rejects(acquire(), /offline/);
  assert.equal(calls, 2);
});

test("optional no-Redis mode still excludes overlapping runs within the process", async () => {
  const acquire = createResendLeaseManager({
    configured: () => false,
    key: () => "test",
    client: async () => {
      throw new Error("must not connect");
    },
  });
  const lease = await acquire();
  assert.ok(lease);
  assert.equal(await acquire(), null);
  await lease.release();
  const next = await acquire();
  assert.ok(next);
  await next.release();
});
