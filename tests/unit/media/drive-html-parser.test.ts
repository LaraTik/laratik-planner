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
    expect(warnings).toContain("no_entries_found");
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

  it('parses the modern Drive HTML shape ([null,"<id>"], null, null, null, "<mime>") and merges markup names', () => {
    const html = readFixture("modern-folder.html");
    const { items, warnings } = parseDriveFolderHtml(html);

    // Modern fixture has 4 importable files: 1-1.png, 2-1.png, 3-1.mp4, 4-1.pdf
    // The mime for each is sourced from AF_initDataCallback; the name from
    // the data-id + aria-label scrape.
    expect(items.map((i) => i.name).sort()).toEqual(["1-1.png", "2-1.png", "3-1.mp4", "4-1.pdf"]);

    const byId = new Map(items.map((i) => [i.id, i]));
    // Mime types come from the modern AF block, not the filename fallback.
    expect(byId.get("1EX3YWNgXEs9UHAfE8uACdYfdJlRZQwGb")?.mimeType).toBe("image/png");
    expect(byId.get("1dDiio5t_5Q2x1Zz-My9r31ovTfxRHZS6")?.mimeType).toBe("image/png");
    expect(byId.get("1AcZYycV8J6wWHBhelQQdz3y9d4mEwjrw")?.mimeType).toBe("video/mp4");
    expect(byId.get("1H-4vAL4EqQqGuuq8CoWjStYRe_rdNSx3")?.mimeType).toBe("application/pdf");
    expect(items.every((i) => i.status === "importable")).toBe(true);
    // No Drive-native types, no shortcuts, no folders → no skip warnings.
    expect(warnings).not.toContain("native_apps_skipped");
    expect(warnings).not.toContain("subfolders_skipped");
    expect(warnings).not.toContain("shortcuts_skipped");
  });

  it("falls back to filename-extension mime when listing mime is octet-stream", () => {
    // Simulate the markup-only path with a Drive HTML that lists the
    // file as application/octet-stream (a common Drive quirk for files
    // uploaded via the mobile app or renamed away from their extension).
    const html = `
      <script>
        AF_initDataCallback({key: 'ds:0', data: [], sideChannel: {}});
      </script>
      <div class="folder-content">
        <div data-id="3AAAAAAAAAAAAAAAAAAAA1" role="row">
          <span aria-label="holiday.png"></span>
        </div>
        <div data-id="3AAAAAAAAAAAAAAAAAAAA2" role="row">
          <span aria-label="launch.mp4"></span>
        </div>
        <div data-id="3AAAAAAAAAAAAAAAAAAAA3" role="row">
          <span aria-label="brief.pdf"></span>
        </div>
        <div data-id="3AAAAAAAAAAAAAAAAAAAA4" role="row">
          <span aria-label="notes.txt"></span>
        </div>
        <div data-id="3AAAAAAAAAAAAAAAAAAAA5" role="row">
          <span aria-label="archive.bin"></span>
        </div>
      </div>
    `;
    const { items } = parseDriveFolderHtml(html);
    const byName = new Map(items.map((i) => [i.name, i]));
    expect(byName.get("holiday.png")?.mimeType).toBe("image/png");
    expect(byName.get("launch.mp4")?.mimeType).toBe("video/mp4");
    expect(byName.get("brief.pdf")?.mimeType).toBe("application/pdf");
    expect(byName.get("notes.txt")?.mimeType).toBe("text/plain");
    // .bin has no MIME mapping — listing mime stays at the default.
    expect(byName.get("archive.bin")?.mimeType).toBe("application/octet-stream");
  });

  it("parses size from aria-label (European + US number formats)", () => {
    const html = `
      <div class="folder-content">
        <div data-id="4AAAAAAAAAAAAAAAAAAAA1" role="row">
          <div aria-label="big.png">
            <span aria-label="Size: 2,2 MB&#10;Storage used: 2,2 MB">2,2 MB</span>
          </div>
        </div>
        <div data-id="4AAAAAAAAAAAAAAAAAAAA2" role="row">
          <div aria-label="small.png">
            <span aria-label="Size: 86 KB&#10;Storage used: 86 KB">86 KB</span>
          </div>
        </div>
        <div data-id="4AAAAAAAAAAAAAAAAAAAA3" role="row">
          <div aria-label="tiny.png">
            <span aria-label="Size: 512 B&#10;Storage used: 512 B">512 B</span>
          </div>
        </div>
      </div>
    `;
    const { items } = parseDriveFolderHtml(html);
    const byName = new Map(items.map((i) => [i.name, i]));
    // 2,2 MB (European) → ~2.3 MB
    expect(byName.get("big.png")?.sizeBytes).toBe(Math.round(2.2 * 1024 * 1024));
    // 86 KB
    expect(byName.get("small.png")?.sizeBytes).toBe(86 * 1024);
    // 512 B
    expect(byName.get("tiny.png")?.sizeBytes).toBe(512);
  });

  it("keeps legacy AF rows working alongside the modern shape", () => {
    // A mixed-age Drive HTML where one file ships in legacy format and
    // another in the modern shape. Both should resolve.
    const html = `
      <script>
        AF_initDataCallback({key: 'ds:0', data: [], sideChannel: {}});
        AF_initDataCallback({
          key: 'ds:4',
          data: [
            ["5AAAAAAAAAAAAAAAAAAA1", "legacy-1.png", "image/png", 12345, "hash"],
            [null, "5AAAAAAAAAAAAAAAAAAA2"],
            null,
            null,
            null,
            "video/mp4",
            null,
            null,
            null,
            null,
            null,
            1,
          ],
          sideChannel: {},
        });
      </script>
      <div class="folder-content">
        <div data-id="5AAAAAAAAAAAAAAAAAAA1" role="row">
          <span aria-label="legacy-1.png"></span>
        </div>
        <div data-id="5AAAAAAAAAAAAAAAAAAA2" role="row">
          <span aria-label="modern-1.mp4"></span>
        </div>
      </div>
    `;
    const { items } = parseDriveFolderHtml(html);
    const byName = new Map(items.map((i) => [i.name, i]));
    expect(byName.get("legacy-1.png")?.mimeType).toBe("image/png");
    expect(byName.get("modern-1.mp4")?.mimeType).toBe("video/mp4");
  });
});
