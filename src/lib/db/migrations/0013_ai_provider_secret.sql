-- Migration 0013 — ai_provider_secret (M3.4 — AI in-DB secret)
--
-- Adds the per-agency encrypted provider-secret table that backs
-- the "managed secret" mode for the AI configuration.
--
--   ai_provider_secret
--     (agency_id) PK → 1:1 with agency
--     ciphertext bytea   — AES-256-GCM: iv(12) || authTag(16) || encrypted
--     key_version smallint — which ENCRYPTION_KEY slot encrypted it (1 today)
--     last_four char(4)   — mirrored to ai_feature_setting.masked_key_suffix
--                           for fast UI read (the "ends in …abcd" badge)
--     rotated_by_user_id  — who last wrote the row (audit context)
--     created_at, updated_at
--
-- Why a separate table (and not columns on ai_feature_setting):
--
--   - ai_feature_setting is the per-agency config surface
--     (enabled, model, capabilities). Adding the encrypted
--     ciphertext there would mix the "always small" config row
--     with a "potentially large" secret. The encryption helper
--     also benefits from a focused read path (single row,
--     no joins).
--   - The `ciphertext` column is `bytea` (not `text`) so an
--     accidental `console.log(row)` will not produce readable
--     output and a query builder that defaults to casting
--     bytea to text will surface a build hazard.
--   - The `key_version` column is the seam for future rotation:
--     the encryption helper can read v1 ciphertexts while
--     writing v2 rows.
--
-- Compatibility:
--
--   - Additive. No existing row is modified.
--   - The AI client (src/lib/ai/index.ts) is unchanged by this
--     migration. A subsequent commit (0013.4) introduces the
--     encryption helper + service that write / read this table.
--     Until that lands, every existing read path is unaffected.
--   - `bytea` requires no extension on Postgres 16.
--
-- Rollback:
--
--   Drop the table. A destructive rollback must be paired with a
--   verified backup because the ciphertext is the only
--   recoverable copy of the API key (rotation is not in scope
--   for this milestone).

CREATE TABLE "ai_provider_secret" (
  "agency_id" uuid PRIMARY KEY REFERENCES "agency"("id") ON DELETE CASCADE,
  "ciphertext" bytea NOT NULL,
  "key_version" smallint NOT NULL DEFAULT 1,
  "last_four" char(4) NOT NULL,
  "rotated_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- The CHECK constraint enforces the documented "never more than 4 chars
-- in masked_key_suffix" contract. The application layer mirrors
-- `last_four` into `ai_feature_setting.masked_key_suffix` and would be
-- the place to fix a misbehaving future writer; this check is the
-- last line of defence.
ALTER TABLE "ai_provider_secret"
  ADD CONSTRAINT "ai_provider_secret_last_four_len"
  CHECK (char_length("last_four") = 4);

-- The key_version is bounded to a small positive integer (16 bits is
-- plenty for the foreseeable rotation cadence). A future migration can
-- widen the type if the column overflows.
ALTER TABLE "ai_provider_secret"
  ADD CONSTRAINT "ai_provider_secret_key_version_range"
  CHECK ("key_version" BETWEEN 1 AND 32767);
