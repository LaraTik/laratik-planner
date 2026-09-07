import { describe, expect, it } from "vitest";
import {
  classifyMediaKind,
  contentTypeFromFilename,
  downloadFilename,
  extractMediaDimensions,
  extensionFromFilename,
  inspectExternalMediaUrl,
  redactMediaSourceUrl,
  sanitizeOriginalFilename,
  sanitizeAssetTitle,
  titleFromFilename,
  validateMediaSignature,
  validateMediaUpload,
} from "@/lib/media/contract";

describe("media contract", () => {
  it("derives safe human titles without using them as storage keys", () => {
    expect(titleFromFilename("../Campaign\\hero.final.JPG")).toBe("hero.final");
    expect(sanitizeAssetTitle("  campaign\nhero / final  ")).toBe("campaign hero - final");
    expect(sanitizeAssetTitle("///")).toBe("-");
  });

  it("preserves only a safe basename for source filename metadata", () => {
    expect(sanitizeOriginalFilename("C:\\campaign\\hero\nfinal.JPG")).toBe("hero final.JPG");
    expect(sanitizeOriginalFilename("   ")).toBeNull();
  });

  it("classifies supported media and rejects unsafe types", () => {
    expect(classifyMediaKind("image/png")).toBe("image");
    expect(classifyMediaKind("video/mp4")).toBe("video");
    expect(classifyMediaKind("text/html")).toBeNull();
    expect(validateMediaUpload({ kind: "image", contentType: "image/png", byteSize: 1 })).toEqual({
      ok: true,
    });
    expect(
      validateMediaUpload({ kind: "image", contentType: "image/png", byteSize: 51 * 1024 * 1024 })
        .ok,
    ).toBe(false);
  });

  it("recognizes supported provider links but rejects arbitrary hosts", () => {
    expect(inspectExternalMediaUrl("https://drive.google.com/file/d/abc/view")).toMatchObject({
      ok: true,
      provider: "google_drive",
    });
    expect(inspectExternalMediaUrl("https://tenant.sharepoint.com/:v:/r/file")).toMatchObject({
      ok: true,
      provider: "onedrive",
    });
    expect(inspectExternalMediaUrl("http://127.0.0.1/file")).toEqual({
      ok: false,
      code: "invalid_url",
    });
    expect(inspectExternalMediaUrl("https://example.com/file.mp4")).toMatchObject({
      ok: true,
      provider: "external_url",
    });
  });

  it("extracts an extension without allowing path segments", () => {
    expect(extensionFromFilename("C:\\fake\\video.MP4")).toBe("mp4");
    expect(extensionFromFilename("README")).toBe("");
  });

  it("can recover a safe MIME type when browsers omit File.type", () => {
    expect(contentTypeFromFilename("photo.JPEG")).toBe("image/jpeg");
    expect(contentTypeFromFilename("brief.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(contentTypeFromFilename("unknown.bin")).toBeNull();
  });

  it("redacts signed-download credentials from stored provenance", () => {
    const redacted = redactMediaSourceUrl(
      "https://cdn.example.com/video.mp4?id=file-123&X-Amz-Signature=secret&token=private#fragment",
    );
    expect(redacted).toBe("https://cdn.example.com/video.mp4?id=file-123");
    expect(redactMediaSourceUrl("not-a-url")).toBe("");
  });

  it("creates a safe download name from the editable title", () => {
    expect(downloadFilename("Campaign / hero", "original.png", "image/png")).toBe(
      "Campaign - hero.png",
    );
    expect(downloadFilename("Video", "original.exe", "video/mp4")).toBe("Video.mp4");
    expect(downloadFilename("Video", null, "video/quicktime")).toBe("Video.mov");
    expect(downloadFilename("Notes", null, "text/plain")).toBe("Notes.txt");
  });

  it("validates common media signatures instead of trusting MIME alone", () => {
    expect(
      validateMediaSignature(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ ok: true });
    expect(validateMediaSignature("video/mp4", new TextEncoder().encode("not an mp4"))).toEqual({
      ok: false,
      code: "invalid_signature",
    });
    expect(validateMediaSignature("text/plain", new Uint8Array([0x61, 0x00, 0x62]))).toEqual({
      ok: false,
      code: "invalid_signature",
    });
  });

  it("extracts dimensions from bounded PNG and GIF headers", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    png.set([0x49, 0x48, 0x44, 0x52], 12);
    const pngView = new DataView(png.buffer);
    pngView.setUint32(16, 1920);
    pngView.setUint32(20, 1080);
    expect(extractMediaDimensions("image/png", png)).toEqual({ width: 1920, height: 1080 });

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x80, 0x02, 0xe0, 0x01]);
    expect(extractMediaDimensions("image/gif", gif)).toEqual({ width: 640, height: 480 });
    expect(extractMediaDimensions("image/png", new Uint8Array(24))).toBeNull();
  });
});
