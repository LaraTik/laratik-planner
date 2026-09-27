-- 0052_activity_event_jsonb_object_guard.sql
--
-- Incident 2026-09-27: 12 of 83 production content items could not be
-- opened — `/app/w/[slug]/planning/[id]` 500'd with
--
--   TypeError: Cannot use 'in' operator to search for 'status'
--   in 2026-09-26T21:00:00.000Z
--
-- Root cause: `recordMaterialityEvent` (src/lib/publishing/materiality.ts)
-- wrote bare SCALARS into `activity_event.before_data` / `after_data`
-- behind an `as never` cast, coercing only `null`. Callers legitimately
-- pass scalars (an ISO date for `schedule`, the caption for `caption`,
-- the literal "(payload)" for `platform_payload`). `jsonb` accepted them.
-- The activity formatter then ran `"status" in <string>`, which throws.
-- Because `buildVerb` computes before/after labels for EVERY event, one
-- bad historical row took down the whole route.
--
-- This migration does two things:
--
--   1. BACKFILL — repair the 18 historical rows so the audit data is
--      actually readable again (not just non-crashing). The untouched
--      scalar is recoverable from `metadata.before` / `metadata.after`
--      plus `metadata.resource`, so nothing is invented.
--   2. TRIGGER — make recurrence impossible at the storage layer by
--      coercing any non-object on write, rather than rejecting it.
--
-- Why a coercing TRIGGER and not a CHECK constraint
-- --------------------------------------------------
-- `scripts/deploy.sh` runs migrations (line 70) BEFORE recreating the
-- app container (line 74), and its rollback path (line 83) restores the
-- previous *application image* without touching the schema. A validated
-- `CHECK (jsonb_typeof(before_data) = 'object')` would therefore be
-- enforced against code that still writes scalars: any date / brief /
-- title / payload edit during the migration window — or after a failed
-- deploy rolled the app back to the buggy image — would fail with a
-- constraint violation instead of a render bug. Trading a page-level
-- 500 for write-level 500s is not a fix.
--
-- A BEFORE INSERT OR UPDATE trigger that *coerces* gives the same
-- invariant (the columns only ever hold objects) with a graceful
-- degradation path: an older writer's scalar is normalised on the way
-- in, and the row is still saved. Schema and code version stay
-- independent, so rollback is safe in both directions.
--
-- Idempotent: the backfill only touches rows that are still
-- non-objects, and the trigger is replaced under a DROP/CREATE guard.

--> statement-breakpoint

-- 1a. Record what we are about to change, for the evidence bundle.
CREATE TABLE IF NOT EXISTS "migration_evidence_0052" (
  "id"          serial PRIMARY KEY,
  "noted_at"    timestamptz NOT NULL DEFAULT now(),
  "bad_rows"    integer NOT NULL,
  "bad_items"   integer NOT NULL
);

--> statement-breakpoint

INSERT INTO "migration_evidence_0052" ("bad_rows", "bad_items")
SELECT
  count(*)::int,
  count(DISTINCT "content_item_id")::int
FROM "activity_event"
WHERE ("before_data" IS NOT NULL AND jsonb_typeof("before_data") <> 'object')
   OR ("after_data"  IS NOT NULL AND jsonb_typeof("after_data")  <> 'object');

--> statement-breakpoint

-- 1b. Backfill. Prefer metadata.before / metadata.after (the exact scalar
-- the writer recorded); fall back to the column itself, then to a
-- neutral marker so nothing is silently dropped.
UPDATE "activity_event" ae
SET
  "before_data" = CASE
    WHEN jsonb_typeof(ae."before_data") = 'object' THEN ae."before_data"
    WHEN ae."before_data" IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(
      CASE
        WHEN ae."metadata" ->> 'resource' = 'schedule' THEN 'plannedPublishAt'
        WHEN ae."metadata" ->> 'resource' IN
          ('caption','audience_copy','description','call_to_action','hashtags') THEN 'brief'
        ELSE 'value'
      END,
      CASE
        WHEN jsonb_typeof(ae."metadata" -> 'before') <> 'null'
          THEN ae."metadata" -> 'before'
        ELSE ae."before_data"
      END
    )
  END,
  "after_data" = CASE
    WHEN jsonb_typeof(ae."after_data") = 'object' THEN ae."after_data"
    WHEN ae."after_data" IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object(
      CASE
        WHEN ae."metadata" ->> 'resource' = 'schedule' THEN 'plannedPublishAt'
        WHEN ae."metadata" ->> 'resource' IN
          ('caption','audience_copy','description','call_to_action','hashtags') THEN 'brief'
        ELSE 'value'
      END,
      CASE
        WHEN jsonb_typeof(ae."metadata" -> 'after') <> 'null'
          THEN ae."metadata" -> 'after'
        ELSE ae."after_data"
      END
    )
  END
WHERE ("before_data" IS NOT NULL AND jsonb_typeof("before_data") <> 'object')
   OR ("after_data"  IS NOT NULL AND jsonb_typeof("after_data")  <> 'object');

--> statement-breakpoint

-- 1c. Collapse any remaining non-object leftovers (should be none after
-- 1b) so the constraint below can be added without failing.
UPDATE "activity_event"
SET "before_data" = '{}'::jsonb
WHERE "before_data" IS NOT NULL AND jsonb_typeof("before_data") <> 'object';

UPDATE "activity_event"
SET "after_data" = '{}'::jsonb
WHERE "after_data" IS NOT NULL AND jsonb_typeof("after_data") <> 'object';

--> statement-breakpoint

-- 2. Storage-layer guard. Coerce, do not reject: see the header note
-- on why a CHECK constraint would couple the schema to the code
-- version and break `scripts/deploy.sh`'s image-only rollback.
CREATE OR REPLACE FUNCTION public.activity_event_coerce_jsonb_object()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  key_name text;
BEGIN
  IF NEW.metadata IS NULL THEN
    NEW.metadata := '{}'::jsonb;
  END IF;

  -- Mirrors toAuditData() in src/lib/publishing/materiality.ts: keep
  -- the two in step so a value coerced here is renderable by the
  -- activity formatter's field readers.
  key_name := CASE
    WHEN NEW.metadata ->> 'resource' = 'schedule' THEN 'plannedPublishAt'
    WHEN NEW.metadata ->> 'resource' IN
      ('caption','audience_copy','description','call_to_action','hashtags') THEN 'brief'
    ELSE 'value'
  END;

  IF NEW.before_data IS NOT NULL AND jsonb_typeof(NEW.before_data) <> 'object' THEN
    NEW.before_data := jsonb_build_object(key_name, NEW.before_data);
  END IF;

  IF NEW.after_data IS NOT NULL AND jsonb_typeof(NEW.after_data) <> 'object' THEN
    NEW.after_data := jsonb_build_object(key_name, NEW.after_data);
  END IF;

  RETURN NEW;
END $$;

--> statement-breakpoint

DROP TRIGGER IF EXISTS "activity_event_coerce_jsonb_object" ON "activity_event";

--> statement-breakpoint

CREATE TRIGGER "activity_event_coerce_jsonb_object"
  BEFORE INSERT OR UPDATE ON "activity_event"
  FOR EACH ROW
  EXECUTE FUNCTION public.activity_event_coerce_jsonb_object();

