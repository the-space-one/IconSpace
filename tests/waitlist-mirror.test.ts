import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeMirrorRows,
  sameMirrorRow,
  normalizeEmail,
  runMirrorSweep,
  type MirrorRecord,
  type MirrorCheckpoint,
  type MirrorDependencies,
} from "../src/server/waitlist-mirror-core";
import {
  countUniqueSentToday,
  readDeliveryCopies,
  selectUniqueUnsent,
  type ReplicaDeliveryDependencies,
} from "../src/server/replica-delivery-core";
import { createMirrorCronHandler } from "../src/server/mirror-cron";
import { parseMirrorArgs } from "../scripts/mirror-cli-options";
import { runResendBatch } from "../src/server/resend-confirmations-core";

const day = new Date("2026-09-14T08:00:00Z");
function row(id: number, status = "pending"): MirrorRecord {
  return {
    id,
    email: `person-${id}@example.invalid`,
    createdAt: new Date(day.getTime() + id),
    emailSendStatus: status,
    emailSendError: status === "failed" ? "Provider failed" : null,
    emailSentAt: status === "sent" ? day : null,
  };
}

function fixture(primary = [row(1)], fallback: MirrorRecord[] = []) {
  const tables = new Map([
    ["primary", primary],
    ["fallback", fallback],
  ]);
  const checkpoints = new Map<string, MirrorCheckpoint>();
  const writes: string[] = [];
  let time = 0;
  const deps: MirrorDependencies = {
    keys: [...tables.keys()],
    now: () => time,
    checkpoint: async (source, destination) =>
      checkpoints.get(`${source}:${destination}`) ?? {
        afterId: 0,
        ceilingId: null,
      },
    highWater: async (source) =>
      Math.max(0, ...tables.get(source)!.map((r) => r.id)),
    page: async (source, after, ceiling, limit) =>
      tables
        .get(source)!
        .filter((r) => r.id > after && r.id <= ceiling)
        .slice(0, limit),
    lookup: async (destination, emails) =>
      tables
        .get(destination)!
        .filter((r) =>
          emails.map(normalizeEmail).includes(normalizeEmail(r.email)),
        ),
    write: async (destination, rows) => {
      writes.push(destination);
      const table = tables.get(destination)!;
      let changed = 0;
      for (const incoming of rows) {
        const index = table.findIndex(
          (r) => normalizeEmail(r.email) === normalizeEmail(incoming.email),
        );
        if (index < 0) {
          table.push({
            ...incoming,
            id: Math.max(0, ...table.map((r) => r.id)) + 1,
          });
          changed += 1;
        } else {
          const merged = mergeMirrorRows(table[index], incoming);
          if (!sameMirrorRow(table[index], merged)) {
            table[index] = { ...merged, id: table[index].id };
            changed += 1;
          }
        }
      }
      return changed;
    },
    save: async (source, destination, cursor) => {
      checkpoints.set(`${source}:${destination}`, cursor);
    },
  };
  return {
    deps,
    tables,
    checkpoints,
    writes,
    setTime: (value: number) => {
      time = value;
    },
  };
}

test("merge is commutative/idempotent; sent wins, oldest dates and identity survive", () => {
  const sent = {
    ...row(1, "sent"),
    email: "PERSON-1@example.invalid",
    createdAtExact: "2026-09-14T08:00:00.001123Z",
  };
  const failed = { ...row(1, "failed"), createdAt: new Date("2026-09-15") };
  const merged = mergeMirrorRows(sent, failed);
  assert.deepEqual(merged, mergeMirrorRows(failed, sent));
  assert.deepEqual(mergeMirrorRows(merged, merged), merged);
  assert.equal(merged.email, "person-1@example.invalid");
  assert.equal(merged.emailSendStatus, "sent");
  assert.equal(merged.emailSendError, null);
  assert.equal(merged.createdAtExact, sent.createdAtExact);
  assert.equal(merged.emailSentAt?.toISOString(), day.toISOString());
  assert.throws(() => mergeMirrorRows(row(1), row(2)));
});

test("non-sent merges converge deterministically and preserve microsecond precision", () => {
  const a = {
    ...row(1, "failed"),
    emailSendError: "Z",
    createdAtExact: "2026-09-14T08:00:00.001900Z",
  };
  const b = {
    ...row(1, "failed"),
    emailSendError: "A",
    createdAtExact: "2026-09-14T08:00:00.001100Z",
  };
  assert.deepEqual(mergeMirrorRows(a, b), mergeMirrorRows(b, a));
  assert.equal(mergeMirrorRows(a, b).emailSendError, "A");
  assert.equal(mergeMirrorRows(a, b).createdAtExact, b.createdAtExact);
  assert.equal(mergeMirrorRows(row(1), a).emailSendStatus, "failed");
});

