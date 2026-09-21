import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GoogleDriveHtmlAdapter } from "@/lib/media/folder-sources/drive-html";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/drive-folder-html");
const readFixture = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf8");

const publicDns = () => vi.fn(async () => [{ address: "142.250.190.78", family: 4 }]) as never;

describe("GoogleDriveHtmlAdapter", () => {
  it("returns a populated listing from a public folder HTML fixture", async () => {
    const html = readFixture("public-folder.html");
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://drive.google.com/drive/folders/")) {
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url.startsWith("https://drive.usercontent.google.com/download")) {
        return new Response(null, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({
      folderUrl: "https://drive.google.com/drive/folders/1JWqxiknoZdX3eHs-NukvcD7cj9uonSZc",
    });

    if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
    expect(result.provider).toBe("google_drive");
    expect(result.folderId).toBe("1JWqxiknoZdX3eHs-NukvcD7cj9uonSZc");
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((i) => i.status === "importable")).toBe(true);
    expect(result.warnings).toContain("subfolders_skipped");
    expect(result.warnings).toContain("native_apps_skipped");
    expect(result.warnings).toContain("shortcuts_skipped");
  });

  it("returns provider_connection_required when Drive returns 401/403", async () => {
    const fetcher = vi.fn(async () => new Response("auth wall", { status: 403 }));
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({
      folderUrl: "https://drive.google.com/drive/folders/abc",
    });
    expect(result).toMatchObject({ ok: false, code: "provider_connection_required" });
  });

  it("returns not_found when Drive returns 404", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 404 }));
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({
      folderUrl: "https://drive.google.com/drive/folders/abc",
    });
    expect(result).toMatchObject({ ok: false, code: "not_found" });
  });

  it("returns empty when the folder HTML has no entries", async () => {
    const fetcher = vi.fn(
      async () => new Response(readFixture("empty-folder.html"), { status: 200 }),
    );
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({
      folderUrl: "https://drive.google.com/drive/folders/abc",
    });
    expect(result).toMatchObject({ ok: false, code: "empty" });
  });

  it("rejects non-Drive folder URLs with invalid_url", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({ folderUrl: "https://example.com/folder" });
    expect(result).toMatchObject({ ok: false, code: "invalid_url" });
  });

  it("rejects HTTP (non-HTTPS) folder URLs with invalid_url", async () => {
    const fetcher = vi.fn(async () => new Response("", { status: 200 }));
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({
      folderUrl: "http://drive.google.com/drive/folders/abc",
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_url" });
  });

  it("marks per-row as provider_connection_required when the preflight HEAD 401s", async () => {
    const html = readFixture("public-folder.html");
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://drive.google.com/drive/folders/")) {
        return new Response(html, { status: 200 });
      }
      // All preflights 403 → every importable item becomes connection-required.
      return new Response(null, { status: 403 });
    });
    const adapter = new GoogleDriveHtmlAdapter({ fetchImpl: fetcher, dnsLookup: publicDns() });
    const result = await adapter.inspect({
      folderUrl: "https://drive.google.com/drive/folders/abc",
    });
    if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`);
    expect(result.items.every((i) => i.status === "provider_connection_required")).toBe(true);
  });
});
