import "server-only";

export type MetaPublicationPlatform = "facebook" | "instagram";
export type MetaPublicationStatus = "scheduled" | "published";

export type MetaPublicationCandidate = {
  id: string;
  platform: MetaPublicationPlatform;
  status: MetaPublicationStatus;
  caption: string | null;
  mediaType: "image" | "video" | "carousel" | "reel" | "unknown";
  permalink: string | null;
  thumbnailUrl: string | null;
  createdAt: Date | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
};

export type MetaPublicationCandidateRaw = Record<string, unknown>;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function httpsUrl(value: unknown): string | null {
  const candidate = stringValue(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

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

function mediaTypeValue(raw: MetaPublicationCandidateRaw): MetaPublicationCandidate["mediaType"] {
  const attachment = firstAttachment(raw);
  const value = stringValue(raw.media_product_type)?.toUpperCase();
  if (value === "REELS") return "reel";
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

  return {
    id,
    platform,
    status,
    caption: stringValue(raw.message ?? raw.caption),
    mediaType: mediaTypeValue(raw),
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
