-- Personal approval links (docs/13). The new column defaults to 'personal' for NEW links, but links that
-- already exist predate this model and must keep behaving as open links, so the UPDATE right after
-- ADD COLUMN "mode" flips every pre-existing row to 'shared' in the same migration.
CREATE TYPE "public"."approval_link_mode" AS ENUM('shared', 'personal');--> statement-breakpoint
CREATE TYPE "public"."approval_link_used_reason" AS ENUM('decided', 'superseded');--> statement-breakpoint
CREATE TABLE "approval_link_opens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"link_state" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_links" ADD COLUMN "mode" "approval_link_mode" DEFAULT 'personal' NOT NULL;--> statement-breakpoint
UPDATE "approval_links" SET "mode" = 'shared';--> statement-breakpoint
ALTER TABLE "approval_links" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "approval_links" ADD COLUMN "recipient_contact" text;--> statement-breakpoint
ALTER TABLE "approval_links" ADD COLUMN "used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_links" ADD COLUMN "used_reason" "approval_link_used_reason";--> statement-breakpoint
ALTER TABLE "approval_links" ADD COLUMN "superseded_by_link_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_link_opens" ADD CONSTRAINT "approval_link_opens_link_id_approval_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."approval_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_link_opens_link_opened_idx" ON "approval_link_opens" USING btree ("link_id","opened_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "approval_links" ADD CONSTRAINT "approval_links_superseded_by_link_id_approval_links_id_fk" FOREIGN KEY ("superseded_by_link_id") REFERENCES "public"."approval_links"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decisions_request_link_post_uniq" ON "approval_decisions" USING btree ("request_id","link_id","post_id");