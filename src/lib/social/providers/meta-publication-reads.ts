import "server-only";

import { SocialProviderError, providerRequest } from "@/lib/social/http";
import type { SocialCredentials } from "@/lib/social/crypto";
import {
  mergeMetaPublicationCandidates,
  normalizeMetaPublication,
  type MetaPublicationCandidate,
  type MetaPublicationCandidateRaw,
  type MetaPublicationPlatform,
} from "@/lib/social/meta-publications";
import { acquirePageAccessToken, graphBaseUrl, resolveGraphVersion } from "./meta-connection";

type MetaPublicationCollectionResponse = {
  data?: unknown[];
  paging?: { cursors?: { after?: string }; next?: string };
};

export type MetaPublicationCandidatePage = {
  candidates: MetaPublicationCandidate[];
  nextCursor: string | null;
  scheduledCoverage: "complete" | "published_only";
};

export type FetchMetaPublicationCandidatesInput = {
  platform: MetaPublicationPlatform;
  accountId: string;
  credentials: SocialCredentials;
  apiVersion?: string | null;
  now?: Date;
  publishedSince: Date;
  after?: string | null;
  limit?: number;
};

type FacebookPublicationCursor = {
  version: 1;
  scheduledAfter: string | null;
  feedAfter: string | null;
};

function encodeFacebookPublicationCursor(cursor: FacebookPublicationCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeFacebookPublicationCursor(
  value: string | null | undefined,
): FacebookPublicationCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<FacebookPublicationCursor>;
    if (
      parsed.version !== 1 ||
      (parsed.scheduledAfter !== null && typeof parsed.scheduledAfter !== "string") ||
      (parsed.feedAfter !== null && typeof parsed.feedAfter !== "string")
    ) {
      throw new Error("invalid cursor");
    }
    return {
      version: 1,
      scheduledAfter: parsed.scheduledAfter ?? null,
      feedAfter: parsed.feedAfter ?? null,
    };
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
}

