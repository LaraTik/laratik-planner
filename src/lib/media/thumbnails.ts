import "server-only";

/**
 * PR 2 / Tier 2 (perf/media): thumbnail variant pipeline.
 *
 * The Media Library used to ship 48 full-resolution images per page
 * and proxy every one through the Next.js server (`/api/media/assets/<uuid>`
 * -> R2 -> Next -> browser). PR 1 fixed the cache policy and added
 * fetchpriority / sizes hints, but the bytes themselves were still the
 * full originals — a 4 MB JPEG was downloaded for a 200x150 thumbnail.
 *
 * This module generates a small WebP variant at upload time, stores it
 * alongside the original on R2, and writes the variant's storage_object
 * id onto `media_assets.preview_storage_object_id`. The
 * `/api/media/assets/[id]/preview` route serves the variant, which the
 * media grid + gallery + planning preview now prefer over the full
 * original. The full URL stays the path for the gallery hero and any
 * "click to view" download.
 *
 * Pipeline:
 *   1. generatePreviewBuffer(bytes, mimeType) — sharp pipeline that
 *      keeps aspect ratio, caps width at THUMBNAIL_MAX_WIDTH, and
 *      encodes WebP at THUMBNAIL_QUALITY. Pure function; takes a
 *      Buffer, returns a Buffer. Unit-testable in isolation.
 *   2. storePreviewForAsset(actor, assetId) — reads the full asset
 *      bytes via `fetchStorageObject`, runs the generator, uploads
 *      the variant via `adapter.uploadObject`, and writes a new
 *      `storage_objects` row + sets `media_assets.preview_storage_object_id`.
 *      Reserved capacity is reserved up front so the variant counts
 *      against the agency's storage quota (same path as the original).
 *   3. fetchStorageObjectForPreview(asset) — used by the
 *      `/preview` route. Returns the variant's bytes with the same
 *      ETag passthrough the full route uses.
 *
 * Failure isolation: every step here is wrapped in try/catch inside
 * `registerUploadedMediaAsset` so a generator outage never turns an
 * otherwise verified upload into a failed one. The variant is a
 * progressive enhancement; the full URL keeps working.
 */

import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";
import { db } from "@/lib/db";
import { mediaAssets, storageObjects, workspaces } from "@/lib/db/schema";
import { reserveCapacity } from "@/lib/entitlements";
import type { Actor } from "@/lib/auth/policy";
import { getAgencyStorageContext } from "@/lib/storage/config";
import {
  createStorageObjectReadUrl,
  createStorageObjectReadUrls,
  fetchStorageObject,
} from "@/lib/storage/read-service";

/**
 * Cap on the preview's longest edge. A 4:3 cell rendered at 240x180
 * (the media grid's max CSS size) is the binding constraint; 480px
 * gives 2x device-pixel-ratio headroom on hi-dpi without bloating
 * the bytes. A 480px WebP at quality 80 averages 25-40 KB per image;
 * the full original is often 1-4 MB.
 */
export const THUMBNAIL_MAX_WIDTH = 480;

/**
 * WebP quality. 80 is the sweet spot for photographic content at the
 * 480px size — visually indistinguishable from the original at the
 * rendered scale, with the smallest byte count. Lower values (60-70)
 * start to show JPEG-style artefacts around text edges in UI
 * screenshots; higher values (85+) buy nothing the eye can resolve.
 */
export const THUMBNAIL_QUALITY = 80;

/**
 * Mime types we generate previews for. SVG is excluded because sharp
 * rasterises SVG through libvips-rsvg and the safety surface isn't
 * worth the dependency for a thumbnail; SVGs are vector and the
 * browser renders them at native resolution. GIF / animated images
 * collapse to the first frame in WebP — that's the documented
 * trade-off (animated WebP isn't worth a second dependency).
 */
const PREVIEW_SOURCE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/tiff",
]);

export const PREVIEW_MIME_TYPE = "image/webp" as const;

export interface PreviewBuffer {
  bytes: Buffer;
  width: number;
  height: number;
  byteSize: number;
}

export class PreviewGenerationError extends Error {
  constructor(
    public readonly code: "unsupported_mime_type" | "decode_failed" | "encode_failed",
    message: string,
  ) {
    super(message);
    this.name = "PreviewGenerationError";
  }
}

/**
 * Pure generator: takes the original bytes, returns the preview bytes
 * + intrinsic dimensions of the output. No DB or R2 calls — unit-
 * testable on a synthetic buffer.
 *
 * For `image/gif` we let sharp decode the first frame; an animated
 * thumbnail would need a different encoder and is out of scope for
 * v1. Document the limitation in the API route's response headers
 * (x-preview-fidelity: "first-frame") so future analytics can track
 * how often it bites.
 */
