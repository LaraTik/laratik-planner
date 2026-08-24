-- Migration 0016 — per-agency social DEK (M4.5)
--
-- Replaces the single platform env-var SOCIAL_TOKEN_ENCRYPTION_KEY with
-- a per-agency Data Encryption Key (DEK), wrapped by a platform Key
-- Encryption Key (KEK). The KEK stays as one env var (optional at boot);
-- the DEK is generated on first enable, wrapped with the KEK, and stored
-- here. The plaintext DEK is shown to the agency admin exactly once at
-- enable / rotate / reset-recovery time and is NEVER persisted.
--
--   agency_social_dek
--     (agency_id) PK          — 1:1 with agency
--     dek_ciphertext bytea    — AES-256-GCM(KEK, DEK) using
--                               AAD 'laratik-planner:social-dek:v1'
--     dek_iv bytea            — 12 fresh random bytes per wrap
--     dek_tag bytea           — 16-byte GCM auth tag
--     dek_key_version smallint — which KEK slot wrapped this DEK (1 today)
--     enabled_at, enabled_by  — who/when first enabled social for the agency
--     last_rotated_at, last_rotated_by, rotation_reason
--                               — 'manual' (agency-initiated rotate),
--                                 'recovery_reset' (lost-recovery-key flow)
--     created_at, updated_at
--
-- Why a separate table (not columns on agency):
--
--   - Feature opt-in is explicit: row exists = enabled. Absence is a
--     clean 404 surface, not a silent no-op.
--   - Aligns with the existing pattern of feature tables
--     (workspace_settings, agency_membership, ai_provider_secret).
--   - The `agency` row is already 30+ columns; isolating the feature
--     keeps the core table small.
--   - The DEK columns are `bytea` so an accidental `console.log(row)`
--     will not produce readable output, and a query builder that
--     defaults to casting bytea to text will surface a build hazard.
--
-- Compatibility:
--
--   - Additive. No existing row is modified.
--   - The application-side env contract changes in the same milestone
--     (M4.5.4 — lazy KEK). Until that lands, the existing
--     `SOCIAL_TOKEN_ENCRYPTION_KEY` env var is still read by the
--     repository to seal/open existing social_connection rows.
--   - The new env var is not required at boot. The application refuses
--     to seal a new social_connection if the row is missing AND the
--     platform KEK is unset, with a clear 503 surface (no boot crash).
--
-- Rollback:
--
--   DROP TABLE agency_social_dek. A destructive rollback must be paired
--   with a verified backup of any wrapped DEKs (which is the only way to
--   re-derive the per-connection social tokens). In practice, rollback
--   is only safe before any agency has enabled social.

CREATE TABLE "agency_social_dek" (
  "agency_id" uuid PRIMARY KEY REFERENCES "agency"("id") ON DELETE CASCADE,
  "dek_ciphertext" bytea NOT NULL,
  "dek_iv" bytea NOT NULL,
  "dek_tag" bytea NOT NULL,
  "dek_key_version" smallint NOT NULL DEFAULT 1,
  "enabled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "enabled_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "last_rotated_at" timestamp with time zone,
  "last_rotated_by" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  "rotation_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- The dek_key_version is bounded to a small positive integer (16 bits is
-- plenty for the foreseeable rotation cadence). Mirrors the
-- ai_provider_secret key_version check.
ALTER TABLE "agency_social_dek"
  ADD CONSTRAINT "agency_social_dek_key_version_range"
  CHECK ("dek_key_version" BETWEEN 1 AND 32767);

-- The rotation_reason is either NULL (never rotated) or one of the
-- known sentinels. The application is the primary enforcer; the CHECK
-- is the last line of defence.
ALTER TABLE "agency_social_dek"
  ADD CONSTRAINT "agency_social_dek_rotation_reason_valid"
  CHECK ("rotation_reason" IS NULL OR "rotation_reason" IN ('manual', 'recovery_reset'));

-- The wrapped DEK envelope is 12 (iv) + 16 (tag) + 32 (DEK) = 60 bytes
-- minimum. Anything shorter is malformed. The application is the primary
-- enforcer; the CHECK is the last line of defence.
ALTER TABLE "agency_social_dek"
  ADD CONSTRAINT "agency_social_dek_ciphertext_min_length"
  CHECK (octet_length("dek_ciphertext") >= 32);

ALTER TABLE "agency_social_dek"
  ADD CONSTRAINT "agency_social_dek_iv_length"
  CHECK (octet_length("dek_iv") = 12);

ALTER TABLE "agency_social_dek"
  ADD CONSTRAINT "agency_social_dek_tag_length"
  CHECK (octet_length("dek_tag") = 16);

-- Index on key_version supports the KEK-rotation script: find every row
-- sealed with the old KEK in one scan.
CREATE INDEX "agency_social_dek_kv_idx" ON "agency_social_dek"("dek_key_version");
