import { describe, expect, it, vi } from "vitest";
import { R2ObjectStorageAdapter } from "@/lib/storage/r2-adapter";

describe("R2 object storage adapter", () => {
  it("creates a short-lived upload URL with signed content headers", async () => {
    const send = vi.fn();
    const signUrl = vi.fn(async () => "https://signed.example/upload");
    const adapter = new R2ObjectStorageAdapter(
      {
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        storageClass: "standard",
      },
      { client: { send }, signUrl },
    );

    const result = await adapter.createUploadIntent({
      objectKey: "agencies/a/workspaces/w/assets/o.png",
      contentType: "image/png",
      contentLength: 123,
      checksumSha256: "checksum",
      expiresInSeconds: 120,
    });

    expect(result).toEqual({
      uploadUrl: "https://signed.example/upload",
      expiresAt: expect.any(Number),
      requiredHeaders: {
        "Content-Type": "image/png",
        "x-amz-checksum-sha256": "checksum",
      },
    });
    expect(signUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 120 });
    expect(send).not.toHaveBeenCalled();
  });

  it("maps HeadObject metadata without returning credentials", async () => {
    const send = vi.fn(async () => ({
      ContentLength: 123,
      ContentType: "image/png",
      ChecksumSHA256: "checksum",
      ETag: '"etag"',
    }));
    const adapter = new R2ObjectStorageAdapter(
      {
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        storageClass: "standard",
      },
      { client: { send }, signUrl: vi.fn() },
    );

    await expect(adapter.headObject({ objectKey: "key" })).resolves.toEqual({
      objectKey: "key",
      contentLength: 123,
      contentType: "image/png",
      checksumSha256: "checksum",
      etag: '"etag"',
    });
    expect(JSON.stringify(send.mock.calls)).not.toContain("secret-key");
  });
});
