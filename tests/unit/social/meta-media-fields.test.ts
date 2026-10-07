import { describe, expect, it, vi } from "vitest";
import { fetchMetaPostMediaFields } from "@/lib/social/providers/meta-media-fields";
import { SocialProviderError } from "@/lib/social/http";

function deps(body: unknown, capture?: { urls: string[] }) {
  return {
    request: vi.fn(async (url: string) => {
      capture?.urls.push(url);
      return { body: JSON.stringify(body) };
    }),
    baseUrl: (v: string) => `https://graph.facebook.com/${v}`,
  };
}

const base = {
  platform: "instagram" as const,
  accountId: "acct-1",
  publicationId: "post-1",
  accessToken: "token",
};

describe("fetchMetaPostMediaFields", () => {
  it("maps an Instagram thumbnail and caption", async () => {
    const capture = { urls: [] as string[] };
    const result = await fetchMetaPostMediaFields({
      ...base,
      deps: deps(
        { id: "post-1", thumbnail_url: "https://scontent.xx.fbcdn.net/t.jpg", caption: "hi" },
        capture,
      ),
    });
    expect(result).toEqual({
      thumbnailUrl: "https://scontent.xx.fbcdn.net/t.jpg",
      caption: "hi",
    });
    // URLSearchParams percent-encodes the commas in the field list.
    expect(decodeURIComponent(capture.urls[0]!)).toContain(
      "fields=id,caption,permalink,thumbnail_url",
    );
  });

  it("prefers the Facebook attachment thumbnail over full_picture", async () => {
    const result = await fetchMetaPostMediaFields({
      ...base,
      platform: "facebook",
      deps: deps({
        id: "post-1",
        message: "hello",
        full_picture: "https://scontent.xx.fbcdn.net/full.jpg",
        attachments: { data: [{ thumbnail_url: "https://scontent.xx.fbcdn.net/thumb.jpg" }] },
      }),
    });
    expect(result?.thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/thumb.jpg");
    expect(result?.caption).toBe("hello");
  });

  it("falls back to full_picture when the attachment has no thumbnail", async () => {
    const result = await fetchMetaPostMediaFields({
      ...base,
      platform: "facebook",
      deps: deps({
        id: "post-1",
        full_picture: "https://scontent.xx.fbcdn.net/full.jpg",
        attachments: { data: [{ media_type: "photo" }] },
      }),
    });
    expect(result?.thumbnailUrl).toBe("https://scontent.xx.fbcdn.net/full.jpg");
  });

  it("refuses a non-https image source", async () => {
    // The value becomes an <img src>; a javascript:/http: URL must never
    // reach it.
    const result = await fetchMetaPostMediaFields({
      ...base,
      deps: deps({ id: "post-1", thumbnail_url: "javascript:alert(1)" }),
    });
    expect(result?.thumbnailUrl).toBeNull();
  });

  it("treats a Graph error body as no data rather than a row", async () => {
    const result = await fetchMetaPostMediaFields({
      ...base,
      deps: deps({ error: { message: "Unsupported get request." } }),
    });
    expect(result).toBeNull();
  });

  it("throws invalid_response on unparseable JSON", async () => {
    await expect(
      fetchMetaPostMediaFields({
        ...base,
        deps: {
          request: vi.fn(async () => ({ body: "<html>" })),
          baseUrl: (v) => `https://graph.example.com/${v}`,
        },
      }),
    ).rejects.toBeInstanceOf(SocialProviderError);
  });

  it("refuses a platform it cannot fetch for", async () => {
    await expect(fetchMetaPostMediaFields({ ...base, platform: "tiktok" })).rejects.toThrow();
  });

  it("returns null thumbnail when the provider has no image", async () => {
    const result = await fetchMetaPostMediaFields({ ...base, deps: deps({ id: "post-1" }) });
    expect(result?.thumbnailUrl).toBeNull();
  });
});
