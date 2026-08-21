import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { brandAssets, brandVoiceRules, contentPillars } from "@/lib/db/schema";
import { hasWorkspaceRole, PermissionDeniedError, type Actor } from "@/lib/auth/policy";
import type { BrandAssetCommand, BrandVoiceRuleCommand } from "@/lib/brand/command";

/**
 * Brand Kit service layer (STUDIOFLOW_MASTER_PROMPT.md §11.x).
 *
 * Every mutation goes through `hasWorkspaceRole(['workspace_manager'])`
 * before touching Postgres. Agency admins pass that check implicitly
 * via the policy helper's admin shortcut (`src/lib/auth/policy.ts:120`).
 *
 * The listers are read-only and used by
 * `app/(app)/app/w/[slug]/brand-kit/page.tsx` to render the section
 * grids. They filter out archived rows by default so the page can show
 * "no assets yet" empty states cleanly.
 */

export type BrandAssetRow = typeof brandAssets.$inferSelect;
export type BrandVoiceRuleRow = typeof brandVoiceRules.$inferSelect;

export type BrandAssetKind = BrandAssetRow["kind"];
export type BrandVoiceRuleType = BrandVoiceRuleRow["ruleType"];

export async function listBrandAssets(
  workspaceId: string,
  opts?: { kind?: BrandAssetKind },
): Promise<BrandAssetRow[]> {
  const where = opts?.kind
    ? and(
        eq(brandAssets.workspaceId, workspaceId),
        isNull(brandAssets.archivedAt),
        eq(brandAssets.kind, opts.kind),
      )
    : and(eq(brandAssets.workspaceId, workspaceId), isNull(brandAssets.archivedAt));
  return db.select().from(brandAssets).where(where).orderBy(desc(brandAssets.createdAt));
}

export async function listBrandVoiceRules(
  workspaceId: string,
  opts?: { ruleType?: BrandVoiceRuleType },
): Promise<BrandVoiceRuleRow[]> {
  const where = opts?.ruleType
    ? and(eq(brandVoiceRules.workspaceId, workspaceId), eq(brandVoiceRules.ruleType, opts.ruleType))
    : eq(brandVoiceRules.workspaceId, workspaceId);
  return db
    .select()
    .from(brandVoiceRules)
    .where(where)
    .orderBy(asc(brandVoiceRules.sortOrder), asc(brandVoiceRules.createdAt));
}

async function requireManager(actor: Actor, workspaceId: string, action: string): Promise<void> {
  const allowed = await hasWorkspaceRole(actor, workspaceId, ["workspace_manager"]);
  if (!allowed) throw new PermissionDeniedError(action);
}

export async function createBrandAsset(
  actor: Actor,
  workspaceId: string,
  input: BrandAssetCommand,
): Promise<void> {
  await requireManager(actor, workspaceId, "create brand asset");
  await db.insert(brandAssets).values({
    workspaceId,
    createdBy: actor.id,
    kind: input.kind,
    name: input.name,
    value: "value" in input ? input.value : {},
    externalUrl: "externalUrl" in input ? (input.externalUrl ?? null) : null,
    storagePath: "storagePath" in input ? (input.storagePath ?? null) : null,
  });
}

/**
 * Round 2 typed wrappers for the logo variant. These are the public
 * service entry points used by the brand-kit logo form action —
 * the generic `createBrandAsset` still works for any kind, but
 * the typed wrappers give the form layer a clean, kind-scoped
 * surface and make the authz pattern (requireManager) obvious to
 * future readers.
 */
export type LogoAssetInput = {
  name: string;
  externalUrl?: string | undefined;
  storagePath?: string | undefined;
};

export async function createLogoAsset(
  actor: Actor,
  workspaceId: string,
  input: LogoAssetInput,
): Promise<void> {
  await requireManager(actor, workspaceId, "create logo asset");
  await db.insert(brandAssets).values({
    workspaceId,
    createdBy: actor.id,
    kind: "logo",
    name: input.name,
    externalUrl: input.externalUrl ?? null,
    storagePath: input.storagePath ?? null,
    value: {},
  });
}

export async function archiveLogoAsset(
  actor: Actor,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "archive logo asset");
  await db
    .update(brandAssets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(brandAssets.id, assetId), eq(brandAssets.workspaceId, workspaceId)));
}

export async function archiveBrandAsset(
  actor: Actor,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "archive brand asset");
  await db
    .update(brandAssets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(brandAssets.id, assetId), eq(brandAssets.workspaceId, workspaceId)));
}

export async function createBrandVoiceRule(
  actor: Actor,
  workspaceId: string,
  input: BrandVoiceRuleCommand,
): Promise<void> {
  await requireManager(actor, workspaceId, "create brand voice rule");
  await db.insert(brandVoiceRules).values({
    workspaceId,
    createdBy: actor.id,
    ruleType: input.ruleType,
    content: input.content,
    sortOrder: "0",
  });
}

export async function archiveBrandVoiceRule(
  actor: Actor,
  workspaceId: string,
  ruleId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "archive brand voice rule");
  // `brand_voice_rules` has no `archivedAt` column (see channels.ts:73)
  // — we hard-delete and rely on FK cascade + audit log if needed in
  // a later round. For now, the only safe operation is remove.
  await db
    .delete(brandVoiceRules)
    .where(and(eq(brandVoiceRules.id, ruleId), eq(brandVoiceRules.workspaceId, workspaceId)));
}

export type ContentPillarSummary = {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
};

export async function listContentPillars(workspaceId: string): Promise<ContentPillarSummary[]> {
  const rows = await db
    .select({
      id: contentPillars.id,
      name: contentPillars.name,
      color: contentPillars.color,
      description: contentPillars.description,
    })
    .from(contentPillars)
    .where(and(eq(contentPillars.workspaceId, workspaceId), isNull(contentPillars.archivedAt)))
    .orderBy(asc(contentPillars.name));
  return rows;
}

export type BrandRecentUpdate = {
  updatedAt: Date;
  kind: "asset" | "rule";
  description: string;
};

/**
 * Recent brand-kit updates — a union of the most recent `brand_assets`
 * and `brand_voice_rules` rows by `updated_at`, sorted desc, sliced to
 * `limit`. The merge is done in JS (two cheap queries) to keep the SQL
 * portable and the test surface small.
 */
export async function listRecentBrandUpdates(
  workspaceId: string,
  limit = 10,
): Promise<BrandRecentUpdate[]> {
  const [assetRows, ruleRows] = await Promise.all([
    db
      .select({
        updatedAt: brandAssets.updatedAt,
        kind: brandAssets.kind,
        name: brandAssets.name,
      })
      .from(brandAssets)
      .where(and(eq(brandAssets.workspaceId, workspaceId), isNull(brandAssets.archivedAt)))
      .orderBy(desc(brandAssets.updatedAt))
      .limit(limit),
    db
      .select({
        updatedAt: brandVoiceRules.updatedAt,
        ruleType: brandVoiceRules.ruleType,
        content: brandVoiceRules.content,
      })
      .from(brandVoiceRules)
      .where(eq(brandVoiceRules.workspaceId, workspaceId))
      .orderBy(desc(brandVoiceRules.updatedAt))
      .limit(limit),
  ]);

  const merged: BrandRecentUpdate[] = [
    ...assetRows.map((row) => ({
      updatedAt: row.updatedAt,
      kind: "asset" as const,
      description: `${row.kind} ${row.name}`,
    })),
    ...ruleRows.map((row) => ({
      updatedAt: row.updatedAt,
      kind: "rule" as const,
      description: `${row.ruleType}: ${row.content}`,
    })),
  ];

  merged.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return merged.slice(0, limit);
}
