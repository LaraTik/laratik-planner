import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  generatePreviewBuffer,
  PreviewGenerationError,
  THUMBNAIL_MAX_WIDTH,
} from "@/lib/media/thumbnails";

/**
 * PR 2 / Tier 2 (perf/media): pure thumbnail generator tests.
 *
 * `generatePreviewBuffer` is the only piece of the preview pipeline
 * that runs without R2 / DB / auth — it's a deterministic function of
 * (bytes, mimeType). Pinning its contract here means a future change
 * to the resize/encoder pipeline (e.g. switching to AVIF) shows up as
 * a test diff instead of a silent byte-count regression.
 *
 * The integration suite (tests/integration/thumbnails.test.ts) covers
 * the upload → preview → route path; this file stays hermetic so the
 * unit suite stays fast.
 */

/**
 * Build a synthetic PNG of the given dimensions. We always go
 * through sharp here too so the test fixture exercises the same
 * decode path as a real upload. A solid red PNG is enough — the
 * encoder doesn't care what's in the pixels.
 */
async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 30, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

describe("generatePreviewBuffer — supported source types", () => {
  it("encodes a PNG to a 480px WebP", async () => {
    const input = await makePng(2400, 1600);
    const preview = await generatePreviewBuffer(input, "image/png");
    expect(preview.width).toBeLessThanOrEqual(THUMBNAIL_MAX_WIDTH);
    expect(preview.height).toBeLessThanOrEqual(THUMBNAIL_MAX_WIDTH * 1.5); // 4:3 envelope
    expect(preview.byteSize).toBeGreaterThan(0);
    expect(preview.byteSize).toBeLessThan(input.byteLength); // sanity: smaller
    const decoded = sharp(preview.bytes);
    const meta = await decoded.metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(preview.width);
    expect(meta.height).toBe(preview.height);
  });

  it("respects withoutEnlargement on small inputs", async () => {
    // A 64x64 favicon uploaded as PNG must NOT upscale to 480 — the
    // browser will rasterise at the requested CSS size anyway.
    const input = await makePng(64, 64);
    const preview = await generatePreviewBuffer(input, "image/png");
    expect(preview.width).toBe(64);
    expect(preview.height).toBe(64);
  });

  it("preserves aspect ratio on non-square inputs", async () => {
    const input = await makePng(3000, 1000); // 3:1 panorama
    const preview = await generatePreviewBuffer(input, "image/png");
    // Width caps at THUMBNAIL_MAX_WIDTH; height keeps the 3:1 ratio.
    expect(preview.width).toBe(THUMBNAIL_MAX_WIDTH);
    expect(preview.height).toBe(Math.round(THUMBNAIL_MAX_WIDTH / 3));
  });
});

describe("generatePreviewBuffer — unsupported source types", () => {
  it("rejects SVG (vector — sharp rasterises through librsvg, not worth the surface)", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>',
    );
    await expect(generatePreviewBuffer(svg, "image/svg+xml")).rejects.toBeInstanceOf(
      PreviewGenerationError,
    );
  });

  it("rejects octet-stream with the unsupported_mime_type code", async () => {
    const garbage = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
    await expect(generatePreviewBuffer(garbage, "application/octet-stream")).rejects.toMatchObject({
      code: "unsupported_mime_type",
    });
  });

  it("rejects an unsupported but well-formed type (PDF)", async () => {
    const pdf = Buffer.from("%PDF-1.4\n%fake\n");
    await expect(generatePreviewBuffer(pdf, "application/pdf")).rejects.toMatchObject({
      code: "unsupported_mime_type",
    });
  });
});

describe("generatePreviewBuffer — corrupt input", () => {
  it("throws decode_failed when bytes are not a valid image", async () => {
    const garbage = Buffer.from("not an image, just text");
    await expect(generatePreviewBuffer(garbage, "image/png")).rejects.toMatchObject({
      code: "decode_failed",
    });
  });
});

describe("THUMBNAIL_MAX_WIDTH", () => {
  it("is in the documented 480-px envelope", () => {
    // The number is part of the public contract: PR 2 ships the
    // variant at exactly this size, and the route's Cache-Control
    // immutable header assumes the variant never changes. A future
    // bump to 600px must update this test, the route's docs, and
    // any consumers that hard-coded 480.
    expect(THUMBNAIL_MAX_WIDTH).toBe(480);
  });
});
