import "server-only";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brandAssets,
  brandLinkedResources,
  brandPublishingRules,
  brandVoiceRules,
  contentPillars,
  users,
} from "@/lib/db/schema";
import { hasWorkspaceRole, PermissionDeniedError, type Actor } from "@/lib/auth/policy";
import type {
  BrandAssetCommand,
  BrandLinkedResourceCommand,
  BrandPublishingRuleCommand,
  BrandVoiceRuleCommand,
} from "@/lib/brand/command";

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
export type BrandPublishingRuleRow = typeof brandPublishingRules.$inferSelect;
export type BrandLinkedResourceRow = typeof brandLinkedResources.$inferSelect;

export type BrandAssetKind = BrandAssetRow["kind"];
export type BrandVoiceRuleType = BrandVoiceRuleRow["ruleType"];
export type BrandPublishingRuleType = BrandPublishingRuleRow["ruleType"];
export type BrandLinkedResourceProvider = BrandLinkedResourceRow["provider"];

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
  opts?: { ruleType?: BrandVoiceRuleType; includeArchived?: boolean },
): Promise<BrandVoiceRuleRow[]> {
  const workspaceCond = eq(brandVoiceRules.workspaceId, workspaceId);
  const archivedCond = !opts?.includeArchived ? isNull(brandVoiceRules.archivedAt) : undefined;
  const ruleTypeCond = opts?.ruleType ? eq(brandVoiceRules.ruleType, opts.ruleType) : undefined;
  const where =
    archivedCond || ruleTypeCond ? and(workspaceCond, archivedCond, ruleTypeCond) : workspaceCond;
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

export async function restoreLogoAsset(
  actor: Actor,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "restore logo asset");
  await db
    .update(brandAssets)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(brandAssets.id, assetId),
        eq(brandAssets.workspaceId, workspaceId),
        eq(brandAssets.kind, "logo"),
      ),
    );
}

/**
 * Round 2 typed wrappers for the font variant. Mirrors
 * `createLogoAsset`/`archiveLogoAsset` above.
 */
export type FontAssetInput = {
  name: string;
  family: string;
  weight: number;
  role: "headline" | "body" | "accent" | "mono";
};

export async function createFontAsset(
  actor: Actor,
  workspaceId: string,
  input: FontAssetInput,
): Promise<void> {
  await requireManager(actor, workspaceId, "create font asset");
  await db.insert(brandAssets).values({
    workspaceId,
    createdBy: actor.id,
    kind: "font",
    name: input.name,
    value: {
      family: input.family,
      weight: input.weight,
      role: input.role,
    },
  });
}

export async function archiveFontAsset(
  actor: Actor,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "archive font asset");
  await db
    .update(brandAssets)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(brandAssets.id, assetId), eq(brandAssets.workspaceId, workspaceId)));
}

export async function restoreFontAsset(
  actor: Actor,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "restore font asset");
  await db
    .update(brandAssets)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(brandAssets.id, assetId),
        eq(brandAssets.workspaceId, workspaceId),
        eq(brandAssets.kind, "font"),
      ),
    );
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

export async function restoreBrandAsset(
  actor: Actor,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "restore brand asset");
  await db
    .update(brandAssets)
    .set({ archivedAt: null, updatedAt: new Date() })
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
  // Soft-archive (migration 0006 added `archived_at`). The page uses
  // `listBrandVoiceRules` with the default `includeArchived: false`,
  // so an archived rule disappears from the section immediately; the
  // undo toast can call `restoreBrandVoiceRule` to bring it back.
  await db
    .update(brandVoiceRules)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(brandVoiceRules.id, ruleId), eq(brandVoiceRules.workspaceId, workspaceId)));
}

export async function restoreBrandVoiceRule(
  actor: Actor,
  workspaceId: string,
  ruleId: string,
): Promise<void> {
  await requireManager(actor, workspaceId, "restore brand voice rule");
  await db
    .update(brandVoiceRules)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(brandVoiceRules.id, ruleId), eq(brandVoiceRules.workspaceId, workspaceId)));
}

/**
 * Round 3 — publishing-rule + linked-resource operations
 * (STUDIOFLOW_MASTER_PROMPT.md §11.x brand-kit extension).
 *
 * Mutations are gated on a *broader* role set than assets/voice rules
 * because publishing rules drive the editor's draft-time hints and
 * the resource list is a shared reference. We allow
 * `workspace_manager` and `content_planner`; designers/reviewers/
 * publishers/viewers/client reviewers all deny.
 *
 * `listRecentBrandUpdates` is extended below to merge rule and
 * resource rows in, while *stripping* the `url` field for the
 * activity feed — a viewer can see that a resource exists but
 * shouldn't get the deep-link to the upstream library.
 */
const BRAND_MANAGER_ROLES = ["workspace_manager", "content_planner"] as const;

async function requireBrandManager(
  actor: Actor,
  workspaceId: string,
  action: string,
): Promise<void> {
  const allowed = await hasWorkspaceRole(actor, workspaceId, [...BRAND_MANAGER_ROLES]);
  if (!allowed) throw new PermissionDeniedError(action);
}

export async function listBrandPublishingRules(
  workspaceId: string,
): Promise<BrandPublishingRuleRow[]> {
  return db
    .select()
    .from(brandPublishingRules)
    .where(
      and(
        eq(brandPublishingRules.workspaceId, workspaceId),
        isNull(brandPublishingRules.archivedAt),
      ),
    )
    .orderBy(asc(brandPublishingRules.sortOrder), asc(brandPublishingRules.createdAt));
}

export async function listBrandLinkedResources(
  workspaceId: string,
): Promise<BrandLinkedResourceRow[]> {
  return db
    .select()
    .from(brandLinkedResources)
    .where(
      and(
        eq(brandLinkedResources.workspaceId, workspaceId),
        isNull(brandLinkedResources.archivedAt),
      ),
    )
    .orderBy(asc(brandLinkedResources.name));
}

export async function createBrandPublishingRule(
  actor: Actor,
  workspaceId: string,
  input: BrandPublishingRuleCommand,
): Promise<void> {
  await requireBrandManager(actor, workspaceId, "create brand publishing rule");
  await db.insert(brandPublishingRules).values({
    workspaceId,
    createdBy: actor.id,
    ruleType: input.ruleType,
    title: input.title,
    content: input.content,
    sortOrder: 0,
  });
}

export async function archiveBrandPublishingRule(
  actor: Actor,
  workspaceId: string,
  ruleId: string,
): Promise<void> {
  await requireBrandManager(actor, workspaceId, "archive brand publishing rule");
  // Workspace scope is part of the predicate so a workspace-A user
  // can never archive a workspace-B row, even if they guess the id.
  await db
    .update(brandPublishingRules)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(brandPublishingRules.id, ruleId), eq(brandPublishingRules.workspaceId, workspaceId)),
    );
}

export async function restoreBrandPublishingRule(
  actor: Actor,
  workspaceId: string,
  ruleId: string,
): Promise<void> {
  await requireBrandManager(actor, workspaceId, "restore brand publishing rule");
  await db
    .update(brandPublishingRules)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(eq(brandPublishingRules.id, ruleId), eq(brandPublishingRules.workspaceId, workspaceId)),
    );
}

export async function createBrandLinkedResource(
  actor: Actor,
  workspaceId: string,
  input: BrandLinkedResourceCommand,
): Promise<void> {
  await requireBrandManager(actor, workspaceId, "create brand linked resource");
  await db.insert(brandLinkedResources).values({
    workspaceId,
    createdBy: actor.id,
    provider: input.provider,
    name: input.name,
    url: input.url,
    description: input.description ?? null,
  });
}

export async function archiveBrandLinkedResource(
  actor: Actor,
  workspaceId: string,
  resourceId: string,
): Promise<void> {
  await requireBrandManager(actor, workspaceId, "archive brand linked resource");
  // Same tenancy-scoped predicate as the asset archive path — the
  // resource id alone is not enough to identify the row to update.
  await db
    .update(brandLinkedResources)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(brandLinkedResources.id, resourceId),
        eq(brandLinkedResources.workspaceId, workspaceId),
      ),
    );
}

export async function restoreBrandLinkedResource(
  actor: Actor,
  workspaceId: string,
  resourceId: string,
): Promise<void> {
  await requireBrandManager(actor, workspaceId, "restore brand linked resource");
  await db
    .update(brandLinkedResources)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(brandLinkedResources.id, resourceId),
        eq(brandLinkedResources.workspaceId, workspaceId),
      ),
    );
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
  kind: "asset" | "rule" | "publishing_rule" | "linked_resource";
  description: string;
  actor: {
    id: string;
    displayName: string;
    image: string | null;
  } | null;
};

/**
 * Recent brand-kit updates — a union of the most recent `brand_assets`,
 * `brand_voice_rules`, `brand_publishing_rule`, and
 * `brand_linked_resource` rows by `updated_at`, sorted desc, sliced to
 * `limit`. The merge is done in JS (four cheap queries, each with a
 * `users` join) to keep the SQL portable and the test surface small.
 *
 * **Privacy note:** the `linked_resource` rows expose only
 * `${provider} ${name}` — the actual `url` is intentionally stripped
 * so a viewer with read access to the brand kit can see *that* a
 * resource exists but cannot pivot to the upstream library via the
 * activity feed. The full URL is still served by
 * `listBrandLinkedResources` (which renders the brand-kit page).
 *
 * Round 4: each row now carries the actor (`created_by`) — name +
 * avatar — so the Recent Updates table can render a real user chip
 * instead of the previous hardcoded "M" placeholder.
 */
export async function listRecentBrandUpdates(
  workspaceId: string,
  limit = 10,
): Promise<BrandRecentUpdate[]> {
  const actorSelect = {
    actorId: users.id,
    actorName: users.displayName,
    actorImage: users.image,
  };

  const [assetRows, ruleRows, publishingRows, resourceRows] = await Promise.all([
    db
      .select({
        updatedAt: brandAssets.updatedAt,
        kind: brandAssets.kind,
        name: brandAssets.name,
        ...actorSelect,
      })
      .from(brandAssets)
      .leftJoin(users, eq(users.id, brandAssets.createdBy))
      .where(and(eq(brandAssets.workspaceId, workspaceId), isNull(brandAssets.archivedAt)))
      .orderBy(desc(brandAssets.updatedAt))
      .limit(limit),
    db
      .select({
        updatedAt: brandVoiceRules.updatedAt,
        ruleType: brandVoiceRules.ruleType,
        content: brandVoiceRules.content,
        ...actorSelect,
      })
      .from(brandVoiceRules)
      .leftJoin(users, eq(users.id, brandVoiceRules.createdBy))
      .where(and(eq(brandVoiceRules.workspaceId, workspaceId), isNull(brandVoiceRules.archivedAt)))
      .orderBy(desc(brandVoiceRules.updatedAt))
      .limit(limit),
    db
      .select({
        updatedAt: brandPublishingRules.updatedAt,
        ruleType: brandPublishingRules.ruleType,
        title: brandPublishingRules.title,
        ...actorSelect,
      })
      .from(brandPublishingRules)
      .leftJoin(users, eq(users.id, brandPublishingRules.createdBy))
      .where(
        and(
          eq(brandPublishingRules.workspaceId, workspaceId),
          isNull(brandPublishingRules.archivedAt),
        ),
      )
      .orderBy(desc(brandPublishingRules.updatedAt))
      .limit(limit),
    db
      .select({
        updatedAt: brandLinkedResources.updatedAt,
        provider: brandLinkedResources.provider,
        name: brandLinkedResources.name,
        ...actorSelect,
      })
      .from(brandLinkedResources)
      .leftJoin(users, eq(users.id, brandLinkedResources.createdBy))
      .where(
        and(
          eq(brandLinkedResources.workspaceId, workspaceId),
          isNull(brandLinkedResources.archivedAt),
        ),
      )
      .orderBy(desc(brandLinkedResources.updatedAt))
      .limit(limit),
  ]);

  const toActor = (row: {
    actorId: string | null;
    actorName: string | null;
    actorImage: string | null;
  }) =>
    row.actorId
      ? { id: row.actorId, displayName: row.actorName ?? "Unknown", image: row.actorImage ?? null }
      : null;

  const merged: BrandRecentUpdate[] = [
    ...assetRows.map((row) => ({
      updatedAt: row.updatedAt,
      kind: "asset" as const,
      description: `${row.kind} ${row.name}`,
      actor: toActor(row),
    })),
    ...ruleRows.map((row) => ({
      updatedAt: row.updatedAt,
      kind: "rule" as const,
      description: `${row.ruleType}: ${row.content}`,
      actor: toActor(row),
    })),
    ...publishingRows.map((row) => ({
      updatedAt: row.updatedAt,
      kind: "publishing_rule" as const,
      description: `${row.ruleType}: ${row.title}`,
      actor: toActor(row),
    })),
    ...resourceRows.map((row) => ({
      updatedAt: row.updatedAt,
      kind: "linked_resource" as const,
      // No URL — see the privacy note on the function docblock.
      description: `${row.provider} ${row.name}`,
      actor: toActor(row),
    })),
  ];

  merged.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return merged.slice(0, limit);
}
