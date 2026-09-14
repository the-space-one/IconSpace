import {
  allDbTargets,
  lookupMirrorRows,
  mirrorDbDependencies,
  writeMirrorRows,
} from "@/db/mirror";
import {
  mergeMirrorRows,
  runMirrorSweep,
  type MirrorOptions,
  type MirrorRow,
} from "./waitlist-mirror-core";

/** Best-effort fast path. The durable sweep repairs anything unavailable here.
 * Do not invoke this as fire-and-forget in a serverless request: use after(). */
export async function mirrorSubscriber(email: string) {
  const targets = allDbTargets();
  if (targets.length < 2) return { failures: 0 };
  const reads = await Promise.allSettled(
    targets.map((target) => lookupMirrorRows(target, [email])),
  );
  const rows = reads.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  let failures = reads.filter((result) => result.status === "rejected").length;
  if (rows.length) {
    const merged = rows.reduce<MirrorRow>(
      (current, row) => mergeMirrorRows(current, row),
      rows[0],
    );
    const writes = await Promise.allSettled(
      targets.map((target, index) =>
        // Don't spend another timeout on an already unavailable destination.
        reads[index].status === "fulfilled"
          ? writeMirrorRows(target, [merged])
          : Promise.resolve(0),
      ),
    );
    failures += writes.filter((result) => result.status === "rejected").length;
  }
  if (failures) console.error("waitlist_mirror_error", { failures });
  return { failures };
}

export async function repairWaitlistMirrors(options: MirrorOptions = {}) {
  const deps = mirrorDbDependencies();
  if (deps.keys.length < 2)
    throw new Error("Mirroring requires at least two databases.");
  return runMirrorSweep(deps, options);
}
