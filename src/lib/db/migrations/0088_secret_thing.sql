CREATE TABLE IF NOT EXISTS "advertising_signal_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"signal_key" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"period_since" date NOT NULL,
	"period_until" date NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"reason" text,
	"snoozed_until" timestamp with time zone,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advertising_signal_feedback_entity_type_valid" CHECK ("advertising_signal_feedback"."entity_type" IN ('campaign', 'budget', 'creative', 'audience')),
	CONSTRAINT "advertising_signal_feedback_state_valid" CHECK ("advertising_signal_feedback"."state" IN ('open', 'reviewed', 'dismissed', 'snoozed')),
	CONSTRAINT "advertising_signal_feedback_period_valid" CHECK ("advertising_signal_feedback"."period_until" >= "advertising_signal_feedback"."period_since")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_signal_feedback_agency_id_agency_id_fk') THEN
    ALTER TABLE "advertising_signal_feedback" ADD CONSTRAINT "advertising_signal_feedback_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_signal_feedback_workspace_id_workspace_id_fk') THEN
    ALTER TABLE "advertising_signal_feedback" ADD CONSTRAINT "advertising_signal_feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_signal_feedback_account_id_advertising_account_id_fk') THEN
    ALTER TABLE "advertising_signal_feedback" ADD CONSTRAINT "advertising_signal_feedback_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_signal_feedback_user_id_user_id_fk') THEN
    ALTER TABLE "advertising_signal_feedback" ADD CONSTRAINT "advertising_signal_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_signal_feedback_identity_uniq" ON "advertising_signal_feedback" USING btree ("workspace_id","account_id","user_id","signal_key","entity_type","entity_id","period_since","period_until");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_signal_feedback_workspace_period_idx" ON "advertising_signal_feedback" USING btree ("workspace_id","account_id","period_since","period_until");
