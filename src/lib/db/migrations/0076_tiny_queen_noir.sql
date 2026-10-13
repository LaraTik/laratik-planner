CREATE TABLE IF NOT EXISTS "advertising_spend_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"sync_run_id" uuid,
	"external_ad_id" text NOT NULL,
	"external_campaign_id" text,
	"external_ad_set_id" text,
	"report_date" date NOT NULL,
	"currency" text NOT NULL,
	"spend" numeric(18, 6) NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"attribution_window" text DEFAULT 'account' NOT NULL,
	"action_report_time" text DEFAULT 'mixed' NOT NULL,
	"provider_data_version" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advertising_spend_reconciliation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"currency" text NOT NULL,
	"attribution_window" text NOT NULL,
	"provider_account_spend" numeric(18, 6) NOT NULL,
	"canonical_ad_spend" numeric(18, 6) NOT NULL,
	"workspace_attributed_spend" numeric(18, 6) NOT NULL,
	"unallocated_spend" numeric(18, 6) NOT NULL,
	"discrepancy" numeric(18, 6) NOT NULL,
	"completeness" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_pkey') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_reconciliation_pkey') THEN
    ALTER TABLE "advertising_spend_reconciliation" ADD CONSTRAINT "advertising_spend_reconciliation_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_amount_valid') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_amount_valid" CHECK ("spend" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_counts_valid') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_counts_valid" CHECK ("impressions" >= 0 AND "clicks" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_reconciliation_completeness_valid') THEN
    ALTER TABLE "advertising_spend_reconciliation" ADD CONSTRAINT "advertising_spend_reconciliation_completeness_valid" CHECK ("completeness" IN ('complete', 'partial', 'unavailable'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_agency_id_agency_id_fk') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_account_id_advertising_account_id_fk') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_connection_id_advertising_connection_id_fk') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_connection_id_advertising_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."advertising_connection"("id") ON DELETE restrict;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_sync_run_id_advertising_sync_run_id_fk') THEN
    ALTER TABLE "advertising_spend_observation" ADD CONSTRAINT "advertising_spend_observation_sync_run_id_advertising_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."advertising_sync_run"("id") ON DELETE set null;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_reconciliation_agency_id_agency_id_fk') THEN
    ALTER TABLE "advertising_spend_reconciliation" ADD CONSTRAINT "advertising_spend_reconciliation_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agency"("id") ON DELETE cascade;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_reconciliation_account_id_advertising_account_id_fk') THEN
    ALTER TABLE "advertising_spend_reconciliation" ADD CONSTRAINT "advertising_spend_reconciliation_account_id_advertising_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."advertising_account"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_spend_observation_identity_uniq" ON "advertising_spend_observation" USING btree ("agency_id","account_id","external_ad_id","report_date","attribution_window","action_report_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_spend_observation_account_date_idx" ON "advertising_spend_observation" USING btree ("account_id","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_spend_reconciliation_identity_uniq" ON "advertising_spend_reconciliation" USING btree ("agency_id","account_id","report_date","attribution_window");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_spend_reconciliation_account_date_idx" ON "advertising_spend_reconciliation" USING btree ("account_id","report_date");
