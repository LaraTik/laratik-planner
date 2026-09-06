import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { getSignedUrl as defaultGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorageAdapter, ObjectMetadata, UploadIntent } from "./adapter";
import { R2ConfigSchema, type R2Config } from "./r2-config";

type S3ClientLike = { send(command: unknown): Promise<Record<string, unknown>> };
type SignUrl = (
  client: S3ClientLike,
  command: unknown,
  options: { expiresIn: number },
) => Promise<string>;

export class StorageConfigurationError extends Error {
  constructor(message = "Storage configuration is invalid") {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

export class StorageUnavailableError extends Error {
  constructor(message = "Storage provider is unavailable") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

function metadataFromHead(objectKey: string, output: Record<string, unknown>): ObjectMetadata {
  const contentLength = Number(output.ContentLength);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new StorageUnavailableError("Storage returned invalid object metadata");
  }
  const contentType = typeof output.ContentType === "string" ? output.ContentType : undefined;
  const checksumSha256 =
    typeof output.ChecksumSHA256 === "string" ? output.ChecksumSHA256 : undefined;
  const etag = typeof output.ETag === "string" ? output.ETag : undefined;
  return {
    objectKey,
    contentLength,
    ...(contentType ? { contentType } : {}),
    ...(checksumSha256 ? { checksumSha256 } : {}),
    ...(etag ? { etag } : {}),
  };
}

export class R2ObjectStorageAdapter implements ObjectStorageAdapter {
  private readonly config: R2Config;
  private readonly client: S3ClientLike;
  private readonly signUrl: SignUrl;

  constructor(rawConfig: R2Config, dependencies?: { client?: S3ClientLike; signUrl?: SignUrl }) {
    const parsed = R2ConfigSchema.safeParse(rawConfig);
    if (!parsed.success) throw new StorageConfigurationError("Storage configuration is invalid");
    this.config = parsed.data;
    this.client =
      dependencies?.client ??
      new S3Client({
        region: "auto",
        endpoint: this.config.endpoint,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
        forcePathStyle: true,
      });
    this.signUrl = dependencies?.signUrl ?? (defaultGetSignedUrl as unknown as SignUrl);
  }

  async createUploadIntent(input: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    checksumSha256?: string;
    expiresInSeconds?: number;
  }): Promise<UploadIntent> {
    const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 300, 30), 900);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
      StorageClass: "STANDARD",
      ...(input.checksumSha256 ? { ChecksumSHA256: input.checksumSha256 } : {}),
    });
    const uploadUrl = await this.signUrl(this.client, command, { expiresIn: expiresInSeconds });
    return {
      uploadUrl,
      expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
      requiredHeaders: {
        "Content-Type": input.contentType,
        ...(input.checksumSha256 ? { "x-amz-checksum-sha256": input.checksumSha256 } : {}),
      },
    };
  }

  async completeUpload(input: { objectKey: string }): Promise<ObjectMetadata> {
    return this.headObject(input);
  }

  async headObject(input: { objectKey: string }): Promise<ObjectMetadata> {
    try {
      const output = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: input.objectKey }),
      );
      return metadataFromHead(input.objectKey, output);
    } catch {
      throw new StorageUnavailableError("Storage object metadata could not be read");
    }
  }

  async createReadUrl(input: { objectKey: string; expiresInSeconds?: number }): Promise<string> {
    const expiresInSeconds = Math.min(Math.max(input.expiresInSeconds ?? 300, 30), 900);
    const command = new GetObjectCommand({ Bucket: this.config.bucket, Key: input.objectKey });
    return this.signUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(input: { objectKey: string }): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: input.objectKey }),
      );
    } catch {
      throw new StorageUnavailableError("Storage object could not be deleted");
    }
  }

  async abortUpload(input: { objectKey: string }): Promise<void> {
    await this.deleteObject(input);
  }

  /** Probe the exact credential/bucket pair used by normal uploads. */
  async testConnection(): Promise<void> {
    const objectKey = `._planner-health/${randomUUID()}.txt`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
          Body: "planner-storage-health",
          ContentType: "text/plain",
          StorageClass: "STANDARD",
        }),
      );
      await this.headObject({ objectKey });
    } finally {
      try {
        await this.deleteObject({ objectKey });
      } catch {
        // Preserve the original connection error; the cleanup failure is
        // recorded by the caller as a sanitized provider error.
      }
    }
  }
}
