CREATE TABLE IF NOT EXISTS "ActivityEvent_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurredAt" timestamp NOT NULL,
	"actorKind" varchar NOT NULL,
	"actorName" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"result" text NOT NULL,
	"apiCall" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Policy_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"ruleId" text NOT NULL,
	"severity" varchar NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "Policy_v1_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ActivityEvent_v1_occurred_idx" ON "ActivityEvent_v1" USING btree ("occurredAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ActivityEvent_v1_actor_idx" ON "ActivityEvent_v1" USING btree ("actorKind");