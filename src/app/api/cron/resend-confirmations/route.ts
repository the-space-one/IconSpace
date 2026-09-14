import { resendPendingConfirmations } from "@/server/resend-confirmations";
import { createResendCronHandler } from "@/server/resend-cron";

// The DB (node:https/ipv4) and Resend send both need the Node runtime; the run
// can take a while when draining a full daily batch.
export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily Vercel Cron entry point. Vercel sends `Authorization: Bearer <CRON_SECRET>`
 *  automatically; without a matching secret the endpoint is closed. */
export const GET = createResendCronHandler(resendPendingConfirmations);

// Next otherwise invokes GET for HEAD, which must never trigger an email run.
export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
}
