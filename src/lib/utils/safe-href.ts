/**
 * `safeHref` — defensive wrapper around any user-supplied URL that
 * will be rendered as an `<a href>`.
 *
 * The Zod schema on `createLinkedResourceAction` already enforces
 * `^https://` (via the `brand_linked_resource_url_https` Postgres
 * check constraint) so a `javascript:` URL can never reach the DB.
 * This helper is a second line of defence in case an older row in
 * production (e.g. seeded before the constraint was added) carries
 * a non-HTTPS value, or a future refactor accidentally widens the
 * allowed scheme. It also keeps `<a href>` rendering safe when the
 * URL is interpolated into a string template.
 *
 * Allowed schemes:
 *   - `https://` (production-safe)
 *   - `http://`  (legacy; will show a warning icon next to the link)
 *   - `mailto:`  (for support/contact fallbacks)
 *
 * Anything else (`javascript:`, `data:`, `vbscript:`, …) is replaced
 * with `#` so the click is a no-op. The browser still loads the row,
 * which is the safe default — the user sees a broken link rather
 * than triggering a script.
 */
export type SafeHrefResult = { href: string; warning?: "insecure" };

export function safeHref(url: string): SafeHrefResult {
  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("https://")) {
    return { href: trimmed };
  }
  if (lower.startsWith("http://")) {
    return { href: trimmed, warning: "insecure" };
  }
  if (lower.startsWith("mailto:")) {
    return { href: trimmed };
  }
  return { href: "#" };
}
