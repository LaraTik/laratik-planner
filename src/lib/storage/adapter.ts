import type { Readable } from "node:stream";

export type StorageProvider = "r2";
export type StorageConfigStatus = "pending" | "healthy" | "unhealthy" | "disabled";
export type StorageObjectStatus = "pending" | "active" | "soft_deleted" | "deleted";

export type UploadIntent = {
  uploadUrl: string;
  expiresAt: number;
  requiredHeaders?: Record<string, string>;
};

export type ObjectMetadata = {
  objectKey: string;
  contentLength: number;
  contentType?: string;
  checksumSha256?: string;
  etag?: string;
};

export interface ObjectStorageAdapter {
  createUploadIntent(input: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    checksumSha256?: string;
    expiresInSeconds?: number;
  }): Promise<UploadIntent>;
  uploadObject(input: {
    objectKey: string;
    contentType: string;
    contentLength: number;
    body: Readable;
    checksumSha256?: string;
  }): Promise<void>;
  completeUpload(input: { objectKey: string }): Promise<ObjectMetadata>;
  headObject(input: { objectKey: string }): Promise<ObjectMetadata>;
  createReadUrl(input: { objectKey: string; expiresInSeconds?: number }): Promise<string>;
  deleteObject(input: { objectKey: string }): Promise<void>;
  abortUpload(input: { objectKey: string }): Promise<void>;
}
