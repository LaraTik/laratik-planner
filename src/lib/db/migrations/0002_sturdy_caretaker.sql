ALTER TABLE "agency" ALTER COLUMN "settings" SET DATA TYPE jsonb USING "settings"::jsonb;--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "channel_targets" SET DATA TYPE jsonb USING "channel_targets"::jsonb;--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "format_targets" SET DATA TYPE jsonb USING "format_targets"::jsonb;--> statement-breakpoint
ALTER TABLE "brand_asset" ALTER COLUMN "value" SET DATA TYPE jsonb USING "value"::jsonb;--> statement-breakpoint
ALTER TABLE "content_template" ALTER COLUMN "format_payload" SET DATA TYPE jsonb USING "format_payload"::jsonb;--> statement-breakpoint
ALTER TABLE "content_template" ALTER COLUMN "relative_schedule_rule" SET DATA TYPE jsonb USING "relative_schedule_rule"::jsonb;--> statement-breakpoint
ALTER TABLE "content_item_channel" ALTER COLUMN "platform_payload" SET DATA TYPE jsonb USING "platform_payload"::jsonb;--> statement-breakpoint
ALTER TABLE "content_item" ALTER COLUMN "format_payload" SET DATA TYPE jsonb USING "format_payload"::jsonb;--> statement-breakpoint
ALTER TABLE "activity_event" ALTER COLUMN "before_data" SET DATA TYPE jsonb USING "before_data"::jsonb;--> statement-breakpoint
ALTER TABLE "activity_event" ALTER COLUMN "after_data" SET DATA TYPE jsonb USING "after_data"::jsonb;--> statement-breakpoint
ALTER TABLE "activity_event" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "outbox_event" ALTER COLUMN "payload" SET DATA TYPE jsonb USING "payload"::jsonb;--> statement-breakpoint
ALTER TABLE "security_audit_event" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "ai_usage_event" ALTER COLUMN "context_manifest" SET DATA TYPE jsonb USING "context_manifest"::jsonb;