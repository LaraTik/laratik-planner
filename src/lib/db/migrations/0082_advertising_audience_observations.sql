CREATE TABLE IF NOT EXISTS "advertising_audience_observation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "advertising_account"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "advertising_connection"("id") ON DELETE RESTRICT,
  "sync_run_id" uuid REFERENCES "advertising_sync_run"("id") ON DELETE SET NULL,
  "report_date" date NOT NULL,
  "breakdown" text NOT NULL,
  "dimension_value" text NOT NULL,
  "currency" text NOT NULL,
  "spend" numeric(18, 6) NOT NULL,
  "impressions" integer,
  "clicks" integer,
  "reach" integer,
  "attribution_window" text NOT NULL,
  "action_report_time" text NOT NULL,
  "observed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "advertising_audience_observation_breakdown_valid" CHECK ("breakdown" IN ('age', 'gender', 'placement', 'device_platform', 'country', 'region')),
  CONSTRAINT "advertising_audience_observation_counts_valid" CHECK (("impressions" IS NULL OR "impressions" >= 0) AND ("clicks" IS NULL OR "clicks" >= 0) AND ("reach" IS NULL OR "reach" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_audience_observation_identity_uniq"
  ON "advertising_audience_observation" ("agency_id", "account_id", "report_date", "breakdown", "dimension_value", "attribution_window", "action_report_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_audience_observation_account_date_idx"
  ON "advertising_audience_observation" ("account_id", "report_date");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION advertising_assert_audience_observation_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_agency uuid;
  connection_agency uuid;
BEGIN
  SELECT agency_id INTO account_agency FROM advertising_account WHERE id = NEW.account_id;
  SELECT agency_id INTO connection_agency FROM advertising_connection WHERE id = NEW.connection_id;
  IF account_agency IS NULL OR connection_agency IS NULL
     OR account_agency <> NEW.agency_id OR connection_agency <> NEW.agency_id THEN
    RAISE EXCEPTION 'advertising audience observation tenant ownership mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  IF NEW.sync_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM advertising_sync_run
    WHERE id = NEW.sync_run_id
      AND account_id = NEW.account_id
      AND connection_id = NEW.connection_id
  ) THEN
    RAISE EXCEPTION 'advertising audience observation sync run mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS advertising_audience_observation_tenant_guard
  ON advertising_audience_observation;
CREATE TRIGGER advertising_audience_observation_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_audience_observation
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_audience_observation_ownership();
