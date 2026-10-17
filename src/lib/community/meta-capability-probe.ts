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
  /** Scopes granted on the user connection, persisted at OAuth time. */
  grantedScopes?: readonly string[];
  request?: MetaCommunityProbeRequest["request"];
};

export type MetaCommunityProbeResult = {
  operations: Record<CommunityOperation, { state: CommunityCapabilityState; detail?: string }>;
  requestIds: string[];
};

const MUTATION_UAT_DETAIL = "mutation_uat_required";

function hasAnyScope(input: MetaCommunityProbeInput, scopes: readonly string[]): boolean {
  const granted = new Set(input.grantedScopes ?? []);
  return scopes.some((scope) => granted.has(scope));
}

function missingScopeDetail(scopes: readonly string[]): string {
  return `missing_scope:${scopes.join("|")}`;
}

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

function communityScopeOperations(
  input: MetaCommunityProbeInput,
): MetaCommunityProbeResult["operations"] {
  const operations = emptyOperations();
  const commentReplyScopes =
    input.platform === "facebook"
      ? ["pages_manage_engagement"]
      : ["instagram_manage_comments", "instagram_business_manage_comments"];
  const privateMessageScopes =
    input.platform === "facebook"
      ? ["pages_messaging"]
      : ["instagram_manage_messages", "instagram_business_manage_messages"];

  if (hasAnyScope(input, commentReplyScopes)) {
    operations.reply_comments = { state: "available" };
  } else {
    operations.reply_comments = {
      state: "unavailable",
      detail: missingScopeDetail(commentReplyScopes),
    };
  }
  // Persisted OAuth scopes can be stale after a customer changes the Meta
  // app configuration or reconnects an account. Always perform the harmless
  // conversations read below and use the live provider response as the
  // source of truth for read access. The scope list still gates reply access
  // because a successful read is not evidence that a mutation is permitted.
  operations.read_private_messages = {
    state: "unknown",
    ...(!hasAnyScope(input, privateMessageScopes)
      ? { detail: missingScopeDetail(privateMessageScopes) }
      : {}),
  };
  operations.reply_private_messages = hasAnyScope(input, privateMessageScopes)
    ? { state: "unknown" }
    : { state: "unavailable", detail: missingScopeDetail(privateMessageScopes) };
  if (hasAnyScope(input, ["pages_manage_metadata"])) {
    operations.webhooks = { state: "unknown", detail: "webhooks_not_enabled" };
  }
  return operations;
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

async function probePrivateMessages(
  input: MetaCommunityProbeInput,
  request: MetaCommunityProbeRequest["request"],
  requestIds: string[],
): Promise<{ state: CommunityCapabilityState; detail?: string }> {
  const version = resolveMetaGraphVersion(input.apiVersion);
  const fields = "id,updated_time";
  const url = new URL(
    graphUrl(
      version,
      `${encodeURIComponent(input.accountId)}/conversations`,
      fields,
      input.accessToken,
    ),
  );
  if (input.platform === "facebook") url.searchParams.set("platform", "messenger");
  try {
    const result = await request(url.toString());
    if (result.requestId) requestIds.push(result.requestId);
    return hasData(result.body)
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
  const operations = communityScopeOperations(input);
  const requestIds: string[] = [];
  operations.read_comments =
    input.platform === "facebook"
      ? await probeFacebookComments(input, request, requestIds)
      : await probeInstagramComments(input, request, requestIds);

  // The comment read check is the non-mutating validation for the public
  // reply path. A reply is only surfaced as available when the connection
  // has the exact provider scope; the dispatch path still re-checks policy,
  // kill-switch, capability, and provider response immediately before send.
  if (
    operations.reply_comments.state === "available" &&
    operations.read_comments.state !== "available"
  ) {
    operations.reply_comments = { state: "unknown", detail: "comment_read_not_validated" };
  }

  const privateMessageScopes =
    input.platform === "facebook"
      ? ["pages_messaging"]
      : ["instagram_manage_messages", "instagram_business_manage_messages"];
  const privateMessageScopeGranted = hasAnyScope(input, privateMessageScopes);
  const privateMessageRead = await probePrivateMessages(input, request, requestIds);
  operations.read_private_messages = privateMessageRead;
  if (privateMessageRead.state === "available") {
    operations.reply_private_messages = privateMessageScopeGranted
      ? { state: "available" }
      : { state: "unavailable", detail: missingScopeDetail(privateMessageScopes) };
  } else if (privateMessageRead.state === "unavailable") {
    operations.reply_private_messages = privateMessageScopeGranted
      ? privateMessageRead.detail
        ? { state: "unavailable", detail: privateMessageRead.detail }
        : { state: "unavailable" }
      : { state: "unavailable", detail: missingScopeDetail(privateMessageScopes) };
  } else {
    operations.reply_private_messages = {
      state: "unknown",
      detail: "private_message_read_not_validated",
    };
  }
  operations.media_context =
    operations.read_comments.state === "available"
      ? { state: "available" }
      : { state: "unknown", detail: "media_context_not_validated" };
  operations.conversation_history =
    operations.read_private_messages.state === "available"
      ? { state: "available" }
      : { state: "unknown", detail: "conversation_history_not_validated" };
  return { operations, requestIds };
}
