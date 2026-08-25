CREATE TABLE IF NOT EXISTS "SignInAttempt_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"windowStart" timestamp NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "SignInAttempt_v1_identifier_window_unique" UNIQUE("identifier","windowStart")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "SignInAttempt_v1_window_idx" ON "SignInAttempt_v1" USING btree ("windowStart");