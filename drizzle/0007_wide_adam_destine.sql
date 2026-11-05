CREATE TABLE "auth_throttles" (
	"key" text PRIMARY KEY NOT NULL,
	"failures" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone
);
