import { randomBytes } from "node:crypto";

/**
 * M4 — safe provider HTTP client.
 *
 * All provider HTTP calls go through `providerRequest`. The client
 * enforces:
 *
 *   - 10-second hard timeout (AbortController)
 *   - 1 MiB response body cap
 *   - retry only on 429 / 502 / 503 / 504 (up to 2 retries)
 *   - full-jitter delay capped at 4 seconds
 *   - sanitized errors (no URLs with query strings, no Authorization
 *     headers, no access tokens, no refresh tokens, no provider
 *     response bodies, no account metadata)
 *
 * The 10s/1MiB/2-retry policy is intentional: provider calls are
 * short. The cron worker lease is 5 minutes; a long-blocking call
 * would just waste the lease. The retry policy is conservative on
 * purpose — most 4xx errors are not transient and we should surface
 * them as `auth_expired` or `permission_denied`, not retry.
 */

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3; // initial + 2 retries
const MAX_JITTER_MS = 4_000;

export class SocialProviderError extends Error {
  constructor(
    public readonly code:
      | "rate_limited"
      | "auth_expired"
      | "permission_denied"
      | "not_found"
      | "provider_unavailable"
      | "invalid_response",
    public readonly retryable: boolean,
    public readonly requestId: string | null,
  ) {
    super(code);
    this.name = "SocialProviderError";
  }
}

export type ProviderRequestInit = {
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
};

function fullJitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function classifyStatus(status: number): {
  code: SocialProviderError["code"];
  retryable: boolean;
} {
  if (status === 401 || status === 403) {
    // 403 could be either auth-expired (token revoked) or
    // permission-denied (missing scope). The provider-specific layer
    // is responsible for the disambiguation; we surface a generic
    // auth_expired here and let the caller refine.
    return { code: "auth_expired", retryable: false };
  }
  if (status === 404) return { code: "not_found", retryable: false };
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status === 502 || status === 503 || status === 504) {
    return { code: "provider_unavailable", retryable: true };
  }
  if (status >= 500) return { code: "provider_unavailable", retryable: true };
  return { code: "invalid_response", retryable: false };
}

function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function readBody(response: Response): Promise<{ text: string; bytes: number }> {
  if (!response.body) return { text: "", bytes: 0 };
  const reader = response.body.getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // Best-effort cancel; the abort path matters more.
      }
      throw new SocialProviderError("invalid_response", false, null);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(combined), bytes: received };
}

/**
 * Issue a provider HTTP request. Throws `SocialProviderError` for
 * any non-success outcome. On retryable errors, retries up to
 * `MAX_ATTEMPTS - 1` times with full-jitter delay (cap 4s).
 *
 * The `requestId` on the response is a per-call UUID, captured from
 * the `X-Request-Id` response header when the provider sets one.
 * The error is the only surface that mentions `requestId`; the body
 * is never surfaced.
 */
export async function providerRequest(
  url: string,
  init: ProviderRequestInit = {},
): Promise<{ status: number; body: string; requestId: string | null }> {
  let lastError: SocialProviderError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(fullJitter(MAX_JITTER_MS));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: init.method ?? "GET",
        ...(init.headers ? { headers: init.headers } : {}),
        ...(init.body ? { body: init.body } : {}),
        signal: controller.signal,
      });
      const requestId = response.headers.get("x-request-id");
      if (!response.ok) {
        const classification = classifyStatus(response.status);
        const error = new SocialProviderError(
          classification.code,
          classification.retryable,
          requestId,
        );
        if (classification.retryable && attempt < MAX_ATTEMPTS - 1) {
          lastError = error;
          continue;
        }
        throw error;
      }
      const { text } = await readBody(response);
      return { status: response.status, body: text, requestId };
    } catch (err) {
      if (err instanceof SocialProviderError) {
        if (err.retryable && attempt < MAX_ATTEMPTS - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }
      const error = new SocialProviderError("provider_unavailable", true, null);
      if (attempt < MAX_ATTEMPTS - 1) {
        lastError = error;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  // Should be unreachable because the loop either returns or throws.
  throw lastError ?? new SocialProviderError("provider_unavailable", false, null);
}

/**
 * A new request-id label, suitable for the `request_id` column on
 * `social_profile_daily_metric`. Independent of the provider's
 * `X-Request-Id` header — this is the local correlation id.
 */
export function newRequestId(): string {
  return randomBytes(12).toString("hex");
}

/** Type-guard for `SocialProviderError`. */
export function isSocialProviderError(err: unknown): err is SocialProviderError {
  return err instanceof SocialProviderError;
}

/** Diagnostic short-form for log calls. Never logs the body. */
export function formatProviderError(err: SocialProviderError): string {
  return `SocialProviderError(code=${err.code}, retryable=${err.retryable}, requestId=${truncate(
    err.requestId ?? "none",
    16,
  )})`;
}
