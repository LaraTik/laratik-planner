-- Fix the validation-result branch of the advertising tenant guard.
--
-- advertising_validation_result is intentionally connection-scoped and has no
-- agency_id column. The 0084 shared-identity update grouped it with rows that
-- do carry agency_id, so every validation insert failed with a PostgreSQL
-- "record NEW has no field agency_id" error. Keep validation history scoped by
-- its connection and, when account-bound, require the account to belong to the
-- connection owner or an active platform grant.

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

  IF TG_TABLE_NAME IN ('advertising_social_identity', 'advertising_spend_observation') THEN
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

  IF TG_TABLE_NAME = 'advertising_validation_result' THEN
    SELECT agency_id, owner_type INTO connection_agency, connection_owner_type
    FROM advertising_connection WHERE id = NEW.connection_id;
    IF connection_agency IS NULL THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
    IF NEW.account_id IS NOT NULL THEN
      SELECT agency_id INTO account_agency
      FROM advertising_account WHERE id = NEW.account_id;
      IF account_agency IS NULL OR NOT (
        account_agency = connection_agency OR (
          connection_owner_type = 'platform' AND EXISTS (
            SELECT 1 FROM advertising_connection_agency_access access_row
            WHERE access_row.connection_id = NEW.connection_id
              AND access_row.agency_id = account_agency
              AND access_row.status = 'active'
          )
        )
      ) THEN
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
