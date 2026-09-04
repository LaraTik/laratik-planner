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
      | "provider_not_configured"
      | "metric_unavailable"
      /** Legacy persisted metric error; new writes use metric_unavailable. */
      | "not_configured"
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

/**
 * Meta Graph API rate-limit usage (4 layers; we surface the two
 * most operationally useful: app-level and business use case).
 * `call_count`, `total_cputime`, and `total_time` are all 0–100
 * percentages of the per-app / per-business-id quota. Reading
 * the headers after every call lets the cron worker do a
 * proactive backoff when any layer is > 80% — preventing the
 * rate-limit cliff at scale.
 */
export type MetaRateLimitUsage = {
  app: { call_count: number; total_cputime: number; total_time: number } | null;
  /**
   * Keyed by business id; the array is per-asset-type usage
   * (e.g. `pages`, `instagram`). Each value is the same shape
   * as the app-level entry.
   */
  business: Record<
    string,
    { type: string; call_count: number; total_cputime: number; total_time: number }[]
  > | null;
};

function readRateLimitUsage(headers: Headers): MetaRateLimitUsage {
  const appRaw = headers.get("x-app-usage");
  const businessRaw = headers.get("x-business-use-case-usage");
  let app: MetaRateLimitUsage["app"] = null;
  if (appRaw) {
    try {
      const parsed = JSON.parse(appRaw);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof parsed.call_count === "number" &&
        typeof parsed.total_cputime === "number" &&
        typeof parsed.total_time === "number"
      ) {
        app = {
          call_count: parsed.call_count,
          total_cputime: parsed.total_cputime,
          total_time: parsed.total_time,
        };
      }
    } catch {
      // Header is malformed JSON or non-JSON; treat as absent.
    }
  }
  let business: MetaRateLimitUsage["business"] = null;
  if (businessRaw) {
    try {
      const parsed = JSON.parse(businessRaw);
      if (typeof parsed === "object" && parsed !== null) {
        business = parsed as MetaRateLimitUsage["business"];
      }
    } catch {
      // Malformed; treat as absent.
    }
  }
  return { app, business };
}

function fullJitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function classifyStatus(
  status: number,
  body?: string,
): {
  code: SocialProviderError["code"];
  retryable: boolean;
} {
  if (status === 401) {
    return { code: "auth_expired", retryable: false };
  }
  if (status === 403) {
    // 403 is ambiguous on its own. Meta returns a `code` field in
    // the body that distinguishes the two cases that matter:
    //   - 190 → access token expired / revoked
    //   - 200, 10, 100, 102 → permission denied (scope/app issue)
    // The pre-2026-08-28 code mapped every 403 to `auth_expired`,
    // which led operators to click Reconnect when the real cause
    // was a missing scope or pending App Review. Disambiguate
    // here so the snapshot's sourceMetadata.providerErrorCode
    // (and the analytics health banner) shows the actual reason.
    if (body) {
      try {
        const parsed = JSON.parse(body) as {
          error?: { code?: number; type?: string };
        };
        const providerCode = parsed.error?.code;
        if (typeof providerCode === "number" && providerCode !== 190) {
          return { code: "permission_denied", retryable: false };
        }
      } catch {
        // Body wasn't JSON; fall through to the auth_expired
        // default so the operator at least gets a valid code.
      }
    }
    return { code: "auth_expired", retryable: false };
  }
  if (status === 404) return { code: "not_found", retryable: false };
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status === 502 || status === 503 || status === 504) {
    return { code: "provider_unavailable", retryable: true };
  }
  if (status >= 500) return { code: "provider_unavailable", retryable: true };
  // 2026-08-28: 400 with Meta `error.code: 100` and a "metric"-flavored
  // message means the Meta app doesn't have that specific insight metric
  // enabled (e.g. `page_views` not in the App Review allowlist, or the
  // app is in Development mode without a role for the user). This is a
  // CONFIGURATION issue, not a transient failure — classify it
  // distinctly from the catch-all `invalid_response` so the page
  // branch can write a clean `partial: true` row with a clear
  // `providerErrorCode: "metric_unavailable"` and not surface as a
  // "Meta returned an unrecognized response" error to the operator.
  if (status === 400 && body) {
    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: number; message?: string };
      };
      const providerCode = parsed.error?.code;
      const providerMessage = parsed.error?.message ?? "";
      if (providerCode === 100 && /metric|insights/i.test(providerMessage)) {
        return { code: "metric_unavailable", retryable: false };
      }
    } catch {
      // Body wasn't JSON; fall through to the catch-all.
    }
  }
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
): Promise<{
  status: number;
  body: string;
  requestId: string | null;
  usage: MetaRateLimitUsage;
}> {
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
      // 2026-08-28: read the body ONCE whether the response is
      // successful or not. On failure, the body is used to
      // disambiguate 403 (Meta's `error.code` distinguishes 190 =
      // auth_expired from 200 = permission_denied). The body is
      // consumed here only and is never surfaced in logs or error
      // messages. On success, the body is returned.
      const { text } = await readBody(response);
      if (!response.ok) {
        const classification = classifyStatus(response.status, text);
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
      // 2026-08-28: read the per-call rate-limit usage headers
      // (X-App-Usage and X-Business-Use-Case-Usage) so the caller
      // can log the cumulative usage per cron tick and proactively
      // back off when any layer is > 80%. Both headers are
      // present on most 2xx and 429 responses from Meta; missing
      // or malformed values are silently ignored.
      const usage = readRateLimitUsage(response.headers);
      return { status: response.status, body: text, requestId, usage };
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
