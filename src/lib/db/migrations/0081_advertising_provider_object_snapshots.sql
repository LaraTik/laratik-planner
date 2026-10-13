CREATE TABLE IF NOT EXISTS "advertising_provider_object" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "advertising_account"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "advertising_connection"("id") ON DELETE RESTRICT,
  "sync_run_id" uuid REFERENCES "advertising_sync_run"("id") ON DELETE SET NULL,
  "object_type" text NOT NULL,
  "external_object_id" text NOT NULL,
  "parent_external_object_id" text,
  "name" text,
  "status" text,
  "objective" text,
  "daily_budget" numeric(18, 6),
  "lifetime_budget" numeric(18, 6),
  "promoted_post_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "observed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "advertising_provider_object_type_valid" CHECK ("object_type" IN ('campaign', 'adset', 'ad', 'creative'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_provider_object_identity_uniq"
  ON "advertising_provider_object" ("agency_id", "account_id", "object_type", "external_object_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_provider_object_account_type_idx"
  ON "advertising_provider_object" ("account_id", "object_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_provider_object_promoted_post_idx"
  ON "advertising_provider_object" ("promoted_post_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION advertising_assert_provider_object_ownership()
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
    RAISE EXCEPTION 'advertising provider object tenant ownership mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  IF NEW.sync_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM advertising_sync_run
    WHERE id = NEW.sync_run_id
      AND account_id = NEW.account_id
      AND connection_id = NEW.connection_id
  ) THEN
    RAISE EXCEPTION 'advertising provider object sync run mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS advertising_provider_object_tenant_guard
  ON advertising_provider_object;
CREATE TRIGGER advertising_provider_object_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_provider_object
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_provider_object_ownership();
