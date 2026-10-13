CREATE TABLE IF NOT EXISTS "advertising_provider_account_identity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" text NOT NULL,
  "external_account_id" text NOT NULL,
  "name" text NOT NULL,
  "currency" text,
  "timezone" text,
  "status" text DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_provider_account_identity_provider_external_uniq"
  ON "advertising_provider_account_identity" ("provider", "external_account_id");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_provider_account_identity_provider_valid') THEN
    ALTER TABLE "advertising_provider_account_identity"
      ADD CONSTRAINT "advertising_provider_account_identity_provider_valid"
      CHECK ("provider" IN ('meta'));
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_provider_account_identity_status_valid') THEN
    ALTER TABLE "advertising_provider_account_identity"
      ADD CONSTRAINT "advertising_provider_account_identity_status_valid"
      CHECK ("status" IN ('active', 'unavailable', 'revoked'));
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "advertising_connection_agency_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL REFERENCES "advertising_connection"("id") ON DELETE CASCADE,
  "agency_id" uuid NOT NULL REFERENCES "agency"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'active' NOT NULL,
  "granted_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_connection_agency_access_uniq"
  ON "advertising_connection_agency_access" ("connection_id", "agency_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "advertising_connection_agency_access_agency_idx"
  ON "advertising_connection_agency_access" ("agency_id", "status");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_connection_agency_access_status_valid') THEN
    ALTER TABLE "advertising_connection_agency_access"
      ADD CONSTRAINT "advertising_connection_agency_access_status_valid"
      CHECK ("status" IN ('active', 'revoked'));
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "advertising_account"
  ADD COLUMN IF NOT EXISTS "identity_id" uuid
  REFERENCES "advertising_provider_account_identity"("id") ON DELETE RESTRICT;
--> statement-breakpoint

INSERT INTO "advertising_provider_account_identity"
  ("provider", "external_account_id", "name", "currency", "timezone", "status", "metadata", "first_seen_at", "last_seen_at")
SELECT DISTINCT ON ("provider", "external_account_id")
  "provider", "external_account_id", "name", "currency", "timezone", "status", "metadata", "first_seen_at", "last_seen_at"
FROM "advertising_account"
ORDER BY "provider", "external_account_id", "updated_at" DESC, "id";
--> statement-breakpoint

UPDATE "advertising_account" account_row
SET "identity_id" = identity_row."id"
FROM "advertising_provider_account_identity" identity_row
WHERE identity_row."provider" = account_row."provider"
  AND identity_row."external_account_id" = account_row."external_account_id"
  AND account_row."identity_id" IS NULL;
--> statement-breakpoint

INSERT INTO "advertising_connection_agency_access" ("connection_id", "agency_id")
SELECT "id", "agency_id" FROM "advertising_connection"
ON CONFLICT ("connection_id", "agency_id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "advertising_spend_observation"
  ADD COLUMN IF NOT EXISTS "financial_allocation_status" text DEFAULT 'attributed' NOT NULL,
  ADD COLUMN IF NOT EXISTS "financial_allocation_reason" text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_spend_observation_financial_status_valid') THEN
    ALTER TABLE "advertising_spend_observation"
      ADD CONSTRAINT "advertising_spend_observation_financial_status_valid"
      CHECK ("financial_allocation_status" IN ('attributed', 'unallocated', 'disputed'));
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "advertising_canonical_spend_fact" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "identity_id" uuid NOT NULL REFERENCES "advertising_provider_account_identity"("id") ON DELETE CASCADE,
  "sync_run_id" uuid REFERENCES "advertising_sync_run"("id") ON DELETE SET NULL,
  "external_ad_id" text NOT NULL,
  "external_campaign_id" text,
  "external_ad_set_id" text,
  "report_date" date NOT NULL,
  "currency" text NOT NULL,
  "spend" numeric(18, 6) NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "reach" integer,
  "results" integer,
  "result_type" text,
  "result_actions" jsonb,
  "attribution_window" text DEFAULT 'account' NOT NULL,
  "action_report_time" text DEFAULT 'mixed' NOT NULL,
  "financial_allocation_status" text DEFAULT 'attributed' NOT NULL,
  "financial_allocation_reason" text,
  "observed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "advertising_canonical_spend_fact_financial_status_valid"
    CHECK ("financial_allocation_status" IN ('attributed', 'unallocated', 'disputed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "advertising_canonical_spend_fact_identity_uniq"
  ON "advertising_canonical_spend_fact" ("identity_id", "external_ad_id", "report_date", "attribution_window", "action_report_time");
CREATE INDEX IF NOT EXISTS "advertising_canonical_spend_fact_identity_date_idx"
  ON "advertising_canonical_spend_fact" ("identity_id", "report_date");

INSERT INTO "advertising_canonical_spend_fact"
  ("identity_id", "sync_run_id", "external_ad_id", "external_campaign_id", "external_ad_set_id", "report_date", "currency", "spend", "impressions", "clicks", "reach", "results", "result_type", "result_actions", "attribution_window", "action_report_time", "financial_allocation_status", "financial_allocation_reason", "observed_at", "created_at", "updated_at")
SELECT DISTINCT ON (account_row."identity_id", fact."external_ad_id", fact."report_date", fact."attribution_window", fact."action_report_time")
  account_row."identity_id", fact."sync_run_id", fact."external_ad_id", fact."external_campaign_id", fact."external_ad_set_id", fact."report_date", fact."currency", fact."spend", fact."impressions", fact."clicks", fact."reach", fact."results", fact."result_type", fact."result_actions", fact."attribution_window", fact."action_report_time", fact."financial_allocation_status", fact."financial_allocation_reason", fact."observed_at", fact."created_at", fact."updated_at"
FROM "advertising_spend_observation" fact
JOIN "advertising_account" account_row ON account_row."id" = fact."account_id"
WHERE account_row."identity_id" IS NOT NULL
ORDER BY account_row."identity_id", fact."external_ad_id", fact."report_date", fact."attribution_window", fact."action_report_time", fact."observed_at" DESC;

ALTER TABLE "advertising_provider_object"
  ADD COLUMN IF NOT EXISTS "post_association_status" text DEFAULT 'unresolved' NOT NULL;
UPDATE "advertising_provider_object"
SET "post_association_status" = 'linked'
WHERE "promoted_post_id" IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advertising_provider_object_post_association_status_valid') THEN
    ALTER TABLE "advertising_provider_object"
      ADD CONSTRAINT "advertising_provider_object_post_association_status_valid"
      CHECK ("post_association_status" IN ('linked', 'unresolved', 'unsupported', 'unpublished'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION advertising_assert_tenant_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  connection_agency uuid;
  account_agency uuid;
  workspace_agency uuid;
  connection_owner_type text;
  state_connection_id uuid;
  state_account_id uuid;
BEGIN
  IF TG_TABLE_NAME IN (
    'advertising_connection_account',
    'advertising_capability',
    'advertising_sync_state',
    'advertising_sync_run'
  ) THEN
    SELECT agency_id, owner_type INTO connection_agency, connection_owner_type
    FROM advertising_connection WHERE id = NEW.connection_id;
    SELECT agency_id INTO account_agency
    FROM advertising_account WHERE id = NEW.account_id;
    IF connection_agency IS NULL OR account_agency IS NULL THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
    IF connection_agency <> account_agency AND NOT (
      connection_owner_type = 'platform' AND EXISTS (
        SELECT 1 FROM advertising_connection_agency_access access_row
        WHERE access_row.connection_id = NEW.connection_id
          AND access_row.agency_id = account_agency
          AND access_row.status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('advertising_social_identity', 'advertising_validation_result', 'advertising_spend_observation') THEN
    SELECT agency_id, owner_type INTO connection_agency, connection_owner_type
    FROM advertising_connection WHERE id = NEW.connection_id;
    IF connection_agency IS NULL OR (
      connection_agency <> NEW.agency_id AND NOT (
        connection_owner_type = 'platform' AND EXISTS (
          SELECT 1 FROM advertising_connection_agency_access access_row
          WHERE access_row.connection_id = NEW.connection_id
            AND access_row.agency_id = NEW.agency_id
            AND access_row.status = 'active'
        )
      )
    ) THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
    IF NEW.account_id IS NOT NULL THEN
      SELECT agency_id INTO account_agency FROM advertising_account WHERE id = NEW.account_id;
      IF account_agency IS NULL OR account_agency <> NEW.agency_id THEN
        RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
          USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('advertising_visibility_grant', 'advertising_financial_authority') THEN
    SELECT agency_id INTO account_agency FROM advertising_account WHERE id = NEW.account_id;
    IF account_agency IS NULL OR account_agency <> NEW.agency_id THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
    IF NEW.workspace_id IS NOT NULL THEN
      SELECT agency_id INTO workspace_agency FROM workspace WHERE id = NEW.workspace_id;
      IF workspace_agency IS NULL OR workspace_agency <> NEW.agency_id THEN
        RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
          USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'advertising_sync_run' THEN
    SELECT connection_id, account_id INTO state_connection_id, state_account_id
    FROM advertising_sync_state WHERE id = NEW.sync_state_id;
    IF state_connection_id IS NULL OR state_account_id IS NULL
       OR state_connection_id <> NEW.connection_id OR state_account_id <> NEW.account_id THEN
      RAISE EXCEPTION 'advertising sync run does not match its sync state'
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'advertising_spend_reconciliation' THEN
    SELECT agency_id INTO account_agency FROM advertising_account WHERE id = NEW.account_id;
    IF account_agency IS NULL OR account_agency <> NEW.agency_id THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION advertising_assert_provider_object_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_agency uuid;
  connection_agency uuid;
  connection_owner_type text;
BEGIN
  SELECT agency_id INTO account_agency FROM advertising_account WHERE id = NEW.account_id;
  SELECT agency_id, owner_type INTO connection_agency, connection_owner_type
  FROM advertising_connection WHERE id = NEW.connection_id;
  IF account_agency IS NULL OR connection_agency IS NULL OR account_agency <> NEW.agency_id
     OR (connection_agency <> NEW.agency_id AND NOT (
       connection_owner_type = 'platform' AND EXISTS (
         SELECT 1 FROM advertising_connection_agency_access access_row
         WHERE access_row.connection_id = NEW.connection_id
           AND access_row.agency_id = NEW.agency_id
           AND access_row.status = 'active'
       )
     )) THEN
    RAISE EXCEPTION 'advertising provider object tenant ownership mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  IF NEW.sync_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM advertising_sync_run
    WHERE id = NEW.sync_run_id AND account_id = NEW.account_id AND connection_id = NEW.connection_id
  ) THEN
    RAISE EXCEPTION 'advertising provider object sync run mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION advertising_assert_audience_observation_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_agency uuid;
  connection_agency uuid;
  connection_owner_type text;
BEGIN
  SELECT agency_id INTO account_agency FROM advertising_account WHERE id = NEW.account_id;
  SELECT agency_id, owner_type INTO connection_agency, connection_owner_type
  FROM advertising_connection WHERE id = NEW.connection_id;
  IF account_agency IS NULL OR connection_agency IS NULL OR account_agency <> NEW.agency_id
     OR (connection_agency <> NEW.agency_id AND NOT (
       connection_owner_type = 'platform' AND EXISTS (
         SELECT 1 FROM advertising_connection_agency_access access_row
         WHERE access_row.connection_id = NEW.connection_id
           AND access_row.agency_id = NEW.agency_id
           AND access_row.status = 'active'
       )
     )) THEN
    RAISE EXCEPTION 'advertising audience observation tenant ownership mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  IF NEW.sync_run_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM advertising_sync_run
    WHERE id = NEW.sync_run_id AND account_id = NEW.account_id AND connection_id = NEW.connection_id
  ) THEN
    RAISE EXCEPTION 'advertising audience observation sync run mismatch'
      USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
  END IF;
  RETURN NEW;
END;
$$;
