-- Migration 0028 — preserve the shared-copy revision used by channel payloads.
-- Existing rows remain NULL until their publishing package is saved; this is
-- intentionally conservative and avoids relabelling historical payloads.
ALTER TABLE "content_item_channel"
  ADD COLUMN IF NOT EXISTS "copy_source_revision" integer;
