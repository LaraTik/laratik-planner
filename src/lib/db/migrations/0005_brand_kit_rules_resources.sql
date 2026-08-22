CREATE TABLE "brand_linked_resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_linked_resource_provider_valid" CHECK ("brand_linked_resource"."provider" IN ('google_drive', 'figma', 'canva', 'dropbox', 'other')),
	CONSTRAINT "brand_linked_resource_url_https" CHECK ("brand_linked_resource"."url" ~* '^https://')
);
--> statement-breakpoint
CREATE TABLE "brand_publishing_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_publishing_rule_type_valid" CHECK ("brand_publishing_rule"."rule_type" IN ('alt_text', 'hashtag', 'compliance', 'channel', 'general'))
);
--> statement-breakpoint
ALTER TABLE "brand_linked_resource" ADD CONSTRAINT "brand_linked_resource_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_linked_resource" ADD CONSTRAINT "brand_linked_resource_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_publishing_rule" ADD CONSTRAINT "brand_publishing_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_publishing_rule" ADD CONSTRAINT "brand_publishing_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_linked_resource_workspace_idx" ON "brand_linked_resource" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "brand_publishing_rule_workspace_idx" ON "brand_publishing_rule" USING btree ("workspace_id","sort_order");