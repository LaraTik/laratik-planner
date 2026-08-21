import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-SHA256 signed-URL helpers for the local-volume storage adapter
 * (STUDIOFLOW_MASTER_PROMPT.md §11.2 — option A: local volume + signed URL).
 *
 * Tokens are short-lived (default 300s) and bound to a specific
 * (workspaceId, purpose) pair so a leaked upload token cannot be
 * used to read other workspaces' files. Verification uses
 * `timingSafeEqual` to avoid the standard HMAC string-comparison
 * timing leak.
 *
 * The shape of the signed payload is intentionally simple — a JSON
 * object containing the action ("upload" | "download"), the binding
 * keys, and the expiry — and serialised as base64url so it survives
 * URL query parameters. The HMAC tag is appended with a `.` so the
 * verifier can split on the last separator.
 *
 * `UPLOAD_TOKEN_SECRET` is required. We throw at module init if it is
 * missing in production so a misconfigured deploy fails fast.
 */

const DEFAULT_EXPIRY_SECONDS = 300;
const MIN_SECRET_LENGTH = 32;

function getSecret(): string {
  const secret = process.env.UPLOAD_TOKEN_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "UPLOAD_TOKEN_SECRET must be set to a 32+ char random string. " +
          "Generate one with: openssl rand -hex 32",
      );
    }
    // In dev/test, fall back to a deterministic placeholder so the
    // storage layer is still importable. Production builds always
    // require a real secret (see the throw above).
    return "dev-only-do-not-use-in-prod-dev-only-do-not-use";
  }
  return secret;
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadEncoded: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadEncoded).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export type SignedUploadPayload = {
  action: "upload";
  workspaceId: string;
  kind: string;
  ext: string;
  expiresAt: number;
};

export type SignedDownloadPayload = {
  action: "download";
  workspaceId: string;
  fileId: string;
  expiresAt: number;
};

type TokenEnvelope = { token: string; expiresAt: number };

function encodeToken(payload: SignedUploadPayload | SignedDownloadPayload, secret: string): string {
  const payloadEncoded = base64url(JSON.stringify(payload));
  const tag = sign(payloadEncoded, secret);
  return `${payloadEncoded}.${tag}`;
}

function decodeToken(
  token: string,
  secret: string,
  expectedAction: "upload" | "download",
  nowSeconds: number,
): { payload: SignedUploadPayload | SignedDownloadPayload } | { error: string } {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 0) return { error: "Malformed token" };
  const payloadEncoded = token.slice(0, lastDot);
  const tag = token.slice(lastDot + 1);

  const expected = sign(payloadEncoded, secret);
  if (!safeEqual(tag, expected)) return { error: "Signature mismatch" };

  let payload: SignedUploadPayload | SignedDownloadPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadEncoded));
  } catch {
    return { error: "Malformed payload" };
  }
  if (payload.action !== expectedAction) {
    return { error: `Wrong action: expected ${expectedAction}` };
  }
  if (typeof payload.expiresAt !== "number" || payload.expiresAt <= nowSeconds) {
    return { error: "Token expired" };
  }
  return { payload };
}

/**
 * Sign an upload intent. The returned `path` is the relative file
 * path the client should PUT to (we use it for routing as well as for
 * verifying the upload landed at the right place).
 */
export function signUploadPath(
  workspaceId: string,
  kind: string,
  ext: string,
  opts?: { expiresInSeconds?: number; now?: number },
): TokenEnvelope & { path: string } {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = now + (opts?.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS);
  const payload: SignedUploadPayload = {
    action: "upload",
    workspaceId,
    kind,
    ext,
    expiresAt,
  };
  return {
    token: encodeToken(payload, getSecret()),
    expiresAt,
    path: `${workspaceId}/${kind}/${ext}`,
  };
}

export function verifyUploadToken(
  token: string,
  opts?: { now?: number },
): { ok: true; payload: SignedUploadPayload } | { ok: false; error: string } {
  const result = decodeToken(
    token,
    getSecret(),
    "upload",
    opts?.now ?? Math.floor(Date.now() / 1000),
  );
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, payload: result.payload as SignedUploadPayload };
}

/**
 * Sign a download intent for a single file. The `fileId` is the
 * `storagePath` value (the relative path under UPLOADS_DIR) — not an
 * absolute path — so a leaked token never reveals the server's
 * filesystem layout.
 */
export function signDownloadPath(
  workspaceId: string,
  fileId: string,
  opts?: { expiresInSeconds?: number; now?: number },
): TokenEnvelope {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = now + (opts?.expiresInSeconds ?? DEFAULT_EXPIRY_SECONDS);
  const payload: SignedDownloadPayload = {
    action: "download",
    workspaceId,
    fileId,
    expiresAt,
  };
  return { token: encodeToken(payload, getSecret()), expiresAt };
}

export function verifyDownloadToken(
  token: string,
  opts?: { now?: number },
): { ok: true; payload: SignedDownloadPayload } | { ok: false; error: string } {
  const result = decodeToken(
    token,
    getSecret(),
    "download",
    opts?.now ?? Math.floor(Date.now() / 1000),
  );
  if ("error" in result) return { ok: false, error: result.error };
  return { ok: true, payload: result.payload as SignedDownloadPayload };
}
