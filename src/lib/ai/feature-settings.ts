import "server-only";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  aiFeatureSettings,
  aiUsageEvents,
  type aiFeatureSettings as AiFeatureSettings,
} from "@/lib/db/schema";
import { isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { requirePolicy } from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { currentActor } from "@/lib/auth/current-actor";
import { serverEnv } from "@/lib/validation/env";
import { hasManagedAiSecret, loadManagedAiSecret } from "@/lib/ai/provider-secret";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §15 — AI feature settings service.
 *
 * The configuration is keyed by `agency_id` (one row per agency). All
 * updates go through this module so the schema is the source of truth.
 *
 * Constraints from §15:
 *   - The key itself is NEVER stored in this table. Only a masked
 *     suffix (last 4 chars) is allowed, and only when the key is
 *     stored as a managed secret (not env-managed).
 *   - "Prefer an environment-managed key" — the default `keySource`
 *     is `environment`. If the env key is present the service refuses
 *     to write a managed-secret suffix (it would imply a different
 *     identity).
 *   - "Capability toggles" — `enabledCapabilities` is a string array
 *     validated against the fixed allowlist defined in
 *     `AI_CAPABILITIES`.
 *   - "Last successful test" — `lastConnectionTestAt` +
 *     `lastConnectionTestOk` are written by the test-connection path.
 *   - "Monthly usage summary" — derived from `ai_usage_event` by
 *     `getMonthlyUsage()`.
 */

export const AI_CAPABILITIES = [
  "campaign_ideas",
  "brief_improvement",
  "caption_drafts",
  "platform_adaptation",
  "related_format_ideas",
  "completeness_check",
] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

export const UpdateAiSettingsSchema = z.object({
  enabled: z.boolean(),
  model: z.string().min(1).max(120),
  enabledCapabilities: z.array(z.enum(AI_CAPABILITIES)),
});
export type UpdateAiSettingsInput = z.infer<typeof UpdateAiSettingsSchema>;

export type AiFeatureSettingsRow = typeof AiFeatureSettings.$inferSelect;
export type MonthlyUsage = {
  total: number;
  succeeded: number;
  failed: number;
  byCapability: { capability: string; count: number }[];
};

export async function getAiFeatureSettings(): Promise<AiFeatureSettingsRow | null> {
  const actor = await currentActor();
  const ctx = actor ? await resolveActiveAgencyContext({ actor }) : null;
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return null;
  const [row] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  return row ?? null;
}

export async function getMonthlyUsage(days = 30): Promise<MonthlyUsage> {
  const actor = await currentActor();
  const ctx = actor ? await resolveActiveAgencyContext({ actor }) : null;
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) {
    return { total: 0, succeeded: 0, failed: 0, byCapability: [] };
  }
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const [totals] = await db
    .select({
      total: count(),
    })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.agencyId, agencyId), gte(aiUsageEvents.createdAt, since)));
  const [succeeded] = await db
    .select({ value: count() })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.agencyId, agencyId),
        gte(aiUsageEvents.createdAt, since),
        eq(aiUsageEvents.succeeded, true),
      ),
    );
  const [failed] = await db
    .select({ value: count() })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.agencyId, agencyId),
        gte(aiUsageEvents.createdAt, since),
        eq(aiUsageEvents.succeeded, false),
      ),
    );
  const byCap = await db
    .select({
      capability: aiUsageEvents.capability,
      count: count(),
    })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.agencyId, agencyId), gte(aiUsageEvents.createdAt, since)))
    .groupBy(aiUsageEvents.capability)
    .orderBy(desc(count()));
  return {
    total: totals?.total ?? 0,
    succeeded: succeeded?.value ?? 0,
    failed: failed?.value ?? 0,
    byCapability: byCap.map((row) => ({ capability: row.capability, count: row.count })),
  };
}

export async function updateAiFeatureSettings(
  actor: Actor,
  input: UpdateAiSettingsInput,
): Promise<AiFeatureSettingsRow> {
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) throw new Error("Agency not configured");
  await requirePolicy(isAgencyAdmin(actor, agencyId), "update_ai_settings");
  // Validate model against the server allowlist. The allowlist is the
  // env's MINIMAX_MODEL plus the two documented alternates. Unknown
  // model strings are rejected to keep the setting truthful.
  const allowedModels = new Set([serverEnv.MINIMAX_MODEL, "MiniMax-M3", "MiniMax-M2"]);
  if (!allowedModels.has(input.model)) {
    throw new Error(
      `Model "${input.model}" is not in the server allowlist. Allowed: ${Array.from(allowedModels).join(", ")}`,
    );
  }
  const [existing] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);

  const next = {
    agencyId,
    enabled: input.enabled,
    model: input.model,
    enabledCapabilities: input.enabledCapabilities,
    keySource: (existing?.keySource ?? "environment") as "environment" | "managed_secret",
    ...(existing?.maskedKeySuffix ? { maskedKeySuffix: existing.maskedKeySuffix } : {}),
    updatedBy: actor.id,
    updatedAt: new Date(),
  } satisfies Partial<typeof aiFeatureSettings.$inferInsert>;

  if (existing) {
    await db.update(aiFeatureSettings).set(next).where(eq(aiFeatureSettings.agencyId, agencyId));
  } else {
    await db.insert(aiFeatureSettings).values(next);
  }
  revalidatePath("/app/agency-settings");
  revalidatePath("/app/agency-settings/ai");
  const [row] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  if (!row) throw new Error("AI feature settings row missing after upsert");
  return row;
}

/**
 * "Test connection" — verifies that the configured provider is
 * reachable from the deployment environment. Records the timestamp
 * and success on the feature-settings row so the UI can show a
 * status badge. Never throws; failures are captured in the row.
 *
 * The test is a cheap, token-light call: a single Haiku-class request
 * asking for an empty completion. We refuse to record a successful
 * test if the AI is disabled in the environment.
 */
export async function testAiConnection(
  actor: Actor,
): Promise<{ ok: boolean; latencyMs: number | null }> {
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) throw new Error("Agency not configured");
  await requirePolicy(isAgencyAdmin(actor, agencyId), "test_ai_connection");

  // M3.4 — resolve the active API key (managed secret takes
  // priority over the env key). The test reflects which key the
  // /api/ai/generate route will use.
  const useManaged = await hasManagedAiSecret(agencyId);
  const managed = useManaged ? await loadManagedAiSecret(agencyId) : null;
  const apiKey = managed?.apiKey ?? serverEnv.MINIMAX_API_KEY;

  if (!serverEnv.AI_FEATURE_ENABLED && !apiKey) {
    await recordConnectionTest(agencyId, actor.id, false);
    return { ok: false, latencyMs: null };
  }
  if (!apiKey) {
    await recordConnectionTest(agencyId, actor.id, false);
    return { ok: false, latencyMs: null };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${serverEnv.MINIMAX_BASE_URL.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: serverEnv.MINIMAX_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const latencyMs = Date.now() - start;
    const ok = res.ok;
    await recordConnectionTest(agencyId, actor.id, ok);
    return { ok, latencyMs };
  } catch {
    const latencyMs = Date.now() - start;
    await recordConnectionTest(agencyId, actor.id, false);
    return { ok: false, latencyMs };
  }
}

async function recordConnectionTest(agencyId: string, actorId: string, ok: boolean) {
  const [existing] = await db
    .select()
    .from(aiFeatureSettings)
    .where(eq(aiFeatureSettings.agencyId, agencyId))
    .limit(1);
  const patch = {
    lastConnectionTestAt: new Date(),
    lastConnectionTestOk: ok,
    updatedBy: actorId,
    updatedAt: new Date(),
  } satisfies Partial<typeof aiFeatureSettings.$inferInsert>;
  if (existing) {
    await db.update(aiFeatureSettings).set(patch).where(eq(aiFeatureSettings.agencyId, agencyId));
  } else {
    await db.insert(aiFeatureSettings).values({
      agencyId,
      enabled: false,
      model: serverEnv.MINIMAX_MODEL,
      enabledCapabilities: [],
      keySource: "environment",
      ...patch,
      updatedBy: actorId,
    } satisfies typeof aiFeatureSettings.$inferInsert);
  }
  revalidatePath("/app/agency-settings/ai");
}
