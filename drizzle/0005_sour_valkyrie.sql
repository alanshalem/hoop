CREATE TABLE "sync_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
INSERT INTO "sync_meta" ("key", "value") VALUES ('data_epoch', gen_random_uuid()::text) ON CONFLICT ("key") DO NOTHING;