test("dry-run audits all rows with no checkpoint setup, writes, or cursor changes", async () => {
  const f = fixture([row(1, "sent"), row(2)]);
  f.deps.checkpoint = async () => {
    throw new Error("table not installed");
  };
  f.deps.save = async () => {
    throw new Error("must not save");
  };
  const result = await runMirrorSweep(f.deps, { dryRun: true });
  assert.equal(result.complete, true);
  assert.equal(result.missing, 2);
  assert.equal(result.written, 0);
  assert.deepEqual(f.writes, []);
  assert.equal(f.tables.get("fallback")!.length, 0);
});

test("backfill preserves status and different local IDs; repeated runs write nothing", async () => {
  const f = fixture([row(30, "sent")], [row(100, "failed")]);
  const first = await runMirrorSweep(f.deps);
  assert.equal(first.complete, true);
  assert.equal(f.tables.get("fallback")!.length, 2);
  assert.equal(f.tables.get("fallback")![1].id, 101);
  assert.equal(f.tables.get("fallback")![1].emailSendStatus, "sent");
  assert.equal(f.tables.get("primary")!.length, 2);
  assert.equal((await runMirrorSweep(f.deps)).written, 0);
  const audit = await runMirrorSweep(f.deps, { dryRun: true });
  assert.equal(audit.missing + audit.different, 0);
});

test("sent backup repairs stale primary without resetting delivery timestamps", async () => {
  const f = fixture([row(1)], [row(1, "sent")]);
  await runMirrorSweep(f.deps);
  assert.equal(f.tables.get("primary")![0].emailSendStatus, "sent");
  assert.equal(
    f.tables.get("primary")![0].emailSentAt?.getTime(),
    day.getTime(),
  );
});

test("bounded batches resume durable cursors, eventually complete the backfill", async () => {
  const f = fixture(Array.from({ length: 250 }, (_, i) => row(i + 1)));
  assert.equal(
    (await runMirrorSweep(f.deps, { maxBatches: 1 })).complete,
    false,
  );
  assert.deepEqual(f.checkpoints.get("primary:fallback"), {
    afterId: 100,
    ceilingId: 250,
  });
  assert.equal(f.tables.get("fallback")!.length, 100);
  assert.equal((await runMirrorSweep(f.deps)).complete, true);
  assert.equal(f.tables.get("fallback")!.length, 250);
  assert.deepEqual(f.checkpoints.get("primary:fallback"), {
    afterId: 0,
    ceilingId: null,
  });
});

test("crash after copy but before checkpoint replays without duplicate rows", async () => {
  const f = fixture([row(1, "sent")]);
  const save = f.deps.save;
  f.deps.save = async () => {
    throw new Error("checkpoint lost");
  };
  assert.ok((await runMirrorSweep(f.deps)).failures > 0);
  f.deps.save = save;
  assert.equal((await runMirrorSweep(f.deps)).complete, true);
  assert.equal(f.tables.get("fallback")!.length, 1);
});

test("failed writes do not advance progress; later sweep repairs them", async () => {
  const f = fixture();
  const write = f.deps.write;
  f.deps.write = async () => {
    throw new Error("destination down");
  };
  assert.equal((await runMirrorSweep(f.deps)).failures, 1);
  assert.equal(f.checkpoints.has("primary:fallback"), false);
  f.deps.write = write;
  assert.equal((await runMirrorSweep(f.deps)).complete, true);
  assert.equal(f.tables.get("fallback")!.length, 1);
});

test("subsequent sweeps revisit statuses behind cursor and discover new arrivals", async () => {
  const f = fixture(Array.from({ length: 150 }, (_, i) => row(i + 1)));
  await runMirrorSweep(f.deps, { maxBatches: 1 });
  f.tables.get("primary")![0] = row(1, "sent");
  f.tables.get("primary")!.push(row(151));
  await runMirrorSweep(f.deps);
  await runMirrorSweep(f.deps);
  assert.equal(f.tables.get("fallback")![0].emailSendStatus, "sent");
  assert.equal(f.tables.get("fallback")!.length, 151);
});

test("deadline preserves progress and an unavailable pair doesn't block healthy pairs", async () => {
  const f = fixture();
  const page = f.deps.page;
  f.deps.page = async (...args) => {
    f.setTime(100);
    return page(...args);
  };
  assert.equal(
    (await runMirrorSweep(f.deps, { maxRuntimeMs: 50 })).complete,
    false,
  );
  assert.equal(f.tables.get("fallback")!.length, 1);
  f.tables.set("third", []);
  f.deps.keys.push("third");
  const lookup = f.deps.lookup;
  f.deps.lookup = async (key, emails) => {
    if (key === "fallback") throw new Error("offline");
    return lookup(key, emails);
  };
  const result = await runMirrorSweep(f.deps);
  assert.ok(result.failures > 0);
  assert.equal(f.tables.get("third")!.length, 1);
});

