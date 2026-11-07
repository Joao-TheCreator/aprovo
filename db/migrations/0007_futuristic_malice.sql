-- T4 (docs/12 section 2): publications table, post_status values scheduled/published/publish_failed.
-- ALTER TYPE ... ADD VALUE: drizzle's migrator runs this whole file in ONE transaction. Since
-- PostgreSQL 12 that is allowed, as long as the new enum values are not USED in the same transaction.
-- Nothing below uses them (only new columns and a new table), so it is safe on postgres:16 (CI) and
-- on Neon (PG 14+). Do not add inserts/updates/defaults that reference the new post_status values to this file.
CREATE TYPE "public"."publication_status" AS ENUM('scheduled', 'publishing', 'published', 'failed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."post_status" ADD VALUE 'scheduled';--> statement-breakpoint
ALTER TYPE "public"."post_status" ADD VALUE 'published';--> statement-breakpoint
ALTER TYPE "public"."post_status" ADD VALUE 'publish_failed';--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"connection_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"status" "publication_status" DEFAULT 'scheduled' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"container_id" text,
	"container_created_at" timestamp with time zone,
	"ig_media_id" text,
	"permalink" text,
	"published_at" timestamp with time zone,
	"last_error_code" text,
	"last_error" text,
	"last_error_raw" jsonb,
	"created_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "publish_path" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "published_media_id" text;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_connection_id_instagram_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."instagram_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publications_post_live_uniq" ON "publications" USING btree ("post_id") WHERE "publications"."status" in ('scheduled', 'publishing');--> statement-breakpoint
CREATE INDEX "publications_status_next_idx" ON "publications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "publications_profile_scheduled_idx" ON "publications" USING btree ("profile_id","scheduled_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "publications_ig_media_uniq" ON "publications" USING btree ("ig_media_id") WHERE "publications"."ig_media_id" is not null;