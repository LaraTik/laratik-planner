const CALLBACK_BASE = new URL("https://callback.invalid");
const DEFAULT_CALLBACK_URL = "/app";

/** Keep sign-in redirects on this application, even when a server action is called directly. */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_CALLBACK_URL;
  }

  try {
    const parsed = new URL(value, CALLBACK_BASE);
    if (parsed.origin !== CALLBACK_BASE.origin) return DEFAULT_CALLBACK_URL;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}
