import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from "node:crypto";

const AAD = Buffer.from("laratik-planner:advertising-credentials:v1", "utf8");
const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_VERSION = 1 as const;

export type AdvertisingCredentialPayload = {
  accessToken: string;
  refreshToken?: string;
};

export type SealedAdvertisingCredentials = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: typeof KEY_VERSION;
};

export class AdvertisingCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdvertisingCredentialError";
  }
}

function validateDek(dek: Buffer): void {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_BYTES) {
    throw new AdvertisingCredentialError("Advertising credential key is invalid");
  }
}

export function sealAdvertisingCredentials(
  payload: AdvertisingCredentialPayload,
  dek: Buffer,
): SealedAdvertisingCredentials {
  validateDek(dek);
  if (!payload.accessToken.trim()) {
    throw new AdvertisingCredentialError("Advertising access token is required");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher: CipherGCM = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function openAdvertisingCredentials(
  sealed: SealedAdvertisingCredentials,
  dek: Buffer,
): AdvertisingCredentialPayload {
  validateDek(dek);
  if (sealed.keyVersion !== KEY_VERSION) {
    throw new AdvertisingCredentialError("Unsupported advertising credential envelope");
  }
  try {
    const iv = Buffer.from(sealed.iv, "base64");
    const tag = Buffer.from(sealed.tag, "base64");
    if (iv.length !== IV_BYTES || tag.length !== 16) throw new Error("invalid envelope");
    const decipher: DecipherGCM = createDecipheriv("aes-256-gcm", dek, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]);
    const payload = JSON.parse(plaintext.toString("utf8")) as AdvertisingCredentialPayload;
    if (typeof payload.accessToken !== "string" || !payload.accessToken.trim()) {
      throw new Error("invalid payload");
    }
    return payload;
  } catch {
    throw new AdvertisingCredentialError("Unable to decrypt advertising credentials");
  }
}
