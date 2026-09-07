import { describe, expect, it } from "vitest";
import { R2ConfigSchema, sanitizeStorageError } from "@/lib/storage/r2-config";

describe("R2 configuration", () => {
  it("accepts a Cloudflare S3 endpoint and normalizes the trailing slash", () => {
    const parsed = R2ConfigSchema.parse({
      accountId: "account-1",
      endpoint: "https://account-1.r2.cloudflarestorage.com/",
      bucket: "planner-media",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      storageClass: "standard",
    });

    expect(parsed.endpoint).toBe("https://account-1.r2.cloudflarestorage.com");
  });

  it("rejects non-HTTPS endpoints and non-standard storage classes", () => {
    expect(() =>
      R2ConfigSchema.parse({
        accountId: "account-1",
        endpoint: "http://storage.internal",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        storageClass: "infrequent_access",
      }),
    ).toThrow();
  });

  it("sanitizes provider errors without exposing credentials or URLs", () => {
    expect(
      sanitizeStorageError(
        new Error(
          "InvalidAccessKeyId for https://account-1.r2.cloudflarestorage.com/planner-media?X-Amz-Credential=secret",
        ),
      ),
    ).toEqual({
      code: "storage.provider_error",
      message: "The storage provider rejected the request.",
    });
  });

  it("rejects invalid provider configurations", () => {
    const invalidInputs: unknown[] = [
      "not an object",
      {
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "",
        secretAccessKey: "secret-key",
      },
      {
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        storageClass: "infrequent_access",
      },
    ];
    for (const input of invalidInputs) expect(() => R2ConfigSchema.parse(input)).toThrow();
  });

  it("defaults the storage class and rejects endpoint protocols other than HTTPS", () => {
    expect(
      R2ConfigSchema.parse({
        accountId: "account-1",
        endpoint: "https://account-1.r2.cloudflarestorage.com",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
      }).storageClass,
    ).toBe("standard");
    expect(() =>
      R2ConfigSchema.parse({
        accountId: "account-1",
        endpoint: "ftp://storage.example",
        bucket: "planner-media",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
      }),
    ).toThrow(/HTTPS|required|Invalid url/i);
  });

  it("maps known adapter errors and unknown values to stable codes", () => {
    expect(sanitizeStorageError({})).toEqual({
      code: "storage.provider_error",
      message: "The storage provider rejected the request.",
    });
    expect(
      sanitizeStorageError(
        Object.assign(new Error("disabled"), { name: "StorageConfigurationError" }),
      ),
    ).toEqual({
      code: "storage.configuration_error",
      message: "Storage is not configured.",
    });
    expect(
      sanitizeStorageError(Object.assign(new Error("down"), { name: "StorageUnavailableError" })),
    ).toEqual({
      code: "storage.unavailable",
      message: "The storage provider is unavailable.",
    });
  });
});
