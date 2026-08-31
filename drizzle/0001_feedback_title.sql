-- Hand-adjusted: drizzle-kit emits a bare `ADD COLUMN "title" text NOT NULL`,
-- which fails outright on any table that already holds rows. Backfilling from
-- the existing message keeps the migration safe to run against a database that
-- already has feedback in it — previously the title was derived from the
-- message's first line anyway, so this reproduces what those rows showed.
ALTER TABLE "feedback" ADD COLUMN "title" text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE "feedback" SET "title" = left(split_part("message", E'\n', 1), 120) WHERE "title" = '';--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "title" DROP DEFAULT;
