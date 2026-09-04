-- Migration 0031 — normalize social metric dates to the workspace timezone.
--
-- The original sync path used UTC midnight, although the data contract has
-- always defined metric_date as a workspace-local calendar day. Recompute
-- every existing row from observed_at and retain the latest observation when
-- two UTC rows collapse onto the same local day. The unique index is removed
-- for the rewrite so date permutations and collision cleanup are atomic.

DROP INDEX IF EXISTS "social_profile_metric_channel_date_unique";
--> statement-breakpoint
CREATE TEMP TABLE "_social_metric_date_backfill" ON COMMIT DROP AS
SELECT
  metric.id,
  ((metric.observed_at AT TIME ZONE workspace.timezone)::date) AS metric_date,
  row_number() OVER (
    PARTITION BY metric.social_channel_id,
      ((metric.observed_at AT TIME ZONE workspace.timezone)::date)
    ORDER BY metric.observed_at DESC, metric.id DESC
  ) AS duplicate_rank
FROM "social_profile_daily_metric" AS metric
INNER JOIN "social_channel" AS channel
  ON channel.id = metric.social_channel_id
INNER JOIN "workspace" AS workspace
  ON workspace.id = channel.workspace_id;
--> statement-breakpoint
DELETE FROM "social_profile_daily_metric" AS metric
USING "_social_metric_date_backfill" AS backfill
WHERE metric.id = backfill.id
  AND backfill.duplicate_rank > 1;
--> statement-breakpoint
UPDATE "social_profile_daily_metric" AS metric
SET metric_date = backfill.metric_date,
    updated_at = now()
FROM "_social_metric_date_backfill" AS backfill
WHERE metric.id = backfill.id
  AND backfill.duplicate_rank = 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "social_profile_metric_channel_date_unique"
  ON "social_profile_daily_metric" USING btree ("social_channel_id", "metric_date");
