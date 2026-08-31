-- Hand-added: drizzle-kit emits the nextval() default but has no concept of the
-- sequence backing it, so without this every insert fails with
-- "relation sync_rev_seq does not exist". Keep this at the top of the first
-- migration; the tables below depend on it.
CREATE SEQUENCE IF NOT EXISTS "sync_rev_seq";
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	CONSTRAINT "characters_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "content_entries" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"updated_at" bigint NOT NULL,
	"deleted_at" bigint,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	CONSTRAINT "content_entries_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"github_issue_number" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "characters_user_rev_idx" ON "characters" USING btree ("user_id","rev");--> statement-breakpoint
CREATE INDEX "content_user_rev_idx" ON "content_entries" USING btree ("user_id","rev");--> statement-breakpoint
CREATE INDEX "feedback_user_created_idx" ON "feedback" USING btree ("user_id","created_at");