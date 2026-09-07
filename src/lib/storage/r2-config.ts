import { z } from "zod";

export const R2ConfigSchema = z
  .object({
    accountId: z.string().trim().min(1).max(128),
    endpoint: z.string().url(),
    bucket: z.string().trim().min(1).max(63),
    accessKeyId: z.string().trim().min(1).max(256),
    secretAccessKey: z.string().trim().min(1).max(512),
    storageClass: z.literal("standard").default("standard"),
  })
  .superRefine((value, ctx) => {
    const parsed = new URL(value.endpoint);
    if (parsed.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endpoint"],
        message: "HTTPS is required",
      });
    }
  })
  .transform((value) => ({ ...value, endpoint: value.endpoint.replace(/\/+$/, "") }));

export type R2Config = z.infer<typeof R2ConfigSchema>;

/**
 * Tenant-supplied R2 configuration. Unlike the platform operator form, this
 * endpoint is user input that the application will contact, so constrain it
 * to the account's official Cloudflare S3 hostname and standard HTTPS port.
 * This prevents an agency admin from turning the connection test into an
 * arbitrary server-side HTTPS request.
 */
export const AgencyOwnedR2ConfigSchema = R2ConfigSchema.superRefine((value, ctx) => {
  const endpoint = new URL(value.endpoint);
  const expectedHost = `${value.accountId.toLowerCase()}.r2.cloudflarestorage.com`;
  if (!/^[a-z0-9-]{3,64}$/.test(value.accountId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["accountId"],
      message: "Use the Cloudflare account ID",
    });
  }
  if (
    endpoint.hostname.toLowerCase() !== expectedHost ||
    (endpoint.port && endpoint.port !== "443") ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endpoint"],
      message: "Use the official HTTPS endpoint for the supplied Cloudflare account",
    });
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(value.bucket)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["bucket"],
      message: "Use a valid lowercase Cloudflare R2 bucket name",
    });
  }
});

export type SanitizedStorageError = {
  code: "storage.provider_error" | "storage.configuration_error" | "storage.unavailable";
  message: string;
};

/** Convert provider exceptions into a stable, credential-free audit value. */
export function sanitizeStorageError(error: unknown): SanitizedStorageError {
  const name = error instanceof Error ? error.name : "unknown";
  if (name === "StorageConfigurationError") {
    return { code: "storage.configuration_error", message: "Storage is not configured." };
  }
  if (name === "StorageUnavailableError") {
    return { code: "storage.unavailable", message: "The storage provider is unavailable." };
  }
  return { code: "storage.provider_error", message: "The storage provider rejected the request." };
}
