ALTER TABLE "workspace_membership" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN "error_name" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN "cause_message" text;--> statement-breakpoint
ALTER TABLE "app_error_event" ADD COLUMN "component_stack" text;