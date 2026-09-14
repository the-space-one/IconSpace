/** Mirrors each new signup into a Google Sheet as a human-readable backup.
 *
 *  Entirely optional, in the same spirit as the Resend integration: with no
 *  WAITLIST_SHEET_WEBHOOK_URL this returns `skipped_config` and the signup is
 *  unaffected. The sheet is a convenience copy, never the source of truth —
 *  Neon is. Nothing in here is allowed to fail a signup, so every path returns
 *  a result instead of throwing.
 *
 *  The transport is a Google Apps Script web app (see scripts/waitlist-sheet.gs)
 *  rather than the Sheets API, which keeps service-account credentials out of
 *  the deployment entirely. The shared secret travels in the body because
 *  Apps Script does not expose custom request headers to doPost. */

export type AppendWaitlistRowResult =
  | { status: "appended" }
  | { status: "skipped_config"; reason: "missing_webhook_url" }
  | { status: "failed"; reason: string };

export type AppendWaitlistRowInput = {
  email: string;
  subscriberId: number;
  /** Which database actually took the write, so a split-brain failover is
   *  visible in the sheet rather than silently reconciled. */
  source: "primary" | "fallback";
  createdAt?: Date;
};

/** Apps Script routinely takes 4-6s for a round trip — it answers the POST with
 *  a 302 and the real work happens on the redirect, and a cold start adds more.
 *  A tight timeout here does not prevent the append, it just abandons the
 *  response after the row has already been written, which shows up as a bogus
 *  failure in the logs. The work runs in `after()`, so waiting costs the user
 *  nothing. */
const DEFAULT_TIMEOUT_MS = 15000;
const RETRY_DELAYS_MS = [200, 600];

function getWebhookUrl() {
  return process.env.WAITLIST_SHEET_WEBHOOK_URL?.trim() || null;
}

function getWebhookSecret() {
  return process.env.WAITLIST_SHEET_WEBHOOK_SECRET?.trim() || "";
}

function getTimeoutMs() {
  const raw = Number.parseInt(
    process.env.WAITLIST_SHEET_TIMEOUT_MS?.trim() ?? "",
    10,
  );
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 5xx and network/timeout faults are worth another attempt; a 4xx means the
 *  script rejected us (bad secret, wrong deployment) and will keep doing so. */
function isRetryableStatus(status: number) {
  return status >= 500 || status === 408 || status === 429;
}

function summarize(value: unknown) {
  const raw = value instanceof Error ? value.message : String(value);
  return (raw.split("\n")[0] ?? "Unknown error").slice(0, 200);
}

/** Apps Script signals success in the body, not the status line. A response
 *  that is not the expected JSON usually means the URL points at a login page
 *  or an old deployment, which is a failure worth surfacing. */
async function readVerdict(
  response: Response,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let text = "";
  try {
    text = await response.text();
  } catch (error) {
    return { ok: false, error: summarize(error) };
  }

  try {
    const parsed = JSON.parse(text) as { ok?: boolean; error?: string };
    if (parsed.ok === true) {
      return { ok: true };
    }
    return { ok: false, error: parsed.error ?? "unknown rejection" };
  } catch {
    return {
      ok: false,
      error: `unexpected non-JSON response: ${text.slice(0, 120)}`,
    };
  }
}

export async function appendWaitlistRowToSheet(
  input: AppendWaitlistRowInput,
): Promise<AppendWaitlistRowResult> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return { status: "skipped_config", reason: "missing_webhook_url" };
  }

  const payload = JSON.stringify({
    secret: getWebhookSecret(),
    email: input.email,
    subscriberId: input.subscriberId,
    source: input.source,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
  });

  let lastReason = "Unknown error";

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        // Apps Script answers with a 302 to script.googleusercontent.com.
        redirect: "follow",
        signal: AbortSignal.timeout(getTimeoutMs()),
      });

      if (response.ok) {
        // Apps Script cannot set a status code — ContentService always answers
        // 200, so a rejected secret arrives as 200 with {"ok":false}. The body
        // is the real verdict; trusting response.ok alone would report every
        // misconfiguration as a successful backup.
        const verdict = await readVerdict(response);
        if (verdict.ok) {
          return { status: "appended" };
        }

        // An app-level rejection (bad secret, missing tab) is deterministic.
        return {
          status: "failed",
          reason: `Sheet webhook rejected the row: ${verdict.error}`,
        };
      }

      lastReason = `Sheet webhook responded ${response.status}`;
      if (!isRetryableStatus(response.status)) {
        return { status: "failed", reason: lastReason };
      }
    } catch (error) {
      lastReason = summarize(error);
    }

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }

  return { status: "failed", reason: lastReason };
}
