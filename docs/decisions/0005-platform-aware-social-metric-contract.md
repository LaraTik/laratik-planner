# ADR 0005: Platform-aware social metric capabilities

- Status: Accepted
- Date: 2026-09-02
- Scope: M4 social analytics extension

## Context

The normalized daily snapshot stores several nullable metrics because provider
APIs expose different capabilities. Treating every `null` as the same value
made the analytics table imply that Facebook and TikTok supported Instagram's
`engagedAccounts` metric, and made provider permission failures look like
ordinary days with no activity.

## Decision

The application keeps the normalized `engagedAccounts` column for backwards
compatibility and historical rows, but capability metadata is platform-aware:

- Facebook: followers, reach, views, interactions
- Instagram: followers, reach, views, engaged accounts, interactions
- TikTok: followers

The universal analytics selector and universal table use only followers, reach,
views, and interactions. `engagedAccounts` is rendered only in an Instagram
metrics table.

Each snapshot may include `sourceMetadata.metricStatuses`, where a supported
metric is `available`, `error`, or `no_data`; a metric that the platform does
not expose is `unsupported`. Existing rows without status metadata are safely
inferred from the platform and nullable value.

Meta Insights requests isolate each metric. If one metric is unsupported or
permission-denied, valid sibling metrics are still persisted and only the
affected metric is marked `error`.

Engagement rate is `interactions / reach * 100`. When reach is unavailable,
the calculation falls back to `interactions / followers * 100` and the UI
identifies the denominator so the result is not misread.

## Consequences

- Migration `0031_social_metric_workspace_dates` backfills existing rows from
  `observed_at` into each workspace's local calendar date. If two rows collide
  after conversion, the row with the latest `observed_at` is retained. This is
  an approved supersession of the original no-backfill consequence because
  UTC-derived dates were materially misrepresenting daily analytics.
- Sync remains successful when a provider returns valid partial data; the row
  records the unavailable metric statuses for operators and the UI explains
  the count and missing metrics.
- New providers must declare their supported metrics and status mapping before
  their metrics are added to the universal UI.
- CSV and future exports must use the same capability registry as the table.

## 2026-09-04 reliability amendment

The original `not_configured` metric error was ambiguous. New provider writes
use `provider_not_configured` for missing agency configuration and
`metric_unavailable` when Meta rejects an individual metric. Existing
`not_configured` metadata remains readable as a legacy value. Metric requests
are settled independently, so retryable provider failures preserve successful
sibling metrics and are retried on the next sync tick. All daily dates are
derived in the workspace timezone.

Approval: product owner authorized the date backfill and latest-observation
collision rule during the analytics reliability implementation on 2026-09-04.
