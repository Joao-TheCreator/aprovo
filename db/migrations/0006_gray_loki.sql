CREATE TYPE "public"."connection_status" AS ENUM('active', 'expired', 'revoked', 'not_professional', 'missing_scope');--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD COLUMN "status" "connection_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD COLUMN "status_detail" text;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD COLUMN "status_checked_at" timestamp with time zone;