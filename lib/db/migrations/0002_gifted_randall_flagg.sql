CREATE TABLE IF NOT EXISTS "Host_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machineId" text NOT NULL,
	"hostname" text NOT NULL,
	"platform" text,
	"osRelease" text,
	"username" text,
	"agentVersion" text,
	"firstSeenAt" timestamp NOT NULL,
	"lastSeenAt" timestamp NOT NULL,
	CONSTRAINT "Host_v1_machine_id_key" UNIQUE("machineId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "HostInventoryItem_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reportId" uuid NOT NULL,
	"hostId" uuid NOT NULL,
	"tool" text NOT NULL,
	"kind" varchar NOT NULL,
	"itemType" text,
	"scope" varchar NOT NULL,
	"pattern" text,
	"path" text NOT NULL,
	"exists" boolean NOT NULL,
	"riskSurface" json NOT NULL,
	"resolvedAgainst" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "HostReport_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostId" uuid NOT NULL,
	"receivedAt" timestamp NOT NULL,
	"collectedAt" timestamp NOT NULL,
	"kbVersion" text,
	"itemsTotal" integer DEFAULT 0 NOT NULL,
	"toolsDetected" json NOT NULL,
	"createdAt" timestamp NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "HostInventoryItem_v1" ADD CONSTRAINT "HostInventoryItem_v1_reportId_HostReport_v1_id_fk" FOREIGN KEY ("reportId") REFERENCES "public"."HostReport_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "HostInventoryItem_v1" ADD CONSTRAINT "HostInventoryItem_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "HostReport_v1" ADD CONSTRAINT "HostReport_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Host_v1_last_seen_idx" ON "Host_v1" USING btree ("lastSeenAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostInventoryItem_v1_report_idx" ON "HostInventoryItem_v1" USING btree ("reportId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostInventoryItem_v1_host_idx" ON "HostInventoryItem_v1" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostInventoryItem_v1_tool_idx" ON "HostInventoryItem_v1" USING btree ("tool");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostReport_v1_host_idx" ON "HostReport_v1" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostReport_v1_host_received_idx" ON "HostReport_v1" USING btree ("hostId","receivedAt");