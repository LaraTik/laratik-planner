import "server-only";
import { providerRequest } from "@/lib/social/http";
import { resolveMetaGraphVersion } from "@/lib/meta/version";

const MAX_MEDIA_PER_SYNC = 10;
const PAGE_SIZE = 25;

type ProviderResponse = { body: string; requestId: string | null };

export type MetaCommunityReadRequest = (url: string) => Promise<ProviderResponse>;

export type MetaCommunityComment = {
  externalMessageId: string;
  externalRootId: string;
  externalPostId: string;
  body: string;
  authorName: string | null;
  authorExternalId: string | null;
  externalParentId: string | null;
  postedAt: Date;
  metadata: { platform: "facebook" | "instagram" };
};

export type MetaCommunityReadInput = {
  platform: "facebook" | "instagram";
  accountId: string;
  accessToken: string;
  apiVersion?: string | null;
  request?: MetaCommunityReadRequest;
};

export type MetaCommunityReadResult = {
  comments: MetaCommunityComment[];
  requestIds: string[];
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseBody(body: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(body);
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function graphUrl(version: string, path: string, fields: string, token: string): string {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("access_token", token);
  return url.toString();
}

function commentFromProvider(
  value: unknown,
  postId: string,
  platform: "facebook" | "instagram",
): MetaCommunityComment | null {
  const row = asRecord(value);
  if (!row) return null;
  const externalMessageId = asString(row.id);
  const body = asString(row.message) ?? asString(row.text);
  const postedAt = parseDate(row.created_time) ?? parseDate(row.timestamp);
  if (!externalMessageId || !body || !postedAt) return null;

  const author = asRecord(row.from);
  const authorExternalId = asString(author?.id);
  const authorName = asString(author?.name) ?? asString(author?.username);
  const parent = asRecord(row.parent);
  const externalParentId = asString(parent?.id);
  const externalRootId =
    externalParentId && externalParentId !== postId ? externalParentId : externalMessageId;

  return {
    externalMessageId,
    externalRootId,
    externalPostId: postId,
    body,
    authorName,
    authorExternalId,
    externalParentId,
    postedAt,
    metadata: { platform },
  };
}

function dataRows(body: string): unknown[] {
  const data = parseBody(body).data;
  return Array.isArray(data) ? data : [];
}

async function readFacebookComments(
  input: MetaCommunityReadInput,
  request: MetaCommunityReadRequest,
  version: string,
  requestIds: string[],
): Promise<MetaCommunityComment[]> {
  const result = await request(
    graphUrl(
      version,
      `${encodeURIComponent(input.accountId)}/feed`,
      "id,comments.limit(25){id,message,from,created_time,parent}",
      input.accessToken,
    ),
  );
  if (result.requestId) requestIds.push(result.requestId);

  const comments: MetaCommunityComment[] = [];
  for (const postValue of dataRows(result.body)) {
    const post = asRecord(postValue);
    const postId = asString(post?.id);
    const nested = asRecord(post?.comments);
    if (!postId || !nested) continue;
    for (const commentValue of Array.isArray(nested.data) ? nested.data : []) {
      const comment = commentFromProvider(commentValue, postId, "facebook");
      if (comment) comments.push(comment);
    }
  }
  return comments;
}

async function readInstagramComments(
  input: MetaCommunityReadInput,
  request: MetaCommunityReadRequest,
  version: string,
  requestIds: string[],
): Promise<MetaCommunityComment[]> {
  const mediaResult = await request(
    graphUrl(version, `${encodeURIComponent(input.accountId)}/media`, "id", input.accessToken),
  );
  if (mediaResult.requestId) requestIds.push(mediaResult.requestId);

  const comments: MetaCommunityComment[] = [];
  for (const mediaValue of dataRows(mediaResult.body).slice(0, MAX_MEDIA_PER_SYNC)) {
    const mediaId = asString(asRecord(mediaValue)?.id);
    if (!mediaId) continue;
    const commentsResult = await request(
      graphUrl(
        version,
        `${encodeURIComponent(mediaId)}/comments`,
        "id,text,from,timestamp,parent",
        input.accessToken,
      ),
    );
    if (commentsResult.requestId) requestIds.push(commentsResult.requestId);
    for (const commentValue of dataRows(commentsResult.body)) {
      const comment = commentFromProvider(commentValue, mediaId, "instagram");
      if (comment) comments.push(comment);
    }
  }
  return comments;
}

export async function readMetaCommunityComments(
  input: MetaCommunityReadInput,
): Promise<MetaCommunityReadResult> {
  const request = input.request ?? providerRequest;
  const version = resolveMetaGraphVersion(input.apiVersion);
  const requestIds: string[] = [];
  const comments =
    input.platform === "facebook"
      ? await readFacebookComments(input, request, version, requestIds)
      : await readInstagramComments(input, request, version, requestIds);

  return { comments, requestIds };
}
