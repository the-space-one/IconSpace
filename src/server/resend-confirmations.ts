import { updateEmailSendStatusById } from "@/db/router";
import { sendWaitlistConfirmationEmail } from "@/server/waitlist-email";
import { acquireResendLease } from "@/server/resend-lock";
import {
  findSentConfirmation,
  replicaDeliveryDependencies,
} from "@/db/replica-delivery";
import {
  countUniqueSentToday,
  selectUniqueUnsent,
} from "./replica-delivery-core";
import { mirrorSubscriber } from "./waitlist-mirror";
import {
  emptyResendSummary,
  readResendConfig,
  runResendBatch,
  type ResendRunOptions,
} from "@/server/resend-confirmations-core";
export type {
  ResendRunOptions,
  ResendRunSummary,
  ResendRunStoppedReason,
} from "@/server/resend-confirmations-core";

export async function resendPendingConfirmations(
  options: ResendRunOptions = {},
) {
  const config = readResendConfig(process.env);
  const lease = options.dryRun ? null : await acquireResendLease();
  if (!options.dryRun && !lease) return emptyResendSummary("already_running");
  try {
    const replicas = replicaDeliveryDependencies();
    return await runResendBatch(
      {
        // One logical ledger, not one budget/candidate list per physical copy.
        clientKeys: replicas.keys.length ? ["waitlist"] : [],
        configured: Boolean(process.env.RESEND_API_KEY?.trim()),
        countSent: (_key, at) => countUniqueSentToday(replicas, at),
        select: (_key, limit) => selectUniqueUnsent(replicas, limit),
        shouldSend: async (row) => !(await findSentConfirmation(row.email)),
        send: sendWaitlistConfirmationEmail,
        update: async (row, status, error, sentAt) => {
          const saved = await updateEmailSendStatusById({
            subscriberId: row.id,
            targetKey: row.targetKey,
            status,
            error,
            sentAt,
          });
          // A saved source ledger is enough: repair retries unavailable copies.
          // Await the fast-path work so it survives serverless teardown.
          if (saved) await mirrorSubscriber(row.email);
          return saved;
        },
        renewLease: () => lease?.renew() ?? Promise.resolve(true),
        now: () => new Date(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        preview: (row) =>
          console.info("resend_dry_run_candidate", {
            subscriberId: row.id,
            source: row.targetKey === "primary" ? "primary" : "fallback",
          }),
      },
      config,
      options,
    );
  } finally {
    await lease?.release();
  }
}
