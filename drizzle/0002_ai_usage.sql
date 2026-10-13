CREATE TABLE "ai_usage" (
	"user_id" text NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_user_id_window_start_pk" PRIMARY KEY("user_id","window_start")
);
