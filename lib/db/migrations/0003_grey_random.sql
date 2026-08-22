ALTER TABLE "Host_v1" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "Host_v1" ADD COLUMN "team" text;--> statement-breakpoint
ALTER TABLE "HostInventoryItem_v1" ADD COLUMN "contentHash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "HostInventoryItem_v1_content_hash_idx" ON "HostInventoryItem_v1" USING btree ("contentHash");