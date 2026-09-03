-- Migration 0027 — `activity_kind` enum gains `content_copy_patched`
-- (P1, /ui-ux-pro-max, 2026-09-03).
--
-- The new `patchAudienceCopy` service writes a `content_copy_patched`
-- activity row when a planner/manager/publisher fixes a typo in the
-- caption / hashtags / firstComment. This is a NON-material edit
-- (no revision bump, no approval invalidation) but it is still
-- audit-relevant — the activity log is the only place that records
-- the field-set change. Mirrors the pattern in migration 0026
-- (the `delete` + `bulk_delete` additions).
--
-- No data backfill: the ENUM is a type, not a row constraint.
-- Existing activity_event rows continue to be valid; new rows
-- from `patchAudienceCopyAction` use the new value.

ALTER TYPE "public"."activity_kind" ADD VALUE IF NOT EXISTS 'content_copy_patched';