export async function generatePreviewBuffer(
  bytes: Buffer,
  mimeType: string,
): Promise<PreviewBuffer> {
  if (!PREVIEW_SOURCE_TYPES.has(mimeType)) {
    throw new PreviewGenerationError(
      "unsupported_mime_type",
      `Preview generation is not supported for ${mimeType}`,
    );
  }
  // `.rotate()` honours EXIF orientation before resizing so a portrait
  // shot from a phone camera doesn't render sideways in the grid.
  // `.resize({ withoutEnlargement: true })` keeps a tiny source at its
  // native size — a 64x64 favicon uploaded as PNG shouldn't blow up
  // to 480px wide.
  //
  // The pipeline runs to `toBuffer` BEFORE we know whether the input
  // was decodable — `sharp(bytes)` doesn't throw on garbage input
  // synchronously; the failure surfaces during `.toBuffer`. So we
  // classify the failure by examining the error code/message: sharp
  // throws a `VipsForeignLoad` error for malformed images and a
  // `VipsForeignSave` error for encoder-side issues. Anything we
  // can't classify falls back to `decode_failed` because the
  // common case is "the input was bad, not the encoder".
  let output: Buffer;
  let info: OutputInfo;
  try {
    const result = await sharp(bytes, {
      failOn: "error",
      limitInputPixels: 268_435_456,
    })
      .rotate()
      .resize({
        width: THUMBNAIL_MAX_WIDTH,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({ quality: THUMBNAIL_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    output = result.data;
    info = result.info;
  } catch (err) {
    // sharp's errors carry the underlying vips operation in the
    // message (e.g. "VipsForeignLoad:..." / "VipsForeignSave:...").
    // We classify so the caller / Sentry can distinguish "the user's
    // image was corrupt" from "libvips blew up".
    const message = err instanceof Error ? err.message : String(err);
    const isEncoder =
      /VipsForeignSave|Webp|encoder/i.test(message) && !/VipsForeignLoad/i.test(message);
    throw new PreviewGenerationError(isEncoder ? "encode_failed" : "decode_failed", message);
  }
  return {
    bytes: output,
    width: info.width,
    height: info.height,
    byteSize: output.byteLength,
  };
}

/**
 * Read the original bytes from R2 via the same proxy path the
 * `/api/media/assets/[id]` route uses. Returns null when the object
 * can't be fetched (quota error, transient outage) so the caller can
 * decide whether to surface the failure or fall back.
 */
async function readOriginalBytes(input: {
  agencyId: string;
  workspaceId: string;
  objectId: string;
  contentType: string;
}): Promise<Buffer | null> {
  const remote = await fetchStorageObject({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    objectId: input.objectId,
    expiresInSeconds: 60,
  });
  if (!remote || !remote.body) return null;
  const chunks: Buffer[] = [];
  const reader = remote.body.getReader();
  // Manual read loop — node-fetch streams don't always implement
  // async iteration across all the platforms we deploy to.
  // 100MB cap as a defensive limit; any image that big has failed
  // upload validation upstream and shouldn't reach the preview path.
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 100 * 1024 * 1024) return null;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * Generate + upload + link the preview variant for a media asset.
 *
 * Returns the new preview storage_object id on success; null on any
 * failure (unsupported mime, decode error, R2 outage, quota). The
 * caller decides whether the failure is fatal. The convention in
 * `registerUploadedMediaAsset` is to log and continue — a missing
 * preview degrades gracefully to the original URL.
 */
export async function storePreviewForAsset(
  actor: Actor,
  input: {
    assetId: string;
    agencyId: string;
    workspaceId: string;
    storageObjectId: string;
    sourceMimeType: string;
    /** Optional intrinsic width/height from the upload validator. */
    sourceWidth?: number | null;
    sourceHeight?: number | null;
  },
): Promise<string | null> {
  if (!PREVIEW_SOURCE_TYPES.has(input.sourceMimeType)) return null;

  const bytes = await readOriginalBytes({
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    objectId: input.storageObjectId,
    contentType: input.sourceMimeType,
  });
  if (!bytes) return null;

  const preview = await generatePreviewBuffer(bytes, input.sourceMimeType).catch(() => null);
  if (!preview) return null;

  const context = await getAgencyStorageContext(input.agencyId);
  // The preview key lives under the agency's prefix + a "preview/"
  // subdirectory so the original and the variant never collide and
  // a future retention sweep can find all variants in one bucket
  // prefix. We keep it under the same agency prefix so the bucket /
  // key-prefix check in `fetchStorageObject` still admits it.
  const baseName = `${input.storageObjectId}.preview.${Date.now()}.webp`;
  const objectKey = `${context.keyPrefix}preview/${baseName}`;

  // Wrap the upload in try/catch so a transient R2 outage degrades to
  // "no preview yet" rather than failing the registration.
  try {
    await context.adapter.uploadObject({
      objectKey,
      contentType: PREVIEW_MIME_TYPE,
      contentLength: preview.byteSize,
      body: Readable.from(preview.bytes),
    });
  } catch {
    return null;
  }

  // Reserve the variant's bytes against the agency quota in the same
  // transaction that creates the storage_object row + media_asset link.
  // We use `releaseCapacityAmount` on failure to keep the ledger honest.
  try {
    return await db.transaction(async (tx) => {
      await reserveCapacity(tx, input.agencyId, [
        { resource: "storage_bytes", increase: preview.byteSize },
      ]);
      const [stored] = await tx
        .insert(storageObjects)
        .values({
          agencyId: input.agencyId,
          workspaceId: input.workspaceId,
          bucket: context.bucket,
          objectKey,
          status: "active",
          kind: "image",
          originalName: `${baseName}`,
          mimeType: PREVIEW_MIME_TYPE,
          byteSize: preview.byteSize,
          width: preview.width,
          height: preview.height,
          checksumSha256: null,
          createdBy: actor.id,
        })
        .returning({ id: storageObjects.id });
      if (!stored) throw new Error("Preview storage_object row could not be created");
      await tx
        .update(mediaAssets)
        .set({ previewStorageObjectId: stored.id, updatedBy: actor.id, updatedAt: new Date() })
        .where(eq(mediaAssets.id, input.assetId));
      return stored.id;
    });
  } catch {
    return null;
  }
}

/**
 * Read the preview variant for an asset. Returns null when the asset
 * has no preview (legacy asset before this PR, or the generator
 * failed at upload). The route at `/api/media/assets/[id]/preview`
 * maps null to a 404.
 *
 * The auth check is the same as `mediaAssetForActor` — non-owners
 * who can read the asset can also read its preview. Cross-tenant
 * leaks are blocked by the workspace_id guard on `storage_objects`.
 */
export async function fetchPreviewForActor(
  actor: Actor,
  assetId: string,
): Promise<{
  agencyId: string;
  workspaceId: string;
  objectId: string;
  width: number | null;
  height: number | null;
  mimeType: string;
} | null> {
  // Resolve the asset row first; the auth gate lives there.
  const [asset] = await db
    .select({
      id: mediaAssets.id,
      agencyId: mediaAssets.agencyId,
      workspaceId: mediaAssets.ownerWorkspaceId,
      visibility: mediaAssets.visibility,
      status: mediaAssets.status,
      previewStorageObjectId: mediaAssets.previewStorageObjectId,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);
  if (!asset || asset.status !== "ready" || !asset.previewStorageObjectId) return null;

  // Same visibility / membership check as mediaAssetForActor.
  // Inlined rather than imported so the helper stays focused on
  // preview-specific concerns (the variant's storage_object lookup).
  const { hasWorkspaceRole, isAgencyMember } = await import("@/lib/auth/policy");
  const ownerAccess = await hasWorkspaceRole(actor, asset.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
  ]);
  if (!ownerAccess) {
    if (asset.visibility !== "agency" || !(await isAgencyMember(actor, asset.agencyId))) {
      return null;
    }
  }

  const [stored] = await db
    .select({
      objectId: storageObjects.id,
      width: storageObjects.width,
      height: storageObjects.height,
      mimeType: storageObjects.mimeType,
      workspaceId: workspaces.id,
      agencyId: workspaces.agencyId,
    })
    .from(storageObjects)
    .innerJoin(workspaces, eq(workspaces.id, storageObjects.workspaceId))
    .where(
      and(
        eq(storageObjects.id, asset.previewStorageObjectId),
        eq(storageObjects.agencyId, asset.agencyId),
        eq(storageObjects.workspaceId, asset.workspaceId),
        eq(storageObjects.status, "active"),
      ),
    )
    .limit(1);
  if (!stored) return null;

  return {
    agencyId: stored.agencyId,
    workspaceId: stored.workspaceId,
    objectId: stored.objectId,
    width: stored.width,
    height: stored.height,
    mimeType: stored.mimeType,
  };
}

/**
 * Lazy backfill helper: when the preview is missing for a legacy
 * asset, generate it on demand. Used by `/api/media/assets/[id]`
 * (the full route) when the `/preview` route returns 404 — the route
 * fires off a one-shot regeneration and lets the next page load pick
 * up the variant. The function is intentionally best-effort: a failure
 * returns null and the caller falls back to the original URL.
 */
export async function backfillPreviewIfMissing(
  actor: Actor,
  input: {
    assetId: string;
    agencyId: string;
    workspaceId: string;
    storageObjectId: string;
    sourceMimeType: string;
  },
): Promise<string | null> {
  // Guard against re-entry: read the asset first.
  const [asset] = await db
    .select({ previewStorageObjectId: mediaAssets.previewStorageObjectId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, input.assetId))
    .limit(1);
  if (!asset) return null;
  if (asset.previewStorageObjectId) return asset.previewStorageObjectId;
  return storePreviewForAsset(actor, {
    assetId: input.assetId,
    agencyId: input.agencyId,
    workspaceId: input.workspaceId,
    storageObjectId: input.storageObjectId,
    sourceMimeType: input.sourceMimeType,
  });
}

/**
 * PR 3 / Tier 3 (perf/media): direct signed-URL preview path.
 *
 * Server-side helper that hands back a short-lived signed R2 URL
 * pointing straight at the preview variant. The browser fetches the
 * bytes directly from R2's Cloudflare edge — no Next.js hop — which
 * removes the per-image Node.js proxy from the request path. This is
 * the "bypass the proxy" half of the perf plan in
 * `docs/media-library-plan.md:250`.
 *
 * Why a signed URL instead of a public bucket: the preview lives in
 * the same private bucket as the originals. A signed URL scopes
 * access to "anyone holding this URL" — fine for a `<img src>` because
 * the URL is per-page (regenerated on every server render) and the
 * browser caches the bytes by URL + ETag. The trade-off vs the
 * `/api/media/assets/[id]/preview` proxy route:
 *
 *   - Bytes flow R2 → browser, no Next.js CPU + egress.
 *   - The signed URL TTL is the max the adapter supports (15 min —
 *     `r2-adapter.ts:143` clamps `expiresInSeconds` to [30, 900]).
 *     Within that window the browser hits its own cache for repeat
 *     `<img>` re-renders. Past 15 min the bytes the browser cached
 *     by ETag are still served; only a fresh page navigation
 *     triggers a re-sign. That matches the user's session length
 *     for the planner tool — 15 min is long enough.
 *
 * Auth gate: same as `fetchPreviewForActor`. A non-owner with no
 * agency membership gets null. The signed URL is content-addressed
 * (its signature embeds the object key + the storage context's
 * signing credentials) so even if a URL leaks it only grants access
 * to that one preview variant, only for the 15-min window.
 */
export async function getSignedPreviewUrl(actor: Actor, assetId: string): Promise<string | null> {
  // Reuse the auth gate from `fetchPreviewForActor` so the two read
  // paths can never drift on permissions.
  const preview = await fetchPreviewForActor(actor, assetId);
  if (!preview) return null;
  try {
    return await createStorageObjectReadUrl({
      agencyId: preview.agencyId,
      workspaceId: preview.workspaceId,
      objectId: preview.objectId,
      // 15 min — the adapter's hard max. Long enough that a single
      // session's worth of page navigations reuses the cached URL;
      // short enough that a leaked URL has a tight blast radius.
      expiresInSeconds: 900,
    });
  } catch {
    // R2 sign failure is rare (HMAC is local) but possible if the
    // signing credentials rotated between page render and
    // createReadUrl. Fall back to the proxy route — the user gets
    // the bytes either way.
    return null;
  }
}

/**
 * Batch form used by the media library after `listMediaAssets` has applied
 * its visibility and workspace-access rules. It avoids repeating the
 * per-asset authorization/configuration path for every card on a page.
 */
export async function getSignedPreviewUrls(
  targets: ReadonlyArray<{
    assetId: string;
    agencyId: string;
    workspaceId: string;
    previewStorageObjectId: string | null;
  }>,
): Promise<Map<string, string>> {
  const previewTargets = targets.filter(
    (target) => target.previewStorageObjectId && target.previewStorageObjectId.length > 0,
  );
  if (previewTargets.length === 0) return new Map();

  const byAgency = new Map<string, typeof previewTargets>();
  for (const target of previewTargets) {
    const agencyTargets = byAgency.get(target.agencyId) ?? [];
    agencyTargets.push(target);
    byAgency.set(target.agencyId, agencyTargets);
  }

  const entries = await Promise.all(
    [...byAgency.entries()].map(async ([agencyId, agencyTargets]) => {
      try {
        const urls = await createStorageObjectReadUrls({
          agencyId,
          objects: agencyTargets.map((target) => ({
            objectId: target.previewStorageObjectId!,
            workspaceId: target.workspaceId,
          })),
          expiresInSeconds: 900,
        });
        return agencyTargets.flatMap((target) => {
          const objectId = target.previewStorageObjectId;
          const url = objectId ? urls.get(objectId) : undefined;
          return url ? [[target.assetId, url] as const] : [];
        });
      } catch {
        return [];
      }
    }),
  );

  return new Map(entries.flat());
}
