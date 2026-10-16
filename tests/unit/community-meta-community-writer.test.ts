import { describe, expect, it } from "vitest";
import {
  replyToMetaComment,
  replyToMetaPrivateMessage,
} from "@/lib/community/meta-community-writer";

describe("Meta community writer", () => {
  it("replies to a Facebook comment using the comments edge", async () => {
    let calledUrl = "";
    let calledInit: { method: "POST"; headers: Record<string, string>; body: string } | null = null;
    const result = await replyToMetaComment({
      platform: "facebook",
      commentId: "comment-1",
      body: "Thanks for your comment",
      accessToken: "secret-token",
      apiVersion: "v26.0",
      request: async (url, init) => {
        calledUrl = url;
        calledInit = init;
        return { body: JSON.stringify({ id: "reply-1" }), requestId: "request-1" };
      },
    });

    expect(new URL(calledUrl).pathname).toBe("/v26.0/comment-1/comments");
    expect(new URL(calledUrl).searchParams.get("access_token")).toBe("secret-token");
    expect(calledInit).toEqual({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Thanks for your comment" }),
    });
    expect(result).toEqual({ providerMessageId: "reply-1", requestId: "request-1" });
  });

  it("uses the Instagram replies edge", async () => {
    let calledUrl = "";
    const result = await replyToMetaComment({
      platform: "instagram",
      commentId: "comment-1",
      body: "Thanks",
      accessToken: "secret-token",
      request: async (url) => {
        calledUrl = url;
        return { body: JSON.stringify({ id: "reply-2" }), requestId: null };
      },
    });

    expect(new URL(calledUrl).pathname).toBe("/v26.0/comment-1/replies");
    expect(result.providerMessageId).toBe("reply-2");
  });

  it("uses the platform messaging edge for private replies", async () => {
    let calledUrl = "";
    let calledBody = "";
    const result = await replyToMetaPrivateMessage({
      platform: "facebook",
      accountId: "page-1",
      recipientId: "person-1",
      body: "How can we help?",
      accessToken: "secret-token",
      request: async (url, init) => {
        calledUrl = url;
        calledBody = init.body;
        return { body: JSON.stringify({ message_id: "message-1" }), requestId: "request-3" };
      },
    });

    expect(new URL(calledUrl).pathname).toBe("/v26.0/page-1/messages");
    expect(JSON.parse(calledBody)).toEqual({
      recipient: { id: "person-1" },
      messaging_type: "RESPONSE",
      message: { text: "How can we help?" },
    });
    expect(result).toEqual({ providerMessageId: "message-1", requestId: "request-3" });
  });
});
