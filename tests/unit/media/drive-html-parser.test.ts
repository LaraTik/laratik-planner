import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDriveFolderHtml } from "@/lib/media/folder-sources/drive-html-parser";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/drive-folder-html");
const readFixture = (name: string) => readFileSync(join(FIXTURE_DIR, name), "utf8");

describe("parseDriveFolderHtml", () => {
  it("parses a public folder fixture and filters Drive-native / shortcut / folder entries", () => {
    const html = readFixture("public-folder.html");
    const { items, warnings } = parseDriveFolderHtml(html);

    // brand-hero.png, final-cut.mp4, spring-brief.docx, poster-v2.png
    // dropped: campaign-deck (Drive native), old-link.shortcut, 2026-photos (folder)
    expect(items.map((i) => i.name).sort()).toEqual([
      "brand-hero.png",
      "final-cut.mp4",
      "poster-v2.png",
      "spring-brief.docx",
    ]);
    expect(items.every((i) => i.status === "importable")).toBe(true);
    expect(items.every((i) => i.sourceUrl.includes(i.id))).toBe(true);
    expect(items.every((i) => i.thumbnailUrl?.includes(i.id))).toBe(true);
    expect(items[0]!.thumbnailUrl).toMatch(/^https:\/\/drive\.google\.com\/thumbnail\?id=/);

    expect(warnings).toContain("subfolders_skipped");
    expect(warnings).toContain("native_apps_skipped");
    expect(warnings).toContain("shortcuts_skipped");
  });

  it("returns an empty list with no_entries_found when the folder is empty", () => {
    const html = readFixture("empty-folder.html");
    const { items, warnings } = parseDriveFolderHtml(html);
    expect(items).toEqual([]);
    expect(warnings).toEqual(["no_entries_found"]);
  });

  it("falls back to data-id + aria-label when AF_initDataCallback is absent", () => {
    const html = readFixture("markup-only.html");
    const { items } = parseDriveFolderHtml(html);
    expect(items.map((i) => i.name)).toEqual(["Aerial shot.jpg", "Backup.mp4", "Notes.txt"]);
    // mimeType is unknown here; wizard shows it as importable and the
    // per-item preflight is the gate that decides.
    expect(items.every((i) => i.status === "importable")).toBe(true);
  });

  it("tolerates embedded <script>, HTML comments, and tracker script tags", () => {
    const html = readFixture("hostile.html");
    const { items } = parseDriveFolderHtml(html);
    expect(items.map((i) => i.name)).toEqual(["hello.png"]);
  });

  it("returns entries sorted case-insensitively by name", () => {
    const html = readFixture("public-folder.html");
    const { items } = parseDriveFolderHtml(html);
    const names = items.map((i) => i.name);
    const sorted = [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    expect(names).toEqual(sorted);
  });
});
