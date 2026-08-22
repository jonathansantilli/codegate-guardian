-- The chat application and the in-app repository scanner are gone; these are
-- the tables they owned. All were empty. CASCADE because the drop order
-- matters otherwise: Message, Vote and Stream reference Chat, Suggestion
-- references Document, and ScanFinding references ScanRun.
DROP TABLE IF EXISTS "Vote_v2" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "Suggestion" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "Stream" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "ScanFinding_v1" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "ScanRun_v1" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "Message_v2" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "Document" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "Chat" CASCADE;
