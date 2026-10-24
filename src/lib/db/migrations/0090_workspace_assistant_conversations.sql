CREATE TABLE "workspace_assistant_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_conversation_title_valid" CHECK (length(trim("workspace_assistant_conversation"."title")) BETWEEN 1 AND 160)
);
--> statement-breakpoint
CREATE TABLE "workspace_assistant_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_message_role_valid" CHECK ("workspace_assistant_message"."role" IN ('user', 'assistant')),
	CONSTRAINT "workspace_assistant_message_content_length" CHECK (length("workspace_assistant_message"."content") BETWEEN 1 AND 12000)
);
--> statement-breakpoint
ALTER TABLE "workspace_assistant_conversation" ADD CONSTRAINT "workspace_assistant_conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_conversation" ADD CONSTRAINT "workspace_assistant_conversation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_message" ADD CONSTRAINT "workspace_assistant_message_conversation_id_workspace_assistant_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."workspace_assistant_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_assistant_conversation_owner_idx" ON "workspace_assistant_conversation" USING btree ("workspace_id","owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "workspace_assistant_message_conversation_created_idx" ON "workspace_assistant_message" USING btree ("conversation_id","created_at");