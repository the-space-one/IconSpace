import assert from "node:assert/strict";
import { test } from "node:test";
import { sendWaitlistConfirmationEmail } from "../src/server/waitlist-email";

test("real email helper uses a stable opaque retry key and renders left-aligned HTML", async (t) => {
  const oldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_fake_test_only";
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  });
  const calls: RequestInit[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init: RequestInit) => {
      calls.push(init);
      return Response.json({ id: "fake-delivery-id" });
    },
  );
  const email = "recipient@example.invalid";
  assert.equal((await sendWaitlistConfirmationEmail(email)).status, "sent");
  await sendWaitlistConfirmationEmail(`  ${email.toUpperCase()}  `);
  const first = new Headers(calls[0].headers).get("idempotency-key");
  assert.equal(first, new Headers(calls[1].headers).get("idempotency-key"));
  assert.ok(first?.startsWith("waitlist-confirmation/"));
  assert.ok(!first?.includes(email));
  assert.ok(calls[0].signal instanceof AbortSignal);
  const payload = JSON.parse(String(calls[0].body));
  assert.match(
    payload.html,
    /<table align="left"[^>]+style="max-width:440px;margin:0;padding:0 24px"/,
  );
  assert.match(payload.html, /Welcome to/);
});

test("missing key skips without network; quota codes stop; malformed success is rejected", async (t) => {
  const oldKey = process.env.RESEND_API_KEY;
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = oldKey;
  });
  let requests = 0;
  let status = 429;
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    return Response.json(
      status === 429
        ? {
            name: "daily_quota_exceeded",
            message: "Allowance reached",
            statusCode: 429,
          }
        : {},
      { status },
    );
  });
  delete process.env.RESEND_API_KEY;
  assert.equal(
    (await sendWaitlistConfirmationEmail("test@example.invalid")).status,
    "skipped_config",
  );
  assert.equal(requests, 0);
  process.env.RESEND_API_KEY = "re_fake_test_only";
  assert.equal(
    (await sendWaitlistConfirmationEmail("test@example.invalid")).status,
    "skipped_quota",
  );
  status = 200;
  await assert.rejects(
    sendWaitlistConfirmationEmail("test@example.invalid"),
    /delivery identifier/,
  );
});
