-- Advertising tenant-ownership guards.
--
-- The advertising foundation already has ordinary foreign keys and service
-- authorization. These triggers add the missing database invariant: a
-- connection/account link, capability, sync row, observation, validation
-- result, grant, or reconciliation row cannot combine resources from
-- different agencies. This is intentionally a narrow guard, not a generalized
-- RLS replacement.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM advertising_connection_account link
    JOIN advertising_connection connection_row ON connection_row.id = link.connection_id
    JOIN advertising_account account_row ON account_row.id = link.account_id
    WHERE connection_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_capability capability_row
    JOIN advertising_connection connection_row ON connection_row.id = capability_row.connection_id
    JOIN advertising_account account_row ON account_row.id = capability_row.account_id
    WHERE connection_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_sync_state sync_row
    JOIN advertising_connection connection_row ON connection_row.id = sync_row.connection_id
    JOIN advertising_account account_row ON account_row.id = sync_row.account_id
    WHERE connection_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_sync_run run_row
    JOIN advertising_sync_state sync_row ON sync_row.id = run_row.sync_state_id
    JOIN advertising_connection connection_row ON connection_row.id = run_row.connection_id
    JOIN advertising_account account_row ON account_row.id = run_row.account_id
    WHERE connection_row.agency_id <> account_row.agency_id
       OR sync_row.connection_id <> run_row.connection_id
       OR sync_row.account_id <> run_row.account_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_social_identity identity_row
    JOIN advertising_connection connection_row ON connection_row.id = identity_row.connection_id
    WHERE connection_row.agency_id <> identity_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_social_identity identity_row
    JOIN advertising_account account_row ON account_row.id = identity_row.account_id
    WHERE identity_row.account_id IS NOT NULL
      AND account_row.agency_id <> identity_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_validation_result validation_row
    JOIN advertising_connection connection_row ON connection_row.id = validation_row.connection_id
    JOIN advertising_account account_row ON account_row.id = validation_row.account_id
    WHERE validation_row.account_id IS NOT NULL
      AND connection_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_spend_observation observation_row
    JOIN advertising_connection connection_row ON connection_row.id = observation_row.connection_id
    JOIN advertising_account account_row ON account_row.id = observation_row.account_id
    WHERE observation_row.agency_id <> connection_row.agency_id
       OR observation_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_spend_reconciliation reconciliation_row
    JOIN advertising_account account_row ON account_row.id = reconciliation_row.account_id
    WHERE reconciliation_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_visibility_grant grant_row
    JOIN advertising_account account_row ON account_row.id = grant_row.account_id
    WHERE grant_row.agency_id <> account_row.agency_id
  ) OR EXISTS (
    SELECT 1
    FROM advertising_financial_authority authority_row
    JOIN advertising_account account_row ON account_row.id = authority_row.account_id
    WHERE authority_row.agency_id <> account_row.agency_id
  ) THEN
    RAISE EXCEPTION 'advertising tenant ownership violation exists before guard installation';
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
  state_connection_id uuid;
  state_account_id uuid;
BEGIN
  IF TG_TABLE_NAME IN (
    'advertising_connection_account',
    'advertising_capability',
    'advertising_sync_state',
    'advertising_sync_run'
  ) THEN
    SELECT agency_id INTO connection_agency
    FROM advertising_connection
    WHERE id = NEW.connection_id;

    SELECT agency_id INTO account_agency
    FROM advertising_account
    WHERE id = NEW.account_id;

    IF connection_agency IS NULL
       OR account_agency IS NULL
       OR connection_agency <> account_agency THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
  END IF;

  IF TG_TABLE_NAME IN (
    'advertising_social_identity',
    'advertising_validation_result',
    'advertising_spend_observation'
  ) THEN
    SELECT agency_id INTO connection_agency
    FROM advertising_connection
    WHERE id = NEW.connection_id;

    IF connection_agency IS NULL OR connection_agency <> NEW.agency_id THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;

    IF NEW.account_id IS NOT NULL THEN
      SELECT agency_id INTO account_agency
      FROM advertising_account
      WHERE id = NEW.account_id;

      IF account_agency IS NULL OR account_agency <> NEW.agency_id THEN
        RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
          USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME IN ('advertising_visibility_grant', 'advertising_financial_authority') THEN
    SELECT agency_id INTO account_agency
    FROM advertising_account
    WHERE id = NEW.account_id;

    IF account_agency IS NULL OR account_agency <> NEW.agency_id THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;

    IF NEW.workspace_id IS NOT NULL THEN
      SELECT agency_id INTO workspace_agency
      FROM workspace
      WHERE id = NEW.workspace_id;

      IF workspace_agency IS NULL OR workspace_agency <> NEW.agency_id THEN
        RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
          USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'advertising_sync_run' THEN
    SELECT connection_id, account_id
      INTO state_connection_id, state_account_id
    FROM advertising_sync_state
    WHERE id = NEW.sync_state_id;

    IF state_connection_id IS NULL
       OR state_account_id IS NULL
       OR state_connection_id <> NEW.connection_id
       OR state_account_id <> NEW.account_id THEN
      RAISE EXCEPTION 'advertising sync run does not match its sync state'
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'advertising_spend_reconciliation' THEN
    SELECT agency_id INTO account_agency
    FROM advertising_account
    WHERE id = NEW.account_id;

    IF account_agency IS NULL OR account_agency <> NEW.agency_id THEN
      RAISE EXCEPTION 'advertising tenant ownership mismatch for %', TG_TABLE_NAME
        USING ERRCODE = '23514', CONSTRAINT = 'advertising_tenant_ownership_guard';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS advertising_connection_account_tenant_guard
  ON advertising_connection_account;
CREATE TRIGGER advertising_connection_account_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_connection_account
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_capability_tenant_guard
  ON advertising_capability;
CREATE TRIGGER advertising_capability_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_capability
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_sync_state_tenant_guard
  ON advertising_sync_state;
CREATE TRIGGER advertising_sync_state_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_sync_state
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_sync_run_tenant_guard
  ON advertising_sync_run;
CREATE TRIGGER advertising_sync_run_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_sync_run
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_social_identity_tenant_guard
  ON advertising_social_identity;
CREATE TRIGGER advertising_social_identity_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_social_identity
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_validation_result_tenant_guard
  ON advertising_validation_result;
CREATE TRIGGER advertising_validation_result_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_validation_result
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_spend_observation_tenant_guard
  ON advertising_spend_observation;
CREATE TRIGGER advertising_spend_observation_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_spend_observation
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_spend_reconciliation_tenant_guard
  ON advertising_spend_reconciliation;
CREATE TRIGGER advertising_spend_reconciliation_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_spend_reconciliation
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_visibility_grant_tenant_guard
  ON advertising_visibility_grant;
CREATE TRIGGER advertising_visibility_grant_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_visibility_grant
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();

DROP TRIGGER IF EXISTS advertising_financial_authority_tenant_guard
  ON advertising_financial_authority;
CREATE TRIGGER advertising_financial_authority_tenant_guard
  BEFORE INSERT OR UPDATE ON advertising_financial_authority
  FOR EACH ROW EXECUTE FUNCTION advertising_assert_tenant_ownership();
