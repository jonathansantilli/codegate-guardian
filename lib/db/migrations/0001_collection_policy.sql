CREATE TABLE "ArtifactContent_v1" (
	"contentHash" text PRIMARY KEY NOT NULL,
	"byteLength" integer NOT NULL,
	"content" text NOT NULL,
	"riskSurface" jsonb NOT NULL,
	"firstSeenAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CollectionPolicy_v1" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"collectContent" boolean DEFAULT false NOT NULL,
	"allowedRiskSurfaces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"maxBytesPerArtifact" integer DEFAULT 262144 NOT NULL,
	"maxArtifactsPerReport" integer DEFAULT 200 NOT NULL,
	"updatedBy" text,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "CollectionPolicy_v1_singleton_key" UNIQUE("singleton")
);
--> statement-breakpoint
CREATE INDEX "ArtifactContent_v1_first_seen_idx" ON "ArtifactContent_v1" USING btree ("firstSeenAt");