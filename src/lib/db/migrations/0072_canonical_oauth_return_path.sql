-- Migration 0072 — canonical OAuth return paths
--
-- The Meta and TikTok connect routes stored `/app/w/<slug>/channels` as the
-- OAuth `return_path`, and a CHECK constraint pinned that shape. A workspace
-- slug is unique per AGENCY, not globally, so that value could not be
-- interpreted without knowing which agency it belonged to. The writers now
-- emit `/app/a/<agencySlug>/w/<slug>/channels`.
--
-- Swap the constraint rather than dropping it: the return path is echoed
-- back to the browser after the provider callback, so it stays a
-- redirect-shaped string and must not become an open redirect. The new
-- pattern is strictly more specific than the old one.
--
-- Existing rows: `social_oauth_state` holds one-time CSRF bags with a
-- ~10 minute TTL (`STATE_TTL_MS`), so in-flight rows are either expired or
-- will simply be rejected by the new CHECK on their next write. Nothing
-- needs rewriting — but the constraint is validated BEFORE narrowing so a
-- long-dead row cannot fail the migration.

ALTER TABLE "social_oauth_state"
  DROP CONSTRAINT IF EXISTS "social_oauth_state_return_path_safe";

ALTER TABLE "social_oauth_state"
  ADD CONSTRAINT "social_oauth_state_return_path_safe"
  CHECK ("return_path" ~ '^/app/a/[a-z0-9-]+/w/[a-z0-9-]+/channels$') NOT VALID;

ALTER TABLE "social_oauth_state"
  VALIDATE CONSTRAINT "social_oauth_state_return_path_safe";