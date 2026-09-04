ALTER TABLE "outbox_event" ADD COLUMN IF NOT EXISTS "email_processed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN IF NOT EXISTS "email_attempt_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN IF NOT EXISTS "email_last_error" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_email_unprocessed_idx" ON "outbox_event" USING btree ("available_at") WHERE email_processed_at IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_email_delivery" (
	"outbox_event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_email_delivery_outbox_event_id_user_id_pk" PRIMARY KEY("outbox_event_id","user_id")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_email_delivery_outbox_event_id_outbox_event_id_fk'
      AND conrelid = 'notification_email_delivery'::regclass
  ) THEN
    ALTER TABLE "notification_email_delivery"
      ADD CONSTRAINT "notification_email_delivery_outbox_event_id_outbox_event_id_fk"
      FOREIGN KEY ("outbox_event_id") REFERENCES "public"."outbox_event"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_email_delivery_user_id_user_id_fk'
      AND conrelid = 'notification_email_delivery'::regclass
  ) THEN
    ALTER TABLE "notification_email_delivery"
      ADD CONSTRAINT "notification_email_delivery_user_id_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_email_delivery_pending_idx" ON "notification_email_delivery" USING btree ("outbox_event_id","processed_at");
--> statement-breakpoint
UPDATE "outbox_event"
SET "email_processed_at" = "processed_at"
WHERE "processed_at" IS NOT NULL AND "email_processed_at" IS NULL;
