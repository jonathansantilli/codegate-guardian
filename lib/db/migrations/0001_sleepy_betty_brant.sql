CREATE TABLE IF NOT EXISTS "ScanRun_v1" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL,
  "messageId" uuid NOT NULL,
  "toolCallId" text NOT NULL,
  "toolName" varchar NOT NULL,
  "mode" text,
  "scanMode" varchar,
  "repositoryUrl" text,
  "selectedSkill" text,
  "guessedPath" text,
  "findingsTotal" integer DEFAULT 0 NOT NULL,
  "summaryBySeverity" json NOT NULL,
  "rawOutput" json NOT NULL,
  "rawReport" json NOT NULL,
  "createdAt" timestamp NOT NULL,
  CONSTRAINT "ScanRun_v1_message_tool_call_key" UNIQUE("messageId", "toolCallId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ScanFinding_v1" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scanRunId" uuid NOT NULL,
  "findingId" text NOT NULL,
  "ruleId" text,
  "severity" varchar NOT NULL,
  "category" text,
  "layer" text,
  "filePath" text,
  "description" text NOT NULL,
  "evidence" text,
  "owasp" json NOT NULL,
  "cwe" text,
  "confidence" text,
  "fixable" boolean,
  "rawFinding" json NOT NULL,
  "createdAt" timestamp NOT NULL,
  CONSTRAINT "ScanFinding_v1_scan_run_finding_key" UNIQUE("scanRunId", "findingId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ScanRun_v1" ADD CONSTRAINT "ScanRun_v1_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ScanRun_v1" ADD CONSTRAINT "ScanRun_v1_messageId_Message_v2_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."Message_v2"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ScanFinding_v1" ADD CONSTRAINT "ScanFinding_v1_scanRunId_ScanRun_v1_id_fk" FOREIGN KEY ("scanRunId") REFERENCES "public"."ScanRun_v1"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ScanRun_v1_chat_idx" ON "ScanRun_v1" USING btree ("chatId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ScanRun_v1_message_idx" ON "ScanRun_v1" USING btree ("messageId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ScanFinding_v1_scan_run_idx" ON "ScanFinding_v1" USING btree ("scanRunId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ScanFinding_v1_severity_idx" ON "ScanFinding_v1" USING btree ("severity");
