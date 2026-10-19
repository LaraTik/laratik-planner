import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { advertisingLocalTags, advertisingReportShares } from "@/lib/db/schema";
import {
  normalizeAdvertisingTag,
  type AdvertisingEntityType,
  type AdvertisingTaxonomyLabelType,
} from "./reporting-metadata";

export async function listAdvertisingLocalTags(input: { workspaceId: string; accountId: string }) {
  return db
    .select()
    .from(advertisingLocalTags)
    .where(
      and(
        eq(advertisingLocalTags.workspaceId, input.workspaceId),
        eq(advertisingLocalTags.accountId, input.accountId),
      ),
    )
    .orderBy(asc(advertisingLocalTags.labelType), asc(advertisingLocalTags.tagValue));
}

export async function addAdvertisingLocalTag(input: {
  agencyId: string;
  workspaceId: string;
  accountId: string;
  userId: string;
  entityType: AdvertisingEntityType;
  entityId: string;
  labelType: AdvertisingTaxonomyLabelType;
  tagValue: string;
}) {
  const [row] = await db
    .insert(advertisingLocalTags)
    .values({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      createdBy: input.userId,
      entityType: input.entityType,
      entityId: input.entityId.trim(),
      labelType: input.labelType,
      tagValue: normalizeAdvertisingTag(input.tagValue),
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export async function removeAdvertisingLocalTag(input: {
  workspaceId: string;
  accountId: string;
  entityType: AdvertisingEntityType;
  entityId: string;
  labelType: AdvertisingTaxonomyLabelType;
  tagValue: string;
}) {
  const [row] = await db
    .delete(advertisingLocalTags)
    .where(
      and(
        eq(advertisingLocalTags.workspaceId, input.workspaceId),
        eq(advertisingLocalTags.accountId, input.accountId),
        eq(advertisingLocalTags.entityType, input.entityType),
        eq(advertisingLocalTags.entityId, input.entityId),
        eq(advertisingLocalTags.labelType, input.labelType),
        eq(advertisingLocalTags.tagValue, normalizeAdvertisingTag(input.tagValue)),
      ),
    )
    .returning();
  return row ?? null;
}

export async function createAdvertisingReportShare(input: {
  agencyId: string;
  workspaceId: string;
  accountId: string;
  userId: string;
  viewConfig: Record<string, unknown>;
  expiresInDays: number;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(advertisingReportShares)
    .values({
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      createdBy: input.userId,
      tokenHash,
      viewConfig: input.viewConfig,
      expiresAt,
    })
    .returning({ id: advertisingReportShares.id, expiresAt: advertisingReportShares.expiresAt });
  return row ? { ...row, rawToken } : null;
}

export async function getAdvertisingReportShare(rawToken: string) {
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const [row] = await db
    .select()
    .from(advertisingReportShares)
    .where(
      and(
        eq(advertisingReportShares.tokenHash, tokenHash),
        isNull(advertisingReportShares.revokedAt),
        or(
          isNull(advertisingReportShares.expiresAt),
          gt(advertisingReportShares.expiresAt, new Date()),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}
