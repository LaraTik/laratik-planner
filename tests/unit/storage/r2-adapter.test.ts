import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
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

  it("streams a same-origin fallback upload through the configured bucket", async () => {
    const send = vi.fn(async () => ({}));
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

    await adapter.uploadObject({
      objectKey: "agencies/a/workspaces/w/assets/o.png",
      contentType: "image/png",
      contentLength: 3,
      body: Readable.from([Buffer.from("abc")]),
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(send.mock.calls)).not.toContain("secret-key");
  });

  it("clamps upload and read URL lifetimes to the provider-safe range", async () => {
    const signUrl = vi.fn(async () => "https://signed.example/url");
    const adapter = new R2ObjectStorageAdapter(
      {
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        storageClass: "standard",
      },
      { client: { send: vi.fn() }, signUrl },
    );

    await adapter.createUploadIntent({
      objectKey: "key",
      contentType: "image/png",
      contentLength: 1,
      expiresInSeconds: 1,
    });
    await adapter.createReadUrl({ objectKey: "key", expiresInSeconds: 10_000 });

    expect(signUrl).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything(), {
      expiresIn: 30,
    });
    expect(signUrl).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything(), {
      expiresIn: 900,
    });
  });

  it("supports delete and abort, and maps provider failures to sanitized errors", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("secret-key leaked by provider"));
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

    await adapter.deleteObject({ objectKey: "key" });
    await expect(adapter.abortUpload({ objectKey: "key" })).rejects.toMatchObject({
      name: "StorageUnavailableError",
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls)).not.toContain("secret-key");
  });

  it("rejects invalid head metadata and runs a write/read/delete health probe", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ContentLength: 23, ContentType: "text/plain" })
      .mockResolvedValueOnce({});
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

    await expect(adapter.testConnection()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(3);

    const invalidMetadata = new R2ObjectStorageAdapter(
      {
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        storageClass: "standard",
      },
      { client: { send: vi.fn(async () => ({ ContentLength: 0 })) }, signUrl: vi.fn() },
    );
    await expect(invalidMetadata.headObject({ objectKey: "key" })).rejects.toMatchObject({
      name: "StorageUnavailableError",
    });
  });

  it("rejects malformed configuration before constructing the client", () => {
    expect(
      () =>
        new R2ObjectStorageAdapter({
          accountId: "account-1",
          endpoint: "http://insecure.example",
          bucket: "planner-media",
          accessKeyId: "access-key",
          secretAccessKey: "secret-key",
          storageClass: "standard",
        }),
    ).toThrow(/configuration/i);
  });
});
