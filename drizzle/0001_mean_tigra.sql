CREATE TABLE IF NOT EXISTS "waitlist_mirror_checkpoints" (
	"source_key" text PRIMARY KEY NOT NULL,
	"after_id" integer DEFAULT 0 NOT NULL,
	"ceiling_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
