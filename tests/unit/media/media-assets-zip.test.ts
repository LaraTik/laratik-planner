import { describe, expect, it } from "vitest";
import { exportMediaAssetsZip, MediaZipTooLargeError } from "@/lib/exports/media-assets-zip";
import { MEDIA_ZIP_MAX_BYTES } from "@/lib/media/contract";

describe("media ZIP export", () => {
  it("sanitizes filenames and disambiguates duplicates", async () => {
    const result = await exportMediaAssetsZip([
      {
        id: "1",
        title: "../Brand / Hero",
        originalName: "hero.png",
        mimeType: "image/png",
        byteSize: 3,
        read: async () => Buffer.from("one"),
      },
      {
        id: "2",
        title: "../Brand / Hero",
        originalName: "hero.png",
        mimeType: "image/png",
        byteSize: 3,
        read: async () => Buffer.from("two"),
      },
    ]);
    expect(result.buffer.toString("binary")).toContain("-Brand - Hero.png");
    expect(result.buffer.toString("binary")).toContain("-Brand - Hero-2.png");
  });

  it("rejects an archive over the shared size cap before reading objects", async () => {
    await expect(
      exportMediaAssetsZip([
        {
          id: "1",
          title: "large",
          originalName: "large.bin",
          mimeType: "application/octet-stream",
          byteSize: MEDIA_ZIP_MAX_BYTES + 1,
          read: async () => {
            throw new Error("must not read");
          },
        },
      ]),
    ).rejects.toBeInstanceOf(MediaZipTooLargeError);
  });
});