function deliveryFixture(primary: MirrorRecord[], fallback: MirrorRecord[]) {
  const f = fixture(primary, fallback);
  const deps: ReplicaDeliveryDependencies = {
    keys: f.deps.keys,
    sentToday: async (key) =>
      f.tables
        .get(key)!
        .filter((r) => r.emailSendStatus === "sent")
        .map((r) => r.email),
    lookup: f.deps.lookup,
    unsent: async (key, limit, after) =>
      f.tables
        .get(key)!
        .filter(
          (r) =>
            r.emailSendStatus !== "sent" &&
            (!after ||
              r.createdAt > after.createdAt ||
              (+r.createdAt === +after.createdAt && r.id > after.id)),
        )
        .sort((a, b) => +a.createdAt - +b.createdAt || a.id - b.id)
        .slice(0, limit)
        .map((r) => ({ ...r, targetKey: key })),
  };
  return { ...f, delivery: deps };
}

test("daily budget counts distinct normalized emails rather than physical copies", async () => {
  const f = deliveryFixture(
    [row(1, "sent")],
    [{ ...row(1, "sent"), email: "PERSON-1@example.invalid" }, row(2, "sent")],
  );
  assert.equal(await countUniqueSentToday(f.delivery, day), 2);
});

test("candidates are deduplicated and any sent copy excludes stale pending rows", async () => {
  const f = deliveryFixture(
    [row(1), row(2), row(3)],
    [row(1, "sent"), { ...row(2), id: 90 }, row(4)],
  );
  const rows = await selectUniqueUnsent(f.delivery, 10);
  assert.deepEqual(
    rows.map((r) => r.email),
    [row(2).email, row(3).email, row(4).email],
  );
});

test("stale unsent copies at front cannot starve later eligible candidates", async () => {
  const f = deliveryFixture(
    [row(1), row(2), row(3)],
    [row(1, "sent"), row(2, "sent")],
  );
  assert.deepEqual(
    (await selectUniqueUnsent(f.delivery, 1)).map((r) => r.email),
    [row(3).email],
  );
});

test("unknown replica delivery history fails closed for selection and live preflight", async () => {
  const f = deliveryFixture([row(1)], []);
  f.delivery.lookup = async () => {
    throw new Error("offline");
  };
  await assert.rejects(selectUniqueUnsent(f.delivery, 10));
  await assert.rejects(readDeliveryCopies(f.delivery, [row(1).email]));
  f.delivery.sentToday = async () => {
    throw new Error("offline");
  };
  await assert.rejects(countUniqueSentToday(f.delivery, day));
});

test("resend preflight skips an intervening sent copy and sends each mirrored recipient once", async () => {
  const f = deliveryFixture([row(1), row(2)], [row(1), row(2)]);
  const sends: string[] = [];
  const summary = await runResendBatch(
    {
      clientKeys: ["logical"],
      configured: true,
      countSent: (_, at) => countUniqueSentToday(f.delivery, at),
      select: (_, limit) => selectUniqueUnsent(f.delivery, limit),
      shouldSend: async (candidate) => candidate.email !== row(1).email,
      send: async (email) => {
        sends.push(email);
        return { status: "sent", to: email, from: "test", providerId: "fake" };
      },
      update: async () => true,
      renewLease: async () => true,
      now: () => day,
      sleep: async () => {},
    },
    { dailyCap: 100, headroom: 0, maxConsecutiveFailures: 5 },
  );
  assert.equal(summary.sent, 1);
  assert.deepEqual(sends, [row(2).email]);
});

test("strict CLI prevents accidental backfill without explicit apply", () => {
  for (const value of ["--help", "--dry-run", "--apply", "--setup"])
    assert.equal(parseMirrorArgs([value]), value);
  for (const args of [
    [],
    ["--apply", "--dry-run"],
    ["--aply"],
    ["--apply", "extra"],
  ])
    assert.throws(() => parseMirrorArgs(args));
});

test("mirror cron authenticates before writes and redacts errors", async () => {
  let calls = 0;
  const handler = createMirrorCronHandler(
    async () => {
      calls++;
      return runMirrorSweep(fixture().deps);
    },
    () => "test-secret",
  );
  assert.equal(
    (await handler(new Request("https://example.invalid"))).status,
    401,
  );
  assert.equal(calls, 0);
  const response = await handler(
    new Request("https://example.invalid", {
      headers: { authorization: "Bearer test-secret" },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const failing = createMirrorCronHandler(
    async () => {
      throw new Error("sensitive-url");
    },
    () => "test-secret",
  );
  const failed = await failing(
    new Request("https://example.invalid", {
      headers: { authorization: "Bearer test-secret" },
    }),
  );
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("sensitive-url"));
});