function parsePublicationCollection(body: string): MetaPublicationCollectionResponse {
  let parsed: MetaPublicationCollectionResponse;
  try {
    parsed = JSON.parse(body) as MetaPublicationCollectionResponse;
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (!Array.isArray(parsed.data)) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  return parsed;
}

async function fetchPublicationCollection(args: {
  url: URL;
  platform: MetaPublicationPlatform;
  now: Date;
}): Promise<Omit<MetaPublicationCandidatePage, "scheduledCoverage">> {
  const { body, requestId } = await providerRequest(args.url.toString());
  try {
    const parsed = parsePublicationCollection(body);
    return {
      candidates: (parsed.data ?? []).flatMap((entry) => {
        if (typeof entry !== "object" || entry === null) return [];
        try {
          return [
            normalizeMetaPublication(args.platform, entry as MetaPublicationCandidateRaw, args.now),
          ];
        } catch {
          return [];
        }
      }),
      nextCursor: parsed.paging?.cursors?.after ?? null,
    };
  } catch (error) {
    if (error instanceof SocialProviderError) {
      throw new SocialProviderError(error.code, error.retryable, requestId ?? error.requestId);
    }
    throw error;
  }
}

/**
 * Fetch the first candidate page for a linked Facebook Page or Instagram
 * professional account. The returned DTO contains no access token or raw
 * provider response. Facebook uses separate feed and scheduled-post edges;
 * Instagram media is returned through the account's media edge.
 */
export async function fetchMetaPublicationCandidatesPage(
  input: FetchMetaPublicationCandidatesInput,
): Promise<MetaPublicationCandidatePage> {
  const apiVersion = resolveGraphVersion(input.apiVersion);
  const now = input.now ?? new Date();
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const accessToken =
    input.platform === "facebook"
      ? await acquirePageAccessToken(input.credentials, input.accountId, apiVersion)
      : (input.credentials.profileAccessTokens?.[input.accountId] ?? input.credentials.accessToken);

  if (input.platform === "facebook") {
    const fields = [
      "id",
      "message",
      "created_time",
      "scheduled_publish_time",
      "is_published",
      "permalink_url",
      "from{id}",
      "attachments{media_type,media_url,thumbnail_url}",
    ].join(",");
    const cursor = decodeFacebookPublicationCursor(input.after);
    const scheduledUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}/scheduled_posts`);
    scheduledUrl.searchParams.set("fields", fields);
    scheduledUrl.searchParams.set("limit", String(limit));
    scheduledUrl.searchParams.set("access_token", accessToken);
    if (cursor?.scheduledAfter) scheduledUrl.searchParams.set("after", cursor.scheduledAfter);

    const feedUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}/feed`);
    feedUrl.searchParams.set("fields", fields);
    feedUrl.searchParams.set("limit", String(limit));
    feedUrl.searchParams.set("since", String(Math.floor(input.publishedSince.getTime() / 1000)));
    feedUrl.searchParams.set("access_token", accessToken);
    if (cursor?.feedAfter) feedUrl.searchParams.set("after", cursor.feedAfter);

    const scheduledRequest =
      cursor?.scheduledAfter === null
        ? Promise.resolve({ candidates: [], nextCursor: null })
        : fetchPublicationCollection({ url: scheduledUrl, platform: "facebook", now });
    const feedRequest =
      cursor?.feedAfter === null
        ? Promise.resolve({ candidates: [], nextCursor: null })
        : fetchPublicationCollection({ url: feedUrl, platform: "facebook", now });
    const [scheduled, published] = await Promise.all([scheduledRequest, feedRequest]);
    const nextCursor =
      scheduled.nextCursor || published.nextCursor
        ? encodeFacebookPublicationCursor({
            version: 1,
            scheduledAfter: scheduled.nextCursor,
            feedAfter: published.nextCursor,
          })
        : null;
    return {
      candidates: mergeMetaPublicationCandidates([
        ...scheduled.candidates,
        ...published.candidates,
      ]),
      nextCursor,
      scheduledCoverage: "complete",
    };
  }

  const mediaUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}/media`);
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url",
  );
  mediaUrl.searchParams.set("limit", String(limit));
  mediaUrl.searchParams.set("since", String(Math.floor(input.publishedSince.getTime() / 1000)));
  mediaUrl.searchParams.set("access_token", accessToken);
  if (input.after) mediaUrl.searchParams.set("after", input.after);
  const page = await fetchPublicationCollection({ url: mediaUrl, platform: "instagram", now });
  return { ...page, scheduledCoverage: "published_only" };
}

export async function fetchMetaPublicationCandidates(
  input: FetchMetaPublicationCandidatesInput,
): Promise<MetaPublicationCandidate[]> {
  const page = await fetchMetaPublicationCandidatesPage(input);
  return page.candidates;
}

export async function fetchMetaPublicationById(input: {
  platform: MetaPublicationPlatform;
  accountId: string;
  publicationId: string;
  credentials: SocialCredentials;
  apiVersion?: string | null;
  now?: Date;
}): Promise<MetaPublicationCandidate | null> {
  const apiVersion = resolveGraphVersion(input.apiVersion);
  const accessToken =
    input.platform === "facebook"
      ? await acquirePageAccessToken(input.credentials, input.accountId, apiVersion)
      : (input.credentials.profileAccessTokens?.[input.accountId] ?? input.credentials.accessToken);
  const url = new URL(`${graphBaseUrl(apiVersion)}/${input.publicationId}`);
  url.searchParams.set(
    "fields",
    input.platform === "facebook"
      ? "id,message,created_time,scheduled_publish_time,is_published,permalink_url,from{id}"
      : "id,caption,media_type,media_product_type,permalink,timestamp,media_url,thumbnail_url,username",
  );
  url.searchParams.set("access_token", accessToken);
  const { body } = await providerRequest(url.toString());
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SocialProviderError("invalid_response", false, null);
  }
  const raw = parsed as MetaPublicationCandidateRaw;
  if (input.platform === "facebook") {
    const owner = raw.from;
    const ownerId =
      owner && typeof owner === "object" && typeof (owner as { id?: unknown }).id === "string"
        ? (owner as { id: string }).id
        : null;
    if (ownerId !== input.accountId) return null;
  } else {
    const mediaUsername = typeof raw.username === "string" ? raw.username : null;
    if (!mediaUsername) return null;
    const accountUrl = new URL(`${graphBaseUrl(apiVersion)}/${input.accountId}`);
    accountUrl.searchParams.set("fields", "id,username");
    accountUrl.searchParams.set("access_token", accessToken);
    const accountResponse = await providerRequest(accountUrl.toString());
    let account: { id?: unknown; username?: unknown };
    try {
      account = JSON.parse(accountResponse.body) as { id?: unknown; username?: unknown };
    } catch {
      throw new SocialProviderError("invalid_response", false, accountResponse.requestId);
    }
    if (
      account.id !== input.accountId ||
      typeof account.username !== "string" ||
      account.username.toLocaleLowerCase() !== mediaUsername.toLocaleLowerCase()
    ) {
      return null;
    }
  }
  try {
    return normalizeMetaPublication(input.platform, raw, input.now ?? new Date());
  } catch {
    throw new SocialProviderError("invalid_response", false, null);
  }
}
