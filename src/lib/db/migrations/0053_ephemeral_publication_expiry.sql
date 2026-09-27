-- 0053_ephemeral_publication_expiry
--
-- Instagram Stories live for 24 hours and have no permanent public link, so
-- they could never satisfy the old invariant that a `published` row must
-- carry a `published_url`. That made Stories *unlinkable*, not merely
-- linkless: `persistLinkedCandidate` wrote `status = 'published'` together
-- with `published_url = <permalink>`, and when the permalink was null the
-- whole `db.transaction` rolled back against
-- `publication_published_needs_url_time_publisher`. `recordPublication`
-- independently threw `published requires a publishedUrl`. There was no
-- way in the product to mark a Story as published.
--
-- This migration adds `expires_at` and relaxes the invariant from
-- "published implies a URL" to "published implies a URL *or* a known
-- expiry":
--
--   status <> 'published' OR (
--     actual_published_at IS NOT NULL
--     AND publisher_id        IS NOT NULL
--     AND (published_url IS NOT NULL OR expires_at IS NOT NULL)
--   )
--
-- Design notes
-- ------------
-- The invariant is *widened*, never removed. A published row still needs a
-- time and a publisher; only the URL requirement is now conditional, and it
-- is conditional on an explicit, self-describing field rather than on
-- guessing why a link is missing. `expires_at` null keeps the old
-- all-or-nothing behaviour, so every permanent publication is unchanged.
--
-- `publication_pending_clears_published_fields` is deliberately NOT
-- tightened to cover `expires_at`. A scheduled Story is legitimately
-- `pending` in Planner while carrying a notional window, so the service
-- only ever writes `expires_at` on the transition into `published`. No
-- backfill is required or performed: the column is new, and every existing
-- `published` row already has a `published_url` (guaranteed by the old
-- constraint), so all of them satisfy the new predicate.
--
-- Concurrency: the DROP and the ADD live inside one DO block, which is a
-- single statement. `scripts/migrate-concurrent.ts` runs statements outside
-- a transaction (Postgres forbids `CREATE INDEX CONCURRENTLY` inside one),
-- so a bare DROP / ADD pair would leave a window with no constraint at all
-- if the runner died between them. `DROP CONSTRAINT IF EXISTS` also makes the
-- block safe to re-apply.
--
-- Rollback: additive column plus a constraint swap. Reverting the
-- application image leaves the column unused (nullable) and the relaxed
-- constraint a superset of the old one, so the previous code continues to
-- validate. Restoring the strict constraint is only safe once no
-- `expires_at` row is `published` without a URL:
--
--   ALTER TABLE "publication_record"
--     DROP CONSTRAINT "publication_published_needs_url_time_publisher";
--   ALTER TABLE "publication_record"
--     ADD CONSTRAINT "publication_published_needs_url_time_publisher"
--     CHECK (status <> 'published' OR (
--       actual_published_at IS NOT NULL
--       AND publisher_id IS NOT NULL
--       AND published_url IS NOT NULL
--     ));

--> statement-breakpoint

ALTER TABLE "publication_record"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "publication_record"
    DROP CONSTRAINT IF EXISTS "publication_published_needs_url_time_publisher";
  ALTER TABLE "publication_record"
    ADD CONSTRAINT "publication_published_needs_url_time_publisher"
    CHECK (
      "status" <> 'published' OR (
        "actual_published_at" IS NOT NULL
        AND "publisher_id" IS NOT NULL
        AND ("published_url" IS NOT NULL OR "expires_at" IS NOT NULL)
      )
    );
END $$;
