DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertising_validation_operation_valid'
      AND conrelid = 'advertising_validation_result'::regclass
  ) THEN
    ALTER TABLE "advertising_validation_result"
      DROP CONSTRAINT "advertising_validation_operation_valid";
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertising_validation_operation_valid'
      AND conrelid = 'advertising_validation_result'::regclass
  ) THEN
    ALTER TABLE "advertising_validation_result"
      ADD CONSTRAINT "advertising_validation_operation_valid"
      CHECK ("advertising_validation_result"."operation" IN ('account_discovery', 'campaign_read', 'adset_read', 'ad_read', 'creative_read', 'daily_insights_read', 'breakdown_read', 'page_read', 'instagram_read', 'report_read', 'financial_read', 'diagnostics'));
  END IF;
END $$;
