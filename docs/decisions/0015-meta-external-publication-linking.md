# ADR 0015 — Semi-automated Meta publication linking

Date: 2026-09-22  
Status: accepted for implementation

## Context

Planner publication is intentionally manual. Users publish through Meta, then
need a reliable way to connect the live or scheduled Meta object to the
existing Planner channel record without copying URLs or risking a duplicate
link. Direct Meta publishing remains outside the product scope.

## Decision

- Add nullable external publication metadata to `publication_record`.
- Identify a link by the unique `(external_provider, external_post_id)` pair.
- Fetch Facebook Page feed/scheduled posts and Instagram published media using
  read-only Meta permissions, limited to published history from 90 days. The
  current read-only Instagram media endpoint does not provide scheduled media;
  that limitation is surfaced in the UI rather than worked around with a write
  permission.
- Require explicit user confirmation before linking; link Facebook and
  Instagram independently.
- Keep Meta's external state (`scheduled`, `published`, `unavailable`, `error`)
  separate from Planner's `publication_status`.
- A scheduled Meta object never marks Planner published. Reconciliation marks
  Planner published only after Meta returns the object as live.
- Preserve the provider ID, URL, timestamps, sanitized snapshot, and activity
  history when a previously linked object becomes unavailable.
- Reuse the existing encrypted social connection and channel external IDs; do
  not expose credentials or raw provider responses to the browser.

## Consequences

The common workflow is reduced to fetch → select → confirm, while the existing
manual outcome form remains available. A new read permission may require
reauthorization for existing connections. Provider endpoint behavior,
Instagram scheduled-post visibility, and App Review remain external UAT gates.

The sync worker performs bounded reconciliation only for linked scheduled
objects. A manual refresh is available for any linked object. Unlinking clears
the active association without changing an already confirmed Planner outcome.

## Rollback and compatibility

Migration `0049_meta_external_publication_links` is additive. Older images
ignore the new nullable metadata and continue to use manual publication. A
normal application rollback keeps the columns and index; destructive removal
requires a verified backup or a reviewed forward migration.
