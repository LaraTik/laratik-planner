/**
 * Shared guards for provider-supplied media fields.
 *
 * A provider thumbnail or caption is untrusted input that ends up in the DOM:
 * the URL becomes an image `src` and the caption becomes visible text. Both
 * therefore get the same treatment here rather than per-call-site, because the
 * schema also enforces `^https://` at the database level and the two must not
 * disagree.
 */

/**
 * Coerce an unknown provider value to a trimmed non-empty string.
 * Returns `null` for empty strings, so a blank caption is stored as absent
 * rather than as `""` that the UI would have to special-case.
 */
export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * Return the value only when it parses as an absolute https URL.
 *
 * This is the single guard for anything that will be used as an image source:
 * it rejects relative paths, `javascript:`, `data:` and http, matching the
 * `social_post_observation_thumbnail_https` CHECK constraint.
 */
export function httpsOrNull(value: unknown): string | null {
  const candidate = stringValue(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Alias kept for the publishing path, which reads better as a noun. */
export const httpsUrl = httpsOrNull;

/** Post text, or `null` when the provider omitted it or returned whitespace. */
export function blankToNull(value: unknown): string | null {
  return stringValue(value);
}

/**
 * Truncate a caption to a display length on a word boundary.
 *
 * Providers return captions up to 2200 characters; the UI shows one or two
 * lines, so the stored value stays full and the truncation happens at render
 * time instead of losing text in the database.
 */
export function truncateCaption(value: string | null, max = 140): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  const cut = collapsed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
