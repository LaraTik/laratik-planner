import "server-only";

import { providerRequest, SocialProviderError } from "@/lib/social/http";
import { resolveMetaGraphVersion } from "@/lib/meta/version";

type ProviderResponse = { body: string; requestId: string | null };
type MetaCommunityWriteRequest = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<ProviderResponse>;

export type MetaCommunityReplyInput = {
  platform: "facebook" | "instagram";
  commentId: string;
  body: string;
  accessToken: string;
  apiVersion?: string | null;
  request?: MetaCommunityWriteRequest;
};

export type MetaCommunityReplyResult = {
  providerMessageId: string;
  requestId: string | null;
};

export type MetaCommunityPrivateReplyInput = {
  platform: "facebook" | "instagram";
  accountId: string;
  recipientId: string;
  body: string;
  accessToken: string;
  apiVersion?: string | null;
  request?: MetaCommunityWriteRequest;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function parseReplyId(body: string): string | null {
  try {
    const parsed = asRecord(JSON.parse(body));
    const id = parsed?.id ?? parsed?.message_id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Send one public reply through the exact Meta edge for the connected
 * platform. The caller owns authorization, capability, idempotency, and
 * persistence; this module only performs the provider operation.
 */
export async function replyToMetaComment(
  input: MetaCommunityReplyInput,
): Promise<MetaCommunityReplyResult> {
  const version = resolveMetaGraphVersion(input.apiVersion);
  const edge = input.platform === "instagram" ? "replies" : "comments";
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.commentId)}/${edge}`,
  );
  url.searchParams.set("access_token", input.accessToken);
  const request = input.request ?? providerRequest;
  const result = await request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: input.body }),
  });
  const providerMessageId = parseReplyId(result.body);
  if (!providerMessageId)
    throw new SocialProviderError("invalid_response", false, result.requestId);
  return { providerMessageId, requestId: result.requestId };
}

/**
 * Send one private reply using the platform-specific Meta messaging edge.
 * Facebook Messenger uses the Page /messages edge; Instagram messaging uses
 * the Professional Account /messages edge with the same recipient shape.
 */
export async function replyToMetaPrivateMessage(
  input: MetaCommunityPrivateReplyInput,
): Promise<MetaCommunityReplyResult> {
  const version = resolveMetaGraphVersion(input.apiVersion);
  const url = new URL(
    `https://graph.facebook.com/${version}/${encodeURIComponent(input.accountId)}/messages`,
  );
  url.searchParams.set("access_token", input.accessToken);
  const request = input.request ?? providerRequest;
  const result = await request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      recipient: { id: input.recipientId },
      ...(input.platform === "facebook" ? { messaging_type: "RESPONSE" } : {}),
      message: { text: input.body },
    }),
  });
  const providerMessageId = parseReplyId(result.body);
  if (!providerMessageId)
    throw new SocialProviderError("invalid_response", false, result.requestId);
  return { providerMessageId, requestId: result.requestId };
}
