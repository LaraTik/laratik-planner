import { describe, expect, it } from "vitest";
import {
  probeMetaCommunityCapabilities,
  type MetaCommunityProbeRequest,
} from "@/lib/community/meta-capability-probe";
import { missingCapabilityScopes } from "@/lib/community/capabilities";

function response(
  body: unknown,
): MetaCommunityProbeRequest["request"] extends (...args: never[]) => infer R ? R : never {
  return Promise.resolve({
    body: JSON.stringify(body),
    requestId: "request-1",
  });
}

describe("Meta community capability probe", () => {
  it("extracts the exact missing Meta permissions for actionable UI copy", () => {
    expect(missingCapabilityScopes("missing_scope:pages_messaging")).toEqual(["pages_messaging"]);
    expect(
      missingCapabilityScopes(
        "missing_scope:instagram_manage_messages|instagram_business_manage_messages",
      ),
    ).toEqual(["instagram_manage_messages", "instagram_business_manage_messages"]);
    expect(missingCapabilityScopes("permission_denied")).toEqual([]);
  });

  it("validates Facebook comment reads without dispatching a mutation", async () => {
    const calls: URL[] = [];
    const result = await probeMetaCommunityCapabilities({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      apiVersion: "v26.0",
      request: async (url) => {
        calls.push(new URL(url));
        return response({
          data: [
            {
              id: "post-1",
              comments: { data: [{ id: "comment-1", message: "hello" }] },
            },
          ],
        });
      },
    });

    expect(result.operations.read_comments).toEqual({ state: "available" });
    expect(result.operations.reply_comments).toEqual({
      state: "unavailable",
      detail: "missing_scope:pages_manage_engagement",
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.pathname).toBe("/v26.0/page-1/feed");
    expect(calls[1]?.pathname).toBe("/v26.0/page-1/conversations");
    expect(calls[0]?.searchParams.get("access_token")).toBe("secret-token");
  });

  it("validates Instagram comment reads through media then comments", async () => {
    const paths: string[] = [];
    const result = await probeMetaCommunityCapabilities({
      platform: "instagram",
      accountId: "ig-1",
      accessToken: "secret-token",
      apiVersion: "v26.0",
      request: async (url) => {
        const parsed = new URL(url);
        paths.push(parsed.pathname);
        if (parsed.pathname.endsWith("/media")) {
          return response({ data: [{ id: "media-1" }] });
        }
        return response({ data: [{ id: "comment-1", text: "hello" }] });
      },
    });

    expect(result.operations.read_comments).toEqual({ state: "available" });
    expect(paths).toEqual([
      "/v26.0/ig-1/media",
      "/v26.0/media-1/comments",
      "/v26.0/ig-1/conversations",
    ]);
  });

  it("records permission failures as unavailable", async () => {
    const result = await probeMetaCommunityCapabilities({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      request: async () => {
        const error = new Error("permission denied") as Error & { code?: string };
        error.code = "permission_denied";
        throw error;
      },
    });

    expect(result.operations.read_comments).toEqual({
      state: "unavailable",
      detail: "permission_denied",
    });
  });

  it("checks private-message access live even when persisted scopes may be stale", async () => {
    const paths: string[] = [];
    const result = await probeMetaCommunityCapabilities({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      grantedScopes: ["pages_manage_engagement", "pages_messaging"],
      request: async (url) => {
        const parsed = new URL(url);
        paths.push(parsed.pathname);
        if (parsed.pathname.endsWith("/feed")) {
          return response({ data: [{ id: "post-1", comments: { data: [] } }] });
        }
        return response({ data: [] });
      },
    });

    expect(result.operations.reply_comments).toEqual({ state: "available" });
    expect(result.operations.read_private_messages).toEqual({ state: "available" });
    expect(result.operations.reply_private_messages).toEqual({ state: "available" });
    expect(result.operations.media_context).toEqual({ state: "available" });
    expect(result.operations.conversation_history).toEqual({ state: "available" });
    expect(paths).toEqual(["/v26.0/page-1/feed", "/v26.0/page-1/conversations"]);
  });

  it("keeps private replies gated when a live read succeeds without the required scope", async () => {
    const result = await probeMetaCommunityCapabilities({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      request: async (url) => {
        const parsed = new URL(url);
        return parsed.pathname.endsWith("/feed")
          ? response({ data: [{ id: "post-1", comments: { data: [] } }] })
          : response({ data: [] });
      },
    });

    expect(result.operations.read_private_messages).toEqual({ state: "available" });
    expect(result.operations.reply_private_messages).toEqual({
      state: "unavailable",
      detail: "missing_scope:pages_messaging",
    });
  });
});
