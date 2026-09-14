import { and, eq, gte, lt } from "drizzle-orm";
import { allDbTargets, lookupMirrorRows } from "./mirror";
import { selectUnsentConfirmations, withDbRetries } from "./router";
import { waitlistSubscribers } from "./schema";
import {
  readDeliveryCopies,
  type ReplicaDeliveryDependencies,
} from "@/server/replica-delivery-core";

export function replicaDeliveryDependencies(): ReplicaDeliveryDependencies {
  const targets = new Map(allDbTargets().map((target) => [target.key, target]));
  return {
    keys: [...targets.keys()],
    sentToday: async (key, at) => {
      const start = new Date(at);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86_400_000);
      const rows = await withDbRetries(() =>
        targets
          .get(key)!
          .db.select({ email: waitlistSubscribers.email })
          .from(waitlistSubscribers)
          .where(
            and(
              eq(waitlistSubscribers.emailSendStatus, "sent"),
              gte(waitlistSubscribers.emailSentAt, start),
              lt(waitlistSubscribers.emailSentAt, end),
            ),
          ),
      );
      return rows.map((row) => row.email);
    },
    unsent: (key, limit, after) =>
      selectUnsentConfirmations(targets.get(key)!, limit, after),
    lookup: (key, emails) => lookupMirrorRows(targets.get(key)!, emails),
  };
}

export async function findSentConfirmation(email: string) {
  const copies = await readDeliveryCopies(replicaDeliveryDependencies(), [
    email,
  ]);
  return (
    copies
      .filter((row) => row.emailSendStatus === "sent")
      .sort(
        (a, b) =>
          (a.emailSentAt?.getTime() ?? Infinity) -
          (b.emailSentAt?.getTime() ?? Infinity),
      )[0] ?? null
  );
}
