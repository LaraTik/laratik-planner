import { describe, expect, it, vi } from "vitest";
import { fetchPublicMedia } from "@/lib/media/source";

function publicDns() {
  return vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) as never;
}

describe("media source import", () => {
  it("opens a public HTTPS media response with a bounded size", async () => {
    const response = new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "8" },
      },
    );
    const result = await fetchPublicMedia({
      url: "https://cdn.example.test/campaign/hero.png?download=1",
      fetchImpl: vi.fn(async () => response),
      dnsLookup: publicDns(),
    });
    expect(result.kind).toBe("image");
    expect(result.provider).toBe("external_url");
    expect(result.byteSize).toBe(8);
    expect(result.extension).toBe("png");
    const body = await result.response.arrayBuffer();
    expect(body.byteLength).toBe(8);
  });

  it("revalidates redirects and rejects private destinations", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://127.0.0.1/file.png" } }),
      );
    await expect(
      fetchPublicMedia({
        url: "https://cdn.example.test/file.png",
        fetchImpl: fetcher,
        dnsLookup: publicDns(),
      }),
    ).rejects.toMatchObject({ code: "unsafe_host" });
  });

  it("imports publicly downloadable provider links and guides private links", async () => {
    const publicResponse = new Response(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "8" },
      },
    );
    let fetchedUrl = "";
    const publicFetcher = vi.fn(async (url: RequestInfo | URL) => {
      fetchedUrl = String(url);
      return publicResponse;
    });
    const publicResult = await fetchPublicMedia({
      url: "https://drive.google.com/file/d/public-id/view",
      fetchImpl: publicFetcher,
      dnsLookup: publicDns(),
    });
    expect(publicResult.kind).toBe("image");
    expect(publicResult.provider).toBe("google_drive");
    expect(fetchedUrl).toContain("drive.usercontent.google.com");

    await expect(
      fetchPublicMedia({
        url: "https://drive.google.com/file/d/abc/view",
        fetchImpl: vi.fn(
          async () =>
            new Response("<html>sign in</html>", {
              status: 200,
              headers: { "content-type": "text/html", "content-length": "20" },
            }),
        ),
        dnsLookup: publicDns(),
      }),
    ).rejects.toMatchObject({ code: "provider_connection_required" });
    await expect(
      fetchPublicMedia({
        url: "https://tenant.sharepoint.com/:v:/r/file",
        fetchImpl: vi.fn(async () => new Response(null, { status: 403 })),
        dnsLookup: publicDns(),
      }),
    ).rejects.toMatchObject({ code: "provider_connection_required" });
  });
});
