CREATE TABLE "ActivityEvent_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"actorKind" varchar NOT NULL,
	"actorName" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"result" text NOT NULL,
	"apiCall" text,
	"throttleKey" text
);
--> statement-breakpoint
CREATE TABLE "EnrolmentCode_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"maxUses" integer DEFAULT 1 NOT NULL,
	"usedCount" integer DEFAULT 0 NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone,
	CONSTRAINT "EnrolmentCode_v1_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "FindingAcknowledgement_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostId" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"acknowledgedBy" text NOT NULL,
	"acknowledgedAt" timestamp with time zone NOT NULL,
	"note" text,
	CONSTRAINT "FindingAcknowledgement_v1_host_fingerprint_key" UNIQUE("hostId","fingerprint")
);
--> statement-breakpoint
CREATE TABLE "FindingSuppression_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar NOT NULL,
	"hostId" uuid,
	"fingerprint" text,
	"ruleId" text,
	"reason" text NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"expiresAt" timestamp with time zone,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "Host_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machineId" text NOT NULL,
	"hostname" text NOT NULL,
	"platform" text,
	"osRelease" text,
	"username" text,
	"owner" text,
	"team" text,
	"agentVersion" text,
	"firstSeenAt" timestamp with time zone NOT NULL,
	"lastSeenAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone,
	"revokedBy" text,
	"agentTokenHash" text,
	"enrolledAt" timestamp with time zone,
	"enrolmentOpen" boolean DEFAULT false NOT NULL,
	"enrolmentOpenedAt" timestamp with time zone,
	CONSTRAINT "Host_v1_machine_id_key" UNIQUE("machineId"),
	CONSTRAINT "Host_v1_agent_token_key" UNIQUE("agentTokenHash")
);
--> statement-breakpoint
CREATE TABLE "HostFinding_v1" (
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
	"columnNumber" integer,
	"description" text NOT NULL,
	"evidence" text,
	"owasp" jsonb NOT NULL,
	"cwe" text,
	"confidence" text,
	"fixable" boolean,
	"suppressed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "HostInventoryItem_v1" (
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
	"contentHash" text,
	"riskSurface" jsonb NOT NULL,
	"resolvedAgainst" text
);
--> statement-breakpoint
CREATE TABLE "HostReport_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hostId" uuid NOT NULL,
	"receivedAt" timestamp with time zone NOT NULL,
	"collectedAt" timestamp with time zone NOT NULL,
	"kbVersion" text,
	"itemsTotal" integer DEFAULT 0 NOT NULL,
	"findingsReported" boolean DEFAULT false NOT NULL,
	"toolsDetected" jsonb NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Policy_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"ruleId" text NOT NULL,
	"severity" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "Policy_v1_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "SignInAttempt_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"windowStart" timestamp with time zone NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "SignInAttempt_v1_identifier_window_unique" UNIQUE("identifier","windowStart")
);
--> statement-breakpoint
CREATE TABLE "User_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "User_email_key" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "FindingAcknowledgement_v1" ADD CONSTRAINT "FindingAcknowledgement_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "FindingSuppression_v1" ADD CONSTRAINT "FindingSuppression_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HostFinding_v1" ADD CONSTRAINT "HostFinding_v1_reportId_HostReport_v1_id_fk" FOREIGN KEY ("reportId") REFERENCES "public"."HostReport_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HostFinding_v1" ADD CONSTRAINT "HostFinding_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HostInventoryItem_v1" ADD CONSTRAINT "HostInventoryItem_v1_reportId_HostReport_v1_id_fk" FOREIGN KEY ("reportId") REFERENCES "public"."HostReport_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HostInventoryItem_v1" ADD CONSTRAINT "HostInventoryItem_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "HostReport_v1" ADD CONSTRAINT "HostReport_v1_hostId_Host_v1_id_fk" FOREIGN KEY ("hostId") REFERENCES "public"."Host_v1"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ActivityEvent_v1_occurred_idx" ON "ActivityEvent_v1" USING btree ("occurredAt");--> statement-breakpoint
CREATE INDEX "ActivityEvent_v1_actor_idx" ON "ActivityEvent_v1" USING btree ("actorKind");--> statement-breakpoint
CREATE UNIQUE INDEX "ActivityEvent_v1_throttle_key_idx" ON "ActivityEvent_v1" USING btree ("throttleKey");--> statement-breakpoint
CREATE INDEX "FindingSuppression_v1_fingerprint_idx" ON "FindingSuppression_v1" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "FindingSuppression_v1_rule_idx" ON "FindingSuppression_v1" USING btree ("ruleId");--> statement-breakpoint
CREATE INDEX "Host_v1_last_seen_idx" ON "Host_v1" USING btree ("lastSeenAt");--> statement-breakpoint
CREATE INDEX "HostFinding_v1_report_idx" ON "HostFinding_v1" USING btree ("reportId");--> statement-breakpoint
CREATE INDEX "HostFinding_v1_host_idx" ON "HostFinding_v1" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX "HostFinding_v1_fingerprint_idx" ON "HostFinding_v1" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "HostFinding_v1_severity_idx" ON "HostFinding_v1" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "HostInventoryItem_v1_report_idx" ON "HostInventoryItem_v1" USING btree ("reportId");--> statement-breakpoint
CREATE INDEX "HostInventoryItem_v1_host_idx" ON "HostInventoryItem_v1" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX "HostInventoryItem_v1_tool_idx" ON "HostInventoryItem_v1" USING btree ("tool");--> statement-breakpoint
CREATE INDEX "HostInventoryItem_v1_content_hash_idx" ON "HostInventoryItem_v1" USING btree ("contentHash");--> statement-breakpoint
CREATE INDEX "HostReport_v1_host_idx" ON "HostReport_v1" USING btree ("hostId");--> statement-breakpoint
CREATE INDEX "HostReport_v1_host_received_idx" ON "HostReport_v1" USING btree ("hostId","receivedAt");--> statement-breakpoint
CREATE INDEX "SignInAttempt_v1_window_idx" ON "SignInAttempt_v1" USING btree ("windowStart");