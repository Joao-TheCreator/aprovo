ALTER TABLE "profiles" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_connection_id_instagram_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."instagram_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_connection_idx" ON "profiles" USING btree ("connection_id");