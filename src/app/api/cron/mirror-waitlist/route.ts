import { repairWaitlistMirrors } from "@/server/waitlist-mirror";
import { createMirrorCronHandler } from "@/server/mirror-cron";

export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = createMirrorCronHandler(repairWaitlistMirrors);

export function HEAD() {
  return new Response(null, {
    status: 405,
    headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
}
