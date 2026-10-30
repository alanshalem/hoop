CREATE TYPE "public"."sync_record_kind" AS ENUM('division', 'team', 'player', 'match');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'HEAD_COACH', 'ASSISTANT_STATISTICIAN');--> statement-breakpoint
CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_records" (
	"kind" "sync_record_kind" NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "sync_records_kind_id_pk" PRIMARY KEY("kind","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_events_seq_idx" ON "match_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "match_events_match_id_idx" ON "match_events" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_records_seq_idx" ON "sync_records" USING btree ("seq");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");