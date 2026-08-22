ALTER TABLE "Host_v1" ADD COLUMN "agentTokenHash" text;--> statement-breakpoint
ALTER TABLE "Host_v1" ADD COLUMN "enrolledAt" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Host_v1_agent_token_idx" ON "Host_v1" USING btree ("agentTokenHash");