CREATE TABLE IF NOT EXISTS "FindingAcknowledgement_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostId" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"acknowledgedBy" text NOT NULL,
	"acknowledgedAt" timestamp NOT NULL,
	"note" text,
	CONSTRAINT "FindingAcknowledgement_v1_host_fingerprint_key" UNIQUE("hostId","fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "HostFinding_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reportId" uuid NOT NULL,
	"hostId" uuid NOT NULL,
	"findingId" text NOT NULL,
	"ruleId" text NOT NULL,
	"fingerprint" text NOT NULL,
	"severity" varchar NOT NULL,
	"category" text,
	"layer" text,
	"filePath" text,
	"contentHash" text,
	"line" integer,
	"column" integer,
	"description" text NOT NULL,
	"evidence" text,
	"owasp" json NOT NULL,
	"cwe" text,
	"confidence" text,
	"fixable" boolean,
	"suppressed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "FindingAcknowledgement_v1" ADD CONSTRAINT "FindingAcknowledgement_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "HostFinding_v1" ADD CONSTRAINT "HostFinding_v1_reportId_HostReport_v1_id_fk" FOREIGN KEY ("reportId") REFERENCES "public"."HostReport_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "HostFinding_v1" ADD CONSTRAINT "HostFinding_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostFinding_v1_report_idx" ON "HostFinding_v1" USING btree ("reportId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostFinding_v1_host_idx" ON "HostFinding_v1" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostFinding_v1_fingerprint_idx" ON "HostFinding_v1" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostFinding_v1_severity_idx" ON "HostFinding_v1" USING btree ("severity");