const DEFAULT_PUBLIC_APP_ORIGIN = "https://planner.laratik.com";

const NON_PUBLIC_HOSTNAMES = new Set(["0.0.0.0", "::", "localhost", "127.0.0.1", "[::1]", "::1"]);

function parseOrigin(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function isUsableOrigin(url: URL, allowLocalhost: boolean): boolean {
  if (url.hostname === "0.0.0.0" || url.hostname === "::" || url.hostname === "[::1]") {
    return false;
  }
  return allowLocalhost || !NON_PUBLIC_HOSTNAMES.has(url.hostname);
}

/**
 * Resolve the origin used in links that leave the authenticated app.
 *
 * In production, configured public URLs win and loopback / wildcard hosts
 * are rejected. The request origin is useful for local development, but a
 * proxy-facing `0.0.0.0` origin must never be copied into a public link.
 */
export function resolvePublicAppOrigin({
  requestOrigin,
  configuredOrigins = [],
  allowLocalhost = false,
}: {
  requestOrigin?: string;
  configuredOrigins?: string[];
  allowLocalhost?: boolean;
}): string {
  const candidates = allowLocalhost
    ? [requestOrigin, ...configuredOrigins]
    : [...configuredOrigins, requestOrigin];

  for (const candidate of candidates) {
    const url = parseOrigin(candidate);
    if (url && isUsableOrigin(url, allowLocalhost)) return url.origin;
  }

  return DEFAULT_PUBLIC_APP_ORIGIN;
}

export { DEFAULT_PUBLIC_APP_ORIGIN };
