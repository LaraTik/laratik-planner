CREATE TABLE "workspace_assistant_run_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_run_event_sequence_valid" CHECK ("workspace_assistant_run_event"."sequence" BETWEEN 1 AND 64),
	CONSTRAINT "workspace_assistant_run_event_type_valid" CHECK ("workspace_assistant_run_event"."type" IN ('run_started', 'context_resolved', 'skills_selected', 'plan_analyzed', 'provider_started', 'tool_started', 'tool_completed', 'tool_failed', 'response_validated', 'run_completed', 'run_failed', 'run_cancelled')),
	CONSTRAINT "workspace_assistant_run_event_detail_size_valid" CHECK (octet_length("workspace_assistant_run_event"."detail"::text) <= 4096)
);
--> statement-breakpoint
CREATE TABLE "workspace_assistant_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"conversation_id" uuid,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"terminal_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_assistant_run_status_valid" CHECK ("workspace_assistant_run"."status" IN ('running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "workspace_assistant_run_sequence_valid" CHECK ("workspace_assistant_run"."last_sequence" BETWEEN 0 AND 64)
);
--> statement-breakpoint
ALTER TABLE "workspace_assistant_run_event" ADD CONSTRAINT "workspace_assistant_run_event_run_id_workspace_assistant_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workspace_assistant_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_run" ADD CONSTRAINT "workspace_assistant_run_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_run" ADD CONSTRAINT "workspace_assistant_run_conversation_id_workspace_assistant_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."workspace_assistant_conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_assistant_run" ADD CONSTRAINT "workspace_assistant_run_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_assistant_run_event_sequence_idx" ON "workspace_assistant_run_event" USING btree ("run_id","sequence");--> statement-breakpoint
CREATE INDEX "workspace_assistant_run_event_created_idx" ON "workspace_assistant_run_event" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_assistant_run_owner_idx" ON "workspace_assistant_run" USING btree ("workspace_id","owner_id","created_at");--> statement-breakpoint
CREATE INDEX "workspace_assistant_run_expiry_idx" ON "workspace_assistant_run" USING btree ("expires_at");