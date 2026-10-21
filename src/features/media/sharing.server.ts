import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mediaAssets, mediaShareLinks, securityAuditEvents, storageObjects } from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { MediaPermissionError } from "@/lib/media/errors";
import {
  createMediaShareToken,
  hashMediaShareToken,
  MEDIA_SHARE_TTL_MS,
} from "@/lib/media/share-token";
import { requireMediaManager } from "./authorization";

export async function activeMediaShareForActor(actor: Actor, assetId: string) {
  const row = await requireMediaManager(actor, assetId);
  const [share] = await db
    .select({ id: mediaShareLinks.id, expiresAt: mediaShareLinks.expiresAt })
    .from(mediaShareLinks)
    .where(
      and(
        eq(mediaShareLinks.mediaAssetId, assetId),
        isNull(mediaShareLinks.revokedAt),
        gt(mediaShareLinks.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return { asset: row.asset, share: share ?? null };
}

export async function createPublicMediaShare(actor: Actor, assetId: string) {
  const row = await requireMediaManager(actor, assetId);
  if (
    row.asset.status !== "ready" ||
    row.object.status !== "active" ||
    row.object.kind !== "image"
  ) {
    throw new MediaPermissionError("Only ready images can be shared publicly.");
  }

  const token = createMediaShareToken();
  const expiresAt = new Date(Date.now() + MEDIA_SHARE_TTL_MS);
  const now = new Date();
  const share = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`media-share:${assetId}`}))`);
    await tx
      .update(mediaShareLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(mediaShareLinks.mediaAssetId, assetId), isNull(mediaShareLinks.revokedAt)));
    const [created] = await tx
      .insert(mediaShareLinks)
      .values({
        mediaAssetId: assetId,
        tokenHash: hashMediaShareToken(token),
        expiresAt,
        createdBy: actor.id,
      })
      .returning({ id: mediaShareLinks.id, expiresAt: mediaShareLinks.expiresAt });
    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "media.public_share.create",
      targetType: "media_asset",
      targetId: assetId,
      outcome: "success",
      metadata: { expiresAt: expiresAt.toISOString(), rotated: true },
    });
    return created;
  });
  if (!share) throw new Error("Public media link could not be created");
  return { token, expiresAt: share.expiresAt };
}

export async function revokePublicMediaShare(actor: Actor, assetId: string) {
  await requireMediaManager(actor, assetId);
  const now = new Date();
  const updated = await db
    .update(mediaShareLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(mediaShareLinks.mediaAssetId, assetId), isNull(mediaShareLinks.revokedAt)))
    .returning({ id: mediaShareLinks.id });
  if (updated.length > 0) {
    await db.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "media.public_share.revoke",
      targetType: "media_asset",
      targetId: assetId,
      outcome: "success",
    });
  }
  return { revoked: updated.length > 0 };
}

export async function publicMediaAssetForToken(token: string) {
  const tokenHash = hashMediaShareToken(token);
  const [row] = await db
    .select({ asset: mediaAssets, object: storageObjects })
    .from(mediaShareLinks)
    .innerJoin(mediaAssets, eq(mediaAssets.id, mediaShareLinks.mediaAssetId))
    .innerJoin(storageObjects, eq(storageObjects.id, mediaAssets.storageObjectId))
    .where(
      and(
        eq(mediaShareLinks.tokenHash, tokenHash),
        isNull(mediaShareLinks.revokedAt),
        gt(mediaShareLinks.expiresAt, new Date()),
        eq(mediaAssets.status, "ready"),
        eq(storageObjects.status, "active"),
        eq(storageObjects.kind, "image"),
      ),
    )
    .limit(1);
  return row ?? null;
}
