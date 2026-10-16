import "server-only";
import { providerRequest, SocialProviderError } from "@/lib/social/http";
import { resolveMetaGraphVersion } from "@/lib/meta/version";
import type { CommunityCapabilityState, CommunityOperation } from "./capabilities";

type ProbeResponse = { body: string; requestId: string | null };

export type MetaCommunityProbeRequest = {
  request: (url: string) => Promise<ProbeResponse>;
};

export type MetaCommunityProbeInput = {
  platform: "facebook" | "instagram";
  accountId: string;
  accessToken: string;
  apiVersion?: string | null;
  request?: MetaCommunityProbeRequest["request"];
};

export type MetaCommunityProbeResult = {
  operations: Record<CommunityOperation, { state: CommunityCapabilityState; detail?: string }>;
  requestIds: string[];
};

const MUTATION_UAT_DETAIL = "mutation_uat_required";

function emptyOperations(): MetaCommunityProbeResult["operations"] {
  return {
    read_comments: { state: "unknown" },
    reply_comments: { state: "unavailable", detail: MUTATION_UAT_DETAIL },
    read_private_messages: { state: "unknown", detail: "read_not_implemented" },
    reply_private_messages: { state: "unavailable", detail: MUTATION_UAT_DETAIL },
    webhooks: { state: "unavailable", detail: "webhooks_not_enabled" },
    media_context: { state: "unknown", detail: "media_context_not_implemented" },
    conversation_history: { state: "unknown", detail: "conversation_history_not_implemented" },
  };
}

function detailForError(error: unknown): string {
  if (error instanceof SocialProviderError) return error.code;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return "probe_failed";
}

function hasData(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { data?: unknown };
    return Array.isArray(parsed.data);
  } catch {
    return false;
  }
}

function firstId(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { data?: unknown };
    if (!Array.isArray(parsed.data)) return null;
    const first = parsed.data[0];
    if (!first || typeof first !== "object") return null;
    const id = (first as { id?: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function graphUrl(version: string, path: string, fields: string, token: string): string {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);
  return url.toString();
}

async function probeFacebookComments(
  input: MetaCommunityProbeInput,
  request: MetaCommunityProbeRequest["request"],
  requestIds: string[],
): Promise<{ state: CommunityCapabilityState; detail?: string }> {
  const version = resolveMetaGraphVersion(input.apiVersion);
  const url = graphUrl(
    version,
    `${encodeURIComponent(input.accountId)}/feed`,
    "id,comments.limit(1){id,message,from,created_time}",
    input.accessToken,
  );
  try {
    const result = await request(url);
    if (result.requestId) requestIds.push(result.requestId);
    return hasData(result.body)
      ? { state: "available" }
      : { state: "unavailable", detail: "invalid_response" };
  } catch (error) {
    return { state: "unavailable", detail: detailForError(error) };
  }
}

async function probeInstagramComments(
  input: MetaCommunityProbeInput,
  request: MetaCommunityProbeRequest["request"],
  requestIds: string[],
): Promise<{ state: CommunityCapabilityState; detail?: string }> {
  const version = resolveMetaGraphVersion(input.apiVersion);
  try {
    const mediaResult = await request(
      graphUrl(version, `${encodeURIComponent(input.accountId)}/media`, "id", input.accessToken),
    );
    if (mediaResult.requestId) requestIds.push(mediaResult.requestId);
    const mediaId = firstId(mediaResult.body);
    if (!mediaId) {
      return hasData(mediaResult.body)
        ? { state: "unknown", detail: "no_media_to_validate" }
        : { state: "unavailable", detail: "invalid_response" };
    }
    const commentsResult = await request(
      graphUrl(
        version,
        `${encodeURIComponent(mediaId)}/comments`,
        "id,text,from,timestamp",
        input.accessToken,
      ),
    );
    if (commentsResult.requestId) requestIds.push(commentsResult.requestId);
    return hasData(commentsResult.body)
      ? { state: "available" }
      : { state: "unavailable", detail: "invalid_response" };
  } catch (error) {
    return { state: "unavailable", detail: detailForError(error) };
  }
}

export async function probeMetaCommunityCapabilities(
  input: MetaCommunityProbeInput,
): Promise<MetaCommunityProbeResult> {
  const request = input.request ?? providerRequest;
  const operations = emptyOperations();
  const requestIds: string[] = [];
  operations.read_comments =
    input.platform === "facebook"
      ? await probeFacebookComments(input, request, requestIds)
      : await probeInstagramComments(input, request, requestIds);
  return { operations, requestIds };
}
