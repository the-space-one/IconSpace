import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Lifecycle of the confirmation email we try to send after a signup lands.
 *  Rows start at `pending` and the API route settles them once Resend replies
 *  (or once we decide not to call Resend at all). */
export const waitlistEmailSendStatuses = [
  "pending",
  "sent",
  "failed",
  "skipped_quota",
  "skipped_config",
] as const;

export type WaitlistEmailSendStatus =
  (typeof waitlistEmailSendStatuses)[number];

export const waitlistSubscribers = pgTable(
  "waitlist_subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    emailSendStatus: text("email_send_status").default("pending").notNull(),
    emailSendError: text("email_send_error"),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  },
  (table) => [
    // Case-insensitive uniqueness. The route lowercases before inserting, but
    // this keeps rows written by any other path from duplicating a signup.
    uniqueIndex("waitlist_subscribers_email_lower_unique").on(
      sql`lower(${table.email})`,
    ),
    check(
      "waitlist_subscribers_email_send_status_check",
      sql`${table.emailSendStatus} in ('pending', 'sent', 'failed', 'skipped_quota', 'skipped_config')`,
    ),
  ],
);

/** Per-source sweep position, stored on each destination. No subscriber PII. */
export const waitlistMirrorCheckpoints = pgTable(
  "waitlist_mirror_checkpoints",
  {
    sourceKey: text("source_key").primaryKey(),
    afterId: integer("after_id").notNull().default(0),
    ceilingId: integer("ceiling_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
