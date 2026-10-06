import "server-only";
import { httpsUrl, stringValue } from "@/lib/social/media-fields";

export type MetaPublicationPlatform = "facebook" | "instagram";
export type MetaPublicationStatus = "scheduled" | "published";

export type MetaPublicationMediaType =
  "image" | "video" | "carousel" | "reel" | "story" | "unknown";

export type MetaPublicationCandidate = {
  id: string;
  platform: MetaPublicationPlatform;
  status: MetaPublicationStatus;
  caption: string | null;
  mediaType: MetaPublicationMediaType;
  permalink: string | null;
  thumbnailUrl: string | null;
  createdAt: Date | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  /**
   * When the live artifact disappears on its own. Only Stories set this.
   * Stories are visible for 24 hours, so their link is useful while live
   * and dead afterwards; the service uses this to stamp
   * `publication_record.expires_at`, which in turn is what lets a Story be
   * recorded as `published` with no `published_url` at all.
   */
  expiresAt: Date | null;
};

export type MetaPublicationCandidateRaw = Record<string, unknown>;

function dateValue(value: unknown): Date | null {
  const raw = stringValue(value) ?? (typeof value === "number" ? String(value) : null);
  if (!raw) return null;
  const parsed = new Date(/^\d+$/.test(raw) ? Number(raw) * 1000 : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function firstAttachment(raw: MetaPublicationCandidateRaw): Record<string, unknown> | null {
  const attachments = raw.attachments;
  if (!attachments || typeof attachments !== "object") return null;
  const data = (attachments as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : null;
  return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
}

/**
 * How long an Instagram Story stays live. Meta exposes no expiry field on
 * the media object, so the window is derived from publish time. Isolated as
 * a named constant because it is the one number that would silently rot if
 * Instagram ever changes the retention window.
 */
export const META_STORY_TTL_MS = 24 * 60 * 60_000;

function mediaTypeValue(raw: MetaPublicationCandidateRaw): MetaPublicationCandidate["mediaType"] {
  const attachment = firstAttachment(raw);
  // `media_product_type` is the only field that distinguishes a Story: Meta
  // reports Stories with `media_type` of IMAGE or VIDEO, so without this
  // branch a Story is indistinguishable from a feed post. Documented values
  // are AD / FEED / STORY / REELS.
  const productType = stringValue(raw.media_product_type)?.toUpperCase();
  if (productType === "STORY") return "story";
  if (productType === "REELS") return "reel";
  const mediaType = stringValue(raw.media_type ?? attachment?.media_type)?.toUpperCase();
  if (mediaType === "CAROUSEL_ALBUM") return "carousel";
  if (mediaType === "IMAGE") return "image";
  if (mediaType === "VIDEO") return "video";
  return "unknown";
}

export function normalizeMetaPublication(
  platform: MetaPublicationPlatform,
  raw: MetaPublicationCandidateRaw,
  now = new Date(),
): MetaPublicationCandidate {
  const id = stringValue(raw.id);
  if (!id) throw new Error("Meta publication is missing an id");

  const createdAt = dateValue(raw.created_time ?? raw.timestamp);
  const scheduledAt = dateValue(raw.scheduled_publish_time);
  const explicitlyUnpublished = raw.is_published === false;
  const scheduledInFuture = scheduledAt !== null && scheduledAt.getTime() > now.getTime();
  const status: MetaPublicationStatus =
    explicitlyUnpublished || scheduledInFuture ? "scheduled" : "published";
  const publishedAt = status === "published" ? createdAt : null;
  const mediaType = mediaTypeValue(raw);

  // Only Stories expire. `now` is the last fallback so a Story always yields
  // a non-null window even when Meta omits every timestamp — that guarantee
  // is what keeps a linkless Story satisfiable against
  // `publication_published_needs_url_time_publisher`.
  const expiresFrom = publishedAt ?? createdAt ?? now;
  const expiresAt =
    mediaType === "story" ? new Date(expiresFrom.getTime() + META_STORY_TTL_MS) : null;

  return {
    id,
    platform,
    status,
    caption: stringValue(raw.message ?? raw.caption),
    mediaType,
    permalink: httpsUrl(raw.permalink_url ?? raw.permalink),
    thumbnailUrl: httpsUrl(
      raw.thumbnail_url ??
        raw.media_url ??
        firstAttachment(raw)?.thumbnail_url ??
        firstAttachment(raw)?.media_url,
    ),
    createdAt,
    scheduledAt,
    publishedAt,
    expiresAt,
  };
}

function candidateTime(candidate: MetaPublicationCandidate): number {
  return (
    candidate.scheduledAt?.getTime() ??
    candidate.publishedAt?.getTime() ??
    candidate.createdAt?.getTime() ??
    0
  );
}

export function mergeMetaPublicationCandidates(
  candidates: readonly MetaPublicationCandidate[],
): MetaPublicationCandidate[] {
  const byId = new Map<string, MetaPublicationCandidate>();
  for (const candidate of candidates) {
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === "scheduled" ? -1 : 1;
    return candidateTime(b) - candidateTime(a);
  });
}

export function rankMetaPublicationCandidates(
  candidates: readonly MetaPublicationCandidate[],
  input: { targetDate: Date; searchText?: string },
): MetaPublicationCandidate[] {
  const searchText = input.searchText?.trim().toLocaleLowerCase() ?? "";
  const searchTerms = searchText
    .split(/\s+/)
    .filter((term) => term.length >= 3)
    .slice(0, 12);
  const scored = candidates.map((candidate, index) => {
    const caption = candidate.caption?.toLocaleLowerCase() ?? "";
    const matchedTerms = searchTerms.filter((term) => caption.includes(term)).length;
    const textMatch = matchedTerms > 0 ? 100 + matchedTerms * 10 : 0;
    const distance = Math.abs(candidateTime(candidate) - input.targetDate.getTime());
    const dateMatch =
      distance <= 24 * 60 * 60 * 1000 ? 40 : distance <= 3 * 24 * 60 * 60 * 1000 ? 15 : 0;
    return { candidate, score: textMatch + dateMatch, index };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate }) => candidate);
}
