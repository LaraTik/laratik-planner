CREATE TABLE IF NOT EXISTS "agency_task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assignee_id" uuid,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"archived_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_task_title_not_empty" CHECK (length(trim("agency_task"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "agency_task_status_valid" CHECK ("agency_task"."status" IN ('backlog', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled')),
	CONSTRAINT "agency_task_priority_valid" CHECK ("agency_task"."priority" IN ('low', 'normal', 'high', 'urgent')),
	CONSTRAINT "agency_task_done_has_completion" CHECK ("agency_task"."status" <> 'done' OR "agency_task"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_activity_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"before_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_attachment_status_valid" CHECK ("task_attachment"."status" IN ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_task_agency_id_agency_id_fk') THEN
    ALTER TABLE "agency_task" ADD CONSTRAINT "agency_task_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_task_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "agency_task" ADD CONSTRAINT "agency_task_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_task_assignee_id_user_id_fk') THEN
    ALTER TABLE "agency_task" ADD CONSTRAINT "agency_task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_task_archived_by_user_id_fk') THEN
    ALTER TABLE "agency_task" ADD CONSTRAINT "agency_task_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agency_task_created_by_user_id_fk') THEN
    ALTER TABLE "agency_task" ADD CONSTRAINT "agency_task_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_activity_event_agency_id_agency_id_fk') THEN
    ALTER TABLE "task_activity_event" ADD CONSTRAINT "task_activity_event_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_activity_event_task_id_agency_task_id_fk') THEN
    ALTER TABLE "task_activity_event" ADD CONSTRAINT "task_activity_event_task_id_agency_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agency_task"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_activity_event_actor_id_user_id_fk') THEN
    ALTER TABLE "task_activity_event" ADD CONSTRAINT "task_activity_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_attachment_agency_id_agency_id_fk') THEN
    ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_attachment_task_id_agency_task_id_fk') THEN
    ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_task_id_agency_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."agency_task"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_attachment_uploaded_by_user_id_fk') THEN
    ALTER TABLE "task_attachment" ADD CONSTRAINT "task_attachment_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_task_agency_status_due_idx" ON "agency_task" USING btree ("agency_id","status","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_task_agency_assignee_status_idx" ON "agency_task" USING btree ("agency_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_task_workspace_due_idx" ON "agency_task" USING btree ("workspace_id","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agency_task_created_idx" ON "agency_task" USING btree ("agency_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activity_task_created_idx" ON "task_activity_event" USING btree ("task_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_activity_agency_created_idx" ON "task_activity_event" USING btree ("agency_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_attachment_task_created_idx" ON "task_attachment" USING btree ("task_id","created_at" DESC);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_task_activity_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'task_activity_event is append-only';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS task_activity_event_append_only ON "task_activity_event";
--> statement-breakpoint
CREATE TRIGGER task_activity_event_append_only
BEFORE UPDATE OR DELETE ON "task_activity_event"
FOR EACH ROW EXECUTE FUNCTION prevent_task_activity_mutation();
