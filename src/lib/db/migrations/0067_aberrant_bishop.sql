CREATE TABLE "research_watchlist_member" (
	"watchlist_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_watchlist_member_position_nonnegative" CHECK ("research_watchlist_member"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "research_watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"share_scope" text DEFAULT 'me' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_watchlist_share_scope_valid" CHECK ("research_watchlist"."share_scope" IN ('me', 'workspace'))
);
--> statement-breakpoint
ALTER TABLE "research_watchlist_member" ADD CONSTRAINT "research_watchlist_member_watchlist_id_research_watchlist_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."research_watchlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_watchlist_member" ADD CONSTRAINT "research_watchlist_member_account_id_research_watchlist_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."research_watchlist_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_watchlist" ADD CONSTRAINT "research_watchlist_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_watchlist" ADD CONSTRAINT "research_watchlist_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "research_watchlist_member_unique" ON "research_watchlist_member" USING btree ("watchlist_id","account_id");--> statement-breakpoint
CREATE INDEX "research_watchlist_member_account_idx" ON "research_watchlist_member" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "research_watchlist_workspace_owner_name_unique" ON "research_watchlist" USING btree ("workspace_id","created_by","name") WHERE "research_watchlist"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "research_named_watchlist_workspace_created_idx" ON "research_watchlist" USING btree ("workspace_id","created_at");