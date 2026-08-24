import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { agencies, securityAuditEvents } from "@/lib/db/schema";
import { isAgencyAdmin, requirePolicy, type Actor } from "@/lib/auth/policy";

/**
 * Agency update service (M3.4 — agency CRUD).
 *
 * The M3.4 milestone closes the gap the user identified: the
 * agency's own `name / slug / locale / timezone` are now
 * editable from the UI. The agency admin uses
 * `/app/agency-settings`; the platform admin uses
 * `/app/platform/agencies/[id]`. Both surfaces call the same
 * `updateAgency(actor, agencyId, input)` service.
 *
 * The contract is:
 *   - `name`  — 2..120 chars
 *   - `slug`  — 2..60 chars, lowercase letters / digits / hyphens,
 *     cannot start or end with a hyphen (matches the create-time
 *     regex)
 *   - `locale`  — 2..20 chars (validated against
 *     `Intl.supportedValuesOf('timeZone')` would be wrong; this
 *     is a *language tag*, not a timezone. We use a 2..20 char
 *     shape with a permissive alphabet — see the schema)
 *   - `timezone` — 2..80 chars, must be a valid IANA timezone
 *     (validated against `Intl.supportedValuesOf('timeZone')`)
 *
 * Slug uniqueness is re-checked inside the transaction with
 * `SELECT … FOR UPDATE` on the agency row + a uniqueness
 * query. A slug conflict throws `SlugConflictError`, which the
 * form renders inline.
 *
 * Authorization: `requirePolicy(isAgencyAdmin(actor, agencyId), "update_agency")`.
 * The platform admin is also an agency admin of every agency
 * they belong to; the platform-only "edit any agency" path goes
 * through the same gate (the platform admin must be a member
 * of the agency OR have an active `support_access_grant`).
 * Platform mutation routes that bypass the membership check
 * use the platform's own `requirePlatformAdmin` gate.
 *
 * Audit: every successful update appends a row to
 * `security_audit_events` with `action = "agency.update"` and
 * a `metadata` jsonb that carries `before` and `after`
 * (only the changed fields). The audit row's `targetType` is
 * `"agency"`, `targetId` is the agency id.
 *
 * What is **not** editable (per the plan):
 *   - `id`, `bootstrap_completed_at`, `created_at`, `updated_at`
 *   - `singleton_key` (dropped in M1.7)
 *   - `suspendedAt` / `archivedAt` — the platform's lifecycle
 *     forms own these.
 *   - `settings` jsonb — server-managed, free-form.
 */

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export const UpdateAgencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(60)
    .regex(
      SLUG_RE,
      "Slug must be lowercase letters, digits, or hyphens; cannot start or end with a hyphen",
    ),
  locale: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .regex(
      /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)?$/,
      "Locale must be a BCP 47 language tag (e.g. 'en', 'en-US', 'pt-BR')",
    ),
  timezone: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine(
      (tz) => {
        try {
          // The Intl API throws on invalid timezone strings.
          new Intl.DateTimeFormat("en-US", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Timezone must be a valid IANA timezone (e.g. 'UTC', 'Europe/Berlin')" },
    ),
});
export type UpdateAgencyInput = z.infer<typeof UpdateAgencySchema>;

export const AGENCY_UPDATE_ERROR_CODES = {
  NotFound: "agency.update.not-found",
  SlugConflict: "agency.update.slug-conflict",
  NotAgencyAdmin: "agency.update.not-agency-admin",
} as const;
export type AgencyUpdateErrorCode =
  (typeof AGENCY_UPDATE_ERROR_CODES)[keyof typeof AGENCY_UPDATE_ERROR_CODES];

export class AgencyUpdateError extends Error {
  public readonly code: AgencyUpdateErrorCode;
  constructor(
    code: AgencyUpdateErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AgencyUpdateError";
    this.code = code;
  }
}

export type UpdateAgencyResult = {
  agencyId: string;
  changedFields: string[];
};

/**
 * Update the agency's name / slug / locale / timezone. The
 * function is the only writer for these columns; the create
 * path (in `src/lib/platform/agencies.ts`) is the only other
 * writer for `slug` (and it sets the columns in the same
 * shape).
 */
export async function updateAgency(
  actor: Actor,
  agencyId: string,
  raw: UpdateAgencyInput,
): Promise<UpdateAgencyResult> {
  await requirePolicy(isAgencyAdmin(actor, agencyId), "update_agency");
  const input = UpdateAgencySchema.parse(raw);

  return db.transaction(async (tx) => {
    // Lock the row for the duration of the transaction so a
    // concurrent rename + slug change cannot interleave.
    const [before] = await tx
      .select({
        id: agencies.id,
        name: agencies.name,
        slug: agencies.slug,
        locale: agencies.locale,
        timezone: agencies.timezone,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .for("update")
      .limit(1);
    if (!before) {
      throw new AgencyUpdateError(AGENCY_UPDATE_ERROR_CODES.NotFound, "Agency not found.", {
        agencyId,
      });
    }

    // Slug uniqueness — case-insensitive match against the new
    // slug, excluding this row. The unique index on
    // `lower(slug)` (per the schema) is the source of truth;
    // this pre-check turns the violation into a clean error.
    if (input.slug !== before.slug) {
      const [collision] = await tx
        .select({ id: agencies.id })
        .from(agencies)
        .where(
          and(
            sql`lower(${agencies.slug}) = ${input.slug.toLowerCase()}`,
            sql`${agencies.id} <> ${agencyId}`,
          ),
        )
        .limit(1);
      if (collision) {
        throw new AgencyUpdateError(
          AGENCY_UPDATE_ERROR_CODES.SlugConflict,
          `Slug "${input.slug}" is already in use by another agency.`,
          { slug: input.slug, existingAgencyId: collision.id },
        );
      }
    }

    const patch = {
      name: input.name,
      slug: input.slug,
      locale: input.locale,
      timezone: input.timezone,
      updatedAt: new Date(),
    };
    await tx.update(agencies).set(patch).where(eq(agencies.id, agencyId));

    // Build the audit `before / after` carrying only the
    // changed fields — keeps the row small and the audit
    // log queryable.
    const changedFields: string[] = [];
    const beforeSubset: Record<string, unknown> = {};
    const afterSubset: Record<string, unknown> = {};
    for (const key of ["name", "slug", "locale", "timezone"] as const) {
      if (before[key] !== patch[key]) {
        changedFields.push(key);
        beforeSubset[key] = before[key];
        afterSubset[key] = patch[key];
      }
    }

    if (changedFields.length > 0) {
      await tx.insert(securityAuditEvents).values({
        actorId: actor.id,
        action: "agency.update",
        targetType: "agency",
        targetId: agencyId,
        outcome: "success",
        metadata: {
          changedFields,
          before: beforeSubset,
          after: afterSubset,
        },
      });
    }

    revalidatePath("/app/agency-settings");
    revalidatePath(`/app/platform/agencies/${agencyId}`);
    revalidatePath(`/app/w/[slug]/settings`, "page");
    return { agencyId, changedFields };
  });
}
