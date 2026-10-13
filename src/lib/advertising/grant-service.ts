import { and, desc, eq } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import {
  advertisingAccounts,
  advertisingFinancialAuthorities,
  advertisingGrantRevisions,
  advertisingVisibilityGrants,
  securityAuditEvents,
  workspaces,
} from "@/lib/db/schema";
import type { AdvertisingCapability } from "./types";

type Db = typeof appDb;
type GrantTransaction = Pick<Db, "select" | "insert">;

const GRANT_CAPABILITIES = new Set<AdvertisingCapability>([
  "discover_accounts",
  "read_campaigns",
  "read_adsets",
  "read_ads",
  "read_creatives",
  "read_reports",
  "read_financials",
  "manage_visibility_grants",
  "run_diagnostics",
  "use_ai_context",
  "export_reports",
]);

export class AdvertisingGrantInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvertisingGrantInputError";
  }
}

function snapshotGrant(grant: {
  agencyId: string;
  workspaceId: string | null;
  accountId: string;
  capability: string;
  campaignIds: string[] | null;
  adSetIds: string[] | null;
  adIds: string[] | null;
  startsAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    agencyId: grant.agencyId,
    workspaceId: grant.workspaceId,
    accountId: grant.accountId,
    capability: grant.capability,
    campaignIds: grant.campaignIds,
    adSetIds: grant.adSetIds,
    adIds: grant.adIds,
    startsAt: grant.startsAt.toISOString(),
    endsAt: grant.endsAt?.toISOString() ?? null,
    revokedAt: grant.revokedAt?.toISOString() ?? null,
  };
}

async function assertAccountScope(
  db: Db,
  args: { agencyId: string; accountId: string; workspaceId?: string | null | undefined },
) {
  const account = (
    await db
      .select({ id: advertisingAccounts.id, agencyId: advertisingAccounts.agencyId })
      .from(advertisingAccounts)
      .where(
        and(
          eq(advertisingAccounts.id, args.accountId),
          eq(advertisingAccounts.agencyId, args.agencyId),
        ),
      )
      .limit(1)
  )[0];
  if (!account) throw new AdvertisingGrantInputError("advertising_account_not_in_agency");
  if (args.workspaceId) {
    const workspace = (
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, args.workspaceId), eq(workspaces.agencyId, args.agencyId)))
        .limit(1)
    )[0];
    if (!workspace) throw new AdvertisingGrantInputError("workspace_not_in_agency");
  }
}

async function appendRevision(
  tx: GrantTransaction,
  grant: Awaited<ReturnType<typeof insertVisibilityGrant>>,
  action: "created" | "updated" | "revoked",
  actorId: string,
) {
  const previous = (
    await tx
      .select({ revision: advertisingGrantRevisions.revision })
      .from(advertisingGrantRevisions)
      .where(eq(advertisingGrantRevisions.grantId, grant.id))
      .orderBy(desc(advertisingGrantRevisions.revision))
      .limit(1)
  )[0];
  await tx.insert(advertisingGrantRevisions).values({
    grantId: grant.id,
    revision: (previous?.revision ?? 0) + 1,
    action,
    snapshot: snapshotGrant(grant),
    changedBy: actorId,
  });
  await tx.insert(securityAuditEvents).values({
    actorId,
    action: `advertising.visibility_grant.${action}`,
    targetType: "advertising_visibility_grant",
    targetId: grant.id,
    outcome: "success",
    metadata: {
      agencyId: grant.agencyId,
      workspaceId: grant.workspaceId,
      accountId: grant.accountId,
      capability: grant.capability,
    },
  });
}

async function insertVisibilityGrant(
  tx: GrantTransaction,
  args: {
    agencyId: string;
    workspaceId: string | null;
    accountId: string;
    capability: AdvertisingCapability;
    campaignIds: string[] | null;
    adSetIds: string[] | null;
    adIds: string[] | null;
    startsAt: Date;
    endsAt: Date | null;
    grantedBy: string;
  },
) {
  const inserted = await tx.insert(advertisingVisibilityGrants).values(args).returning();
  const grant = inserted[0];
  if (!grant) throw new Error("Advertising visibility grant was not created");
  return grant;
}

/** Create an agency- or workspace-scoped visibility grant and its audit revision atomically. */
export async function grantAdvertisingVisibility(
  db: Db,
  args: {
    agencyId: string;
    workspaceId?: string | null | undefined;
    accountId: string;
    capability: AdvertisingCapability;
    campaignIds?: readonly string[] | null | undefined;
    adSetIds?: readonly string[] | null | undefined;
    adIds?: readonly string[] | null | undefined;
    startsAt?: Date | undefined;
    endsAt?: Date | null | undefined;
    grantedBy: string;
  },
) {
  if (!GRANT_CAPABILITIES.has(args.capability))
    throw new AdvertisingGrantInputError("unsupported_advertising_capability");
  if (args.endsAt && args.startsAt && args.endsAt <= args.startsAt)
    throw new AdvertisingGrantInputError("advertising_grant_range_invalid");
  await assertAccountScope(db, args);
  const startsAt = args.startsAt ?? new Date();
  const endsAt = args.endsAt ?? null;
  return db.transaction(async (tx) => {
    const grant = await insertVisibilityGrant(tx, {
      agencyId: args.agencyId,
      workspaceId: args.workspaceId ?? null,
      accountId: args.accountId,
      capability: args.capability,
      campaignIds: args.campaignIds ? [...args.campaignIds] : null,
      adSetIds: args.adSetIds ? [...args.adSetIds] : null,
      adIds: args.adIds ? [...args.adIds] : null,
      startsAt,
      endsAt,
      grantedBy: args.grantedBy,
    });
    await appendRevision(tx, grant, "created", args.grantedBy);
    return grant;
  });
}

/** Revoke the grant itself, retaining its history and invalidating future report/cache reads. */
export async function revokeAdvertisingVisibility(
  db: Db,
  args: { agencyId: string; grantId: string; revokedBy: string },
) {
  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(advertisingVisibilityGrants)
        .where(
          and(
            eq(advertisingVisibilityGrants.id, args.grantId),
            eq(advertisingVisibilityGrants.agencyId, args.agencyId),
          ),
        )
        .limit(1)
    )[0];
    if (!existing) throw new AdvertisingGrantInputError("advertising_grant_not_found");
    const [grant] = await tx
      .update(advertisingVisibilityGrants)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(advertisingVisibilityGrants.id, args.grantId))
      .returning();
    if (!grant) throw new AdvertisingGrantInputError("advertising_grant_not_found");
    await appendRevision(tx, grant, "revoked", args.revokedBy);
    return grant;
  });
}

/** Financial ownership is a separate grant and cannot be inferred from visibility. */
export async function grantAdvertisingFinancialAuthority(
  db: Db,
  args: {
    agencyId: string;
    workspaceId?: string | null | undefined;
    accountId: string;
    startsAt?: Date | undefined;
    endsAt?: Date | null | undefined;
    grantedBy: string;
  },
) {
  if (args.endsAt && args.startsAt && args.endsAt <= args.startsAt)
    throw new AdvertisingGrantInputError("advertising_grant_range_invalid");
  await assertAccountScope(db, args);
  const [authority] = await db
    .insert(advertisingFinancialAuthorities)
    .values({
      agencyId: args.agencyId,
      workspaceId: args.workspaceId ?? null,
      accountId: args.accountId,
      startsAt: args.startsAt ?? new Date(),
      endsAt: args.endsAt ?? null,
      grantedBy: args.grantedBy,
    })
    .returning();
  if (!authority) throw new Error("Advertising financial authority was not created");
  return authority;
}

/** Revoke financial authority without deleting its audit-relevant row. */
export async function revokeAdvertisingFinancialAuthority(
  db: Db,
  args: { agencyId: string; authorityId: string; revokedBy: string },
) {
  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(advertisingFinancialAuthorities)
        .where(
          and(
            eq(advertisingFinancialAuthorities.id, args.authorityId),
            eq(advertisingFinancialAuthorities.agencyId, args.agencyId),
          ),
        )
        .limit(1)
    )[0];
    if (!existing)
      throw new AdvertisingGrantInputError("advertising_financial_authority_not_found");
    const [authority] = await tx
      .update(advertisingFinancialAuthorities)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(advertisingFinancialAuthorities.id, args.authorityId))
      .returning();
    if (!authority)
      throw new AdvertisingGrantInputError("advertising_financial_authority_not_found");
    await tx.insert(securityAuditEvents).values({
      actorId: args.revokedBy,
      action: "advertising.financial_authority.revoked",
      targetType: "advertising_financial_authority",
      targetId: authority.id,
      outcome: "success",
      metadata: {
        agencyId: authority.agencyId,
        workspaceId: authority.workspaceId,
        accountId: authority.accountId,
      },
    });
    return authority;
  });
}
