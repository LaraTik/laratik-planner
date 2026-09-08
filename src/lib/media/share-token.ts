import { createHash, randomBytes } from "node:crypto";

export const MEDIA_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashMediaShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createMediaShareToken(): string {
  return randomBytes(32).toString("base64url");
}
