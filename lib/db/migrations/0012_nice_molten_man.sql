DROP INDEX IF EXISTS "Host_v1_agent_token_idx";--> statement-breakpoint
ALTER TABLE "Host_v1" ADD CONSTRAINT "Host_v1_agent_token_key" UNIQUE("agentTokenHash");