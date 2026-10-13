ALTER TABLE "advertising_spend_observation"
  ADD COLUMN IF NOT EXISTS "reach" integer,
  ADD COLUMN IF NOT EXISTS "results" integer,
  ADD COLUMN IF NOT EXISTS "result_type" text,
  ADD COLUMN IF NOT EXISTS "result_actions" jsonb;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertising_spend_observation_results_valid'
  ) THEN
    ALTER TABLE "advertising_spend_observation"
      ADD CONSTRAINT "advertising_spend_observation_results_valid"
      CHECK (
        ("reach" IS NULL OR "reach" >= 0)
        AND ("results" IS NULL OR "results" >= 0)
      );
  END IF;
END $$;
