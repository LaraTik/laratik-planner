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
