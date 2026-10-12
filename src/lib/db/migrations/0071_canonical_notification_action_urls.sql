-- Migration 0071 — canonical workspace URLs on notification action_url
--
-- `buildActionUrlForContentItem` used to emit `/app/w/<slug>/planning/<id>`.
-- A workspace slug is unique per AGENCY, not globally, so that shape meant
-- "the workspace with this slug in whichever agency the reader currently has
-- active" — the cross-tenant ambiguity that canonical URLs fixed (see
-- `src/lib/urls.ts` and `src/app/(app)/app/w/[...legacy]/page.tsx`).
--
-- Every notification row written before this migration therefore carries a
-- link whose target depends on who clicks it. Rewrite the stored rows to the
-- canonical `/app/a/<agencySlug>/w/<slug>/…` form.
--
-- WHY THIS IS EXACT
--
-- The rewrite joins on `notification.workspace_id`, which is stored. It does
-- NOT re-parse the slug and look it up: a slug alone is ambiguous across
-- agencies, so parsing would guess. Keying on the FK resolves the agency
-- unambiguously even when two agencies own a workspace with the same slug.
--
-- IDEMPOTENT
--
-- The predicate only matches rows still beginning `/app/w/`, so re-running is
-- a no-op. Rows already canonical, and rows with no `workspace_id` (which
-- keep resolving through the legacy route), are left untouched.
--
-- The `substring` capture preserves the path tail AND any `#fragment`; the
-- `COALESCE` handles a bare workspace root with no trailing path.

UPDATE notification n
SET action_url = '/app/a/' || a.slug || '/w/' || w.slug
       || COALESCE('/' || substring(n.action_url FROM '^/app/w/[^/]+/(.*)$'), '')
FROM workspace w
JOIN agency a ON a.id = w.agency_id
WHERE n.workspace_id = w.id
  AND n.action_url ~ '^/app/w/[^/]+'
  AND a.slug IS NOT NULL;