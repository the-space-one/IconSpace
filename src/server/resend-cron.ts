import { timingSafeEqual } from "node:crypto";
import type {
  ResendRunOptions,
  ResendRunSummary,
} from "@/server/resend-confirmations-core";

const failureReasons = new Set([
  "missing_api_key",
  "no_database",
  "too_many_failures",
  "lock_lost",
  "status_update_failed",
]);
export function resendRunFailed(summary: ResendRunSummary) {
  return failureReasons.has(summary.stoppedReason) || summary.failed > 0;
}

export function createResendCronHandler(
  run: (options: ResendRunOptions) => Promise<ResendRunSummary>,
  secret: () => string | undefined = () => process.env.CRON_SECRET,
) {
  return async (request: Request) => {
    const configured = secret()?.trim();
    const actual = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${configured ?? ""}`);
    const headers = { "Cache-Control": "no-store" };
    if (
      !configured ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
    try {
      // Leave room for the bounded provider call and DB status retries.
      const summary = await run({ maxRuntimeMs: 180_000 });
      console.info("resend_cron_complete", summary);
      return Response.json(summary, {
        status: resendRunFailed(summary) ? 503 : 200,
        headers,
      });
    } catch {
      // Driver/provider error messages can contain secrets or email addresses.
      console.error("resend_cron_error");
      return Response.json(
        { error: "Resend run failed." },
        { status: 500, headers },
      );
    }
  };
}
