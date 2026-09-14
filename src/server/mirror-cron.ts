import { timingSafeEqual } from "node:crypto";
import type { MirrorOptions, MirrorSummary } from "./waitlist-mirror-core";

export function createMirrorCronHandler(
  run: (options: MirrorOptions) => Promise<MirrorSummary>,
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
    )
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    try {
      const summary = await run({ maxRuntimeMs: 180_000, maxBatches: 100 });
      console.info("waitlist_mirror_complete", summary);
      return Response.json(summary, {
        status: summary.failures ? 503 : 200,
        headers,
      });
    } catch {
      console.error("waitlist_mirror_error");
      return Response.json(
        { error: "Mirror repair failed." },
        { status: 503, headers },
      );
    }
  };
}
