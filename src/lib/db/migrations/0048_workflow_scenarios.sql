-- 0048_workflow_scenarios.sql
-- Adds per-workspace workflow-scenario column + read-only scenario catalog.
--
-- Every existing workspace gets 'standard' (the previous full editorial
-- spine) by default, so this migration is behaviour-preserving.
--
-- Idempotent guards live on the ALTER and the seed inserts so a partially-
-- applied run can be retried without manual cleanup.

--> statement-breakpoint

-- 1a. Add the per-workspace scenario column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspace_settings'
      AND column_name = 'workflow_scenario'
  ) THEN
    ALTER TABLE "workspace_settings"
      ADD COLUMN "workflow_scenario" text NOT NULL DEFAULT 'standard'
        CHECK ("workflow_scenario" IN ('standard','lightweight','two_gate_client','self_publish'));
  END IF;
END $$;

--> statement-breakpoint

-- 1b. Scenario catalog. Read-only seed data shipped in this migration.
CREATE TABLE IF NOT EXISTS "workflow_scenario" (
  "id" text PRIMARY KEY,
  "name_key" text NOT NULL,
  "blurb_key" text NOT NULL,
  -- Ordered rail stages this scenario includes. The engine filters the
  -- legal transitions at this boundary so an excluded stage cannot be
  -- targeted by any transition (e.g. 'lightweight' omits content_review).
  "stages" text[] NOT NULL,
  -- 'single' = one creative-approval gate;
  -- 'two_gate' = forced internal-then-client;
  -- NULL = defer to workspace_settings.approvalMode (used by 'standard').
  "approval_mode" text CHECK ("approval_mode" IN ('single','two_gate')),
  "publishing_setup_required" boolean NOT NULL,
  "display_order" smallint NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workflow_scenario_stages_nonempty" CHECK (cardinality("stages") >= 2)
);

--> statement-breakpoint

INSERT INTO "workflow_scenario"
  ("id","name_key","blurb_key","stages","approval_mode","publishing_setup_required","display_order","is_default")
VALUES
  ('standard',
   'workflow.scenario.standard.name','workflow.scenario.standard.blurb',
   ARRAY['planning','content_review','creative_production','creative_approval','publishing_setup','published'],
   NULL, true, 10, true),
  ('lightweight',
   'workflow.scenario.lightweight.name','workflow.scenario.lightweight.blurb',
   ARRAY['planning','creative_production','creative_approval','publishing_setup','published'],
   'single', true, 20, false),
  ('two_gate_client',
   'workflow.scenario.two_gate_client.name','workflow.scenario.two_gate_client.blurb',
   ARRAY['planning','content_review','creative_production','creative_approval','publishing_setup','published'],
   'two_gate', true, 30, false),
  ('self_publish',
   'workflow.scenario.self_publish.name','workflow.scenario.self_publish.blurb',
   ARRAY['planning','content_review','creative_production','creative_approval','published'],
   'single', false, 40, false)
ON CONFLICT ("id") DO UPDATE SET
  "name_key" = EXCLUDED."name_key",
  "blurb_key" = EXCLUDED."blurb_key",
  "stages" = EXCLUDED."stages",
  "approval_mode" = EXCLUDED."approval_mode",
  "publishing_setup_required" = EXCLUDED."publishing_setup_required",
  "display_order" = EXCLUDED."display_order",
  "is_default" = EXCLUDED."is_default";

--> statement-breakpoint

-- 1c. Enforce single-default invariant.
DO $$
BEGIN
  IF (
    SELECT count(*) FROM "workflow_scenario" WHERE "is_default" = true
  ) <> 1 THEN
    RAISE EXCEPTION 'workflow_scenario must have exactly one is_default=true row';
  END IF;
END $$;