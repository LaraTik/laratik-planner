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

Engagement rate is `interactions / reach * 100`. When reach is unavailable,
the calculation falls back to `interactions / followers * 100` and the UI
identifies the denominator so the result is not misread.

## Consequences

- No destructive migration or historical backfill is required.
- Sync remains successful when a provider returns valid partial data; the row
  records the unavailable metric statuses for operators and the UI explains
  the count and missing metrics.
- New providers must declare their supported metrics and status mapping before
  their metrics are added to the universal UI.
- CSV and future exports must use the same capability registry as the table.
