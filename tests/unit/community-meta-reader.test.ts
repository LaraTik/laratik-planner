import { describe, expect, it } from "vitest";
import {
  readMetaCommunityComments,
  readMetaCommunityPrivateMessages,
} from "@/lib/community/meta-community-reader";

function response(body: unknown) {
  return Promise.resolve({ body: JSON.stringify(body), requestId: "request-1" });
}

describe("Meta community comment reader", () => {
  it("normalizes Facebook root comments with their post and parent context", async () => {
    const calls: URL[] = [];
    const result = await readMetaCommunityComments({
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
              comments: {
                data: [
                  {
                    id: "comment-1",
                    message: "Hello",
                    from: { id: "person-1", name: "A person" },
                    created_time: "2026-10-16T10:00:00+0000",
                  },
                ],
              },
            },
          ],
        });
      },
    });

    expect(result.comments).toEqual([
      {
        externalMessageId: "comment-1",
        externalRootId: "comment-1",
        externalPostId: "post-1",
        body: "Hello",
        authorName: "A person",
        authorExternalId: "person-1",
        externalParentId: null,
        postedAt: new Date("2026-10-16T10:00:00+0000"),
        metadata: { platform: "facebook" },
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.pathname).toBe("/v26.0/page-1/feed");
    expect(calls[0]?.searchParams.get("access_token")).toBe("secret-token");
  });

  it("reads bounded Instagram media pages and comment pages", async () => {
    const paths: string[] = [];
    const result = await readMetaCommunityComments({
      platform: "instagram",
      accountId: "ig-1",
      accessToken: "secret-token",
      request: async (url) => {
        const parsed = new URL(url);
        paths.push(parsed.pathname);
        if (parsed.pathname.endsWith("/media")) {
          return response({ data: [{ id: "media-1" }, { id: "media-2" }] });
        }
        const mediaId = parsed.pathname.split("/").at(-2);
        return response({
          data: [
            {
              id: `comment-${mediaId}`,
              text: "A comment",
              from: { id: "person-2", username: "someone" },
              timestamp: "2026-10-16T11:00:00+0000",
            },
          ],
        });
      },
    });

    expect(result.comments).toHaveLength(2);
    expect(result.comments.map((comment) => comment.externalPostId)).toEqual([
      "media-1",
      "media-2",
    ]);
    expect(paths).toEqual([
      "/v26.0/ig-1/media",
      "/v26.0/media-1/comments",
      "/v26.0/media-2/comments",
    ]);
  });

  it("ignores provider rows without a stable id or body", async () => {
    const result = await readMetaCommunityComments({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      request: async () =>
        response({
          data: [
            {
              id: "post-1",
              comments: {
                data: [
                  { id: "missing-body" },
                  { message: "missing-id" },
                  { id: "valid", message: "Valid", created_time: "2026-10-16T10:00:00+0000" },
                ],
              },
            },
          ],
        }),
    });

    expect(result.comments.map((comment) => comment.externalMessageId)).toEqual(["valid"]);
  });

  it("uses the sync cursor as an inclusive catch-up boundary", async () => {
    const result = await readMetaCommunityComments({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      since: new Date("2026-10-16T10:00:00.000Z"),
      request: async () =>
        response({
          data: [
            {
              id: "post-1",
              comments: {
                data: [
                  { id: "before", message: "Before", created_time: "2026-10-16T09:59:59Z" },
                  { id: "boundary", message: "Boundary", created_time: "2026-10-16T10:00:00Z" },
                  { id: "after", message: "After", created_time: "2026-10-16T10:00:01Z" },
                ],
              },
            },
          ],
        }),
    });

    expect(result.comments.map((comment) => comment.externalMessageId)).toEqual([
      "boundary",
      "after",
    ]);
  });

  it("normalizes bounded private-message history and preserves the participant id", async () => {
    const result = await readMetaCommunityPrivateMessages({
      platform: "facebook",
      accountId: "page-1",
      accessToken: "secret-token",
      request: async (url) => {
        const parsed = new URL(url);
        expect(parsed.pathname).toBe("/v26.0/page-1/conversations");
        expect(parsed.searchParams.get("platform")).toBe("messenger");
        return {
          requestId: "request-2",
          body: JSON.stringify({
            data: [
              {
                id: "conversation-1",
                participants: { data: [{ id: "page-1" }, { id: "person-1" }] },
                messages: {
                  data: [
                    {
                      id: "message-1",
                      message: "Hello",
                      from: { id: "person-1", name: "Person" },
                      created_time: "2026-10-16T10:00:00.000Z",
                    },
                    {
                      id: "message-2",
                      message: "Welcome",
                      from: { id: "page-1", name: "Page" },
                      created_time: "2026-10-16T10:01:00.000Z",
                    },
                  ],
                },
              },
            ],
          }),
        };
      },
    });

    expect(result.requestIds).toEqual(["request-2"]);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toMatchObject({
      externalConversationId: "conversation-1",
      authorExternalId: "person-1",
      metadata: { platform: "facebook", participantExternalId: "person-1" },
    });
    expect(result.messages[1]?.authorExternalId).toBe("page-1");
  });
});
