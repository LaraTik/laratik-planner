export type RuntimeEnvironment = "development" | "production" | "test";

export function buildSecurityHeaders(_environment: RuntimeEnvironment): Array<{
  key: string;
  value: string;
}> {
  const scriptSources = ["'self'", "'unsafe-inline'"];
  // The isolated Playwright runner uses Next's development server with
  // NODE_ENV=test. Webpack's dev client needs eval for source maps/HMR;
  // this branch is never used by the production server policy below.
  if (_environment !== "production") scriptSources.push("'unsafe-eval'");
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Browsers must not upgrade localhost development assets to HTTPS; WebKit
  // correctly enforces this directive even for loopback hosts.
  if (_environment === "production") directives.push("upgrade-insecure-requests");
  const csp = directives.join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

/**
 * Cache-Control header value for API mutating routes (POST/PUT/PATCH/DELETE).
 * Defense in depth against any intermediate cache (browser back/forward,
 * misconfigured CDN) holding a stale response that the server has since
 * mutated. The primary correctness guard remains server-side auth + the
 * session cookie; this header is a backstop.
 */
export const NO_STORE_CACHE_CONTROL = "no-store, max-age=0";

/**
 * Returns the headers object to spread into a `NextResponse` init for
 * mutating API routes. Centralised so the policy is one edit, not N
 * call sites.
 */
export function mutatingApiHeaders(): Record<string, string> {
  return { "Cache-Control": NO_STORE_CACHE_CONTROL };
}
