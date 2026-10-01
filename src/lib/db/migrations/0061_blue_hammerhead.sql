CREATE TABLE "research_watchlist_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"source_url" text NOT NULL,
	"provider_status" text DEFAULT 'manual' NOT NULL,
	"provider_error_code" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_watchlist_platform_valid" CHECK ("research_watchlist_account"."platform" IN ('instagram', 'facebook', 'tiktok', 'youtube')),
	CONSTRAINT "research_watchlist_provider_status_valid" CHECK ("research_watchlist_account"."provider_status" IN ('manual', 'available', 'unsupported', 'error'))
);
--> statement-breakpoint
ALTER TABLE "research_watchlist_account" ADD CONSTRAINT "research_watchlist_account_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_watchlist_account" ADD CONSTRAINT "research_watchlist_account_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_watchlist_workspace_platform_handle_unique" ON "research_watchlist_account" USING btree ("workspace_id","platform","handle");--> statement-breakpoint
CREATE INDEX "research_watchlist_workspace_created_idx" ON "research_watchlist_account" USING btree ("workspace_id","created_at");