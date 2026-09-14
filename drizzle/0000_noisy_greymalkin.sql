CREATE TABLE "waitlist_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_send_status" text DEFAULT 'pending' NOT NULL,
	"email_send_error" text,
	"email_sent_at" timestamp with time zone,
	CONSTRAINT "waitlist_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_subscribers_email_send_status_check" CHECK ("waitlist_subscribers"."email_send_status" in ('pending', 'sent', 'failed', 'skipped_quota', 'skipped_config'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_subscribers_email_lower_unique" ON "waitlist_subscribers" USING btree (lower("email"));