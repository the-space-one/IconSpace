import type { UnsentConfirmation } from "@/db/router";
import { normalizeEmail, type MirrorRow } from "./waitlist-mirror-core";

export type DeliveryCursor = {
  id: number;
  createdAt: Date;
  createdAtCursor?: string;
};
export type ReplicaDeliveryDependencies = {
  keys: string[];
  sentToday: (key: string, at: Date) => Promise<string[]>;
  unsent: (
    key: string,
    limit: number,
    after?: DeliveryCursor,
  ) => Promise<UnsentConfirmation[]>;
  lookup: (key: string, emails: string[]) => Promise<MirrorRow[]>;
};

/** All reads fail closed. An unreachable copy might be the only sent ledger. */
export async function readDeliveryCopies(
  deps: ReplicaDeliveryDependencies,
  emails: string[],
) {
  if (!deps.keys.length) throw new Error("No delivery ledger configured.");
  return (
    await Promise.all(deps.keys.map((key) => deps.lookup(key, emails)))
  ).flat();
}

export async function countUniqueSentToday(
  deps: ReplicaDeliveryDependencies,
  at: Date,
) {
  const copies = await Promise.all(
    deps.keys.map((key) => deps.sentToday(key, at)),
  );
  return new Set(copies.flat().map(normalizeEmail)).size;
}

export async function selectUniqueUnsent(
  deps: ReplicaDeliveryDependencies,
  limit: number,
) {
  if (limit <= 0) return [];
  const perDatabase = await Promise.all(
    deps.keys.map(async (key) => {
      const eligible: UnsentConfirmation[] = [];
      let after: DeliveryCursor | undefined;
      while (eligible.length < limit) {
        const batch = await deps.unsent(key, limit, after);
        if (!batch.length) break;
        const copies = await readDeliveryCopies(
          deps,
          batch.map((row) => row.email),
        );
        const sent = new Set(
          copies
            .filter((row) => row.emailSendStatus === "sent")
            .map((row) => normalizeEmail(row.email)),
        );
        eligible.push(
          ...batch.filter((row) => !sent.has(normalizeEmail(row.email))),
        );
        if (batch.length < limit) break;
        after = batch.at(-1)!;
      }
      return eligible;
    }),
  );
  const ordered = perDatabase
    .flat()
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.targetKey.localeCompare(b.targetKey) ||
        a.id - b.id,
    );
  const unique = new Map<string, UnsentConfirmation>();
  for (const row of ordered) {
    const email = normalizeEmail(row.email);
    if (!unique.has(email)) unique.set(email, { ...row, email });
  }
  return [...unique.values()].slice(0, limit);
}
