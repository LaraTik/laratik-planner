import {
  customType,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agencies, users } from "./identity";

/**
 * Custom `bytea` type — the column is treated as a Buffer on read
 * and a Buffer-or-acceptable-input on write. Mirrors the bytea
 * custom type used in `src/lib/db/schema/ai.ts` for ai_provider_secret.
 * Drizzle's built-in `customType` is the documented way to express
 * a Postgres-only type that has no first-class Drizzle binding.
 */
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * STUDIOFLOW_MASTER_PROMPT.md §15 (M4.5) — per-agency social DEK envelope.
 *
 * One row per agency that has enabled social analytics. The plaintext
 * DEK is never stored; the `dek_ciphertext` column is `bytea`
 * (AES-256-GCM with the platform KEK, fresh 12-byte IV per write,
 * 16-byte auth tag). The `dek_key_version` records which KEK slot
 * was used (today always 1; a future rotation bumps it).
 *
 * The AAD is `laratik-planner:social-dek:v1` (separate from the
 * per-connection social_credentials AAD `laratik-planner:social-credentials:v1`).
 * The two envelopes protect different objects and have independent
 * rotation cadences.
 *
 * FK cascade: deleting an agency removes its DEK row. There is no
 * soft-delete path here. When the DEK row is removed, every
 * `social_connection` row in the agency's workspaces becomes
 * undecryptable — the application surfaces this on first read and
 * requires a re-onboard.
 *
 * CHECK constraints at the DB level back the application-level
 * "key_version is small positive", "rotation_reason is one of the
 * known sentinels", and "iv / tag / ciphertext byte lengths match
 * AES-256-GCM framing" invariants. The application is the primary
 * enforcer; the CHECK is the last line of defence.
 */
export const agencySocialDek = pgTable(
  "agency_social_dek",
  {
    agencyId: uuid("agency_id")
      .primaryKey()
      .references(() => agencies.id, { onDelete: "cascade" }),
    dekCiphertext: bytea("dek_ciphertext").notNull(),
    dekIv: bytea("dek_iv").notNull(),
    dekTag: bytea("dek_tag").notNull(),
    dekKeyVersion: smallint("dek_key_version").notNull().default(1),
    enabledAt: timestamp("enabled_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    enabledBy: uuid("enabled_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true, mode: "date" }),
    lastRotatedBy: uuid("last_rotated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    rotationReason: text("rotation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("agency_social_dek_kv_idx").on(t.dekKeyVersion)],
);
