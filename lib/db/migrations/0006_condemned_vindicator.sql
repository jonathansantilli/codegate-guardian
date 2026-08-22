CREATE TABLE IF NOT EXISTS "EnrolmentCode_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"maxUses" integer DEFAULT 1 NOT NULL,
	"usedCount" integer DEFAULT 0 NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"revokedAt" timestamp,
	CONSTRAINT "EnrolmentCode_v1_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "FindingSuppression_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar NOT NULL,
	"hostId" uuid,
	"fingerprint" text,
	"ruleId" text,
	"reason" text NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"expiresAt" timestamp,
	"revokedAt" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FindingSuppression_v1" ADD CONSTRAINT "FindingSuppression_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FindingSuppression_v1_fingerprint_idx" ON "FindingSuppression_v1" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "FindingSuppression_v1_rule_idx" ON "FindingSuppression_v1" USING btree ("ruleId");