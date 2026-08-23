ALTER TABLE "Host_v1" ADD COLUMN "enrolmentOpen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Machines already enrolled when this lands predate per-machine tokens and
-- hold no credential, so they cannot report until they enrol again. Opening
-- them here is what makes the documented upgrade path work without an
-- operator clicking through every machine in the fleet.
--
-- It is a bounded, one-shot window: enrolling consumes the flag, and only an
-- operator restoring a machine can open another. Machines enrolled after this
-- point start closed.
UPDATE "Host_v1" SET "enrolmentOpen" = true WHERE "agentTokenHash" IS NULL;
