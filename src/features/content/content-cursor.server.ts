import "server-only";

/** Encode the last planning-list item as a URL-safe pagination cursor. */
export function encodeContentCursor(cursor: { plannedPublishAt: Date; id: string }): string {
  const json = JSON.stringify({
    plannedPublishAt: cursor.plannedPublishAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** Invalid or absent cursors start the planning list from the beginning. */
export function decodeContentCursor(
  raw: string | undefined | null,
): { plannedPublishAt: Date; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { plannedPublishAt?: unknown; id?: unknown };
    if (typeof parsed.plannedPublishAt !== "string" || typeof parsed.id !== "string") {
      return undefined;
    }
    const date = new Date(parsed.plannedPublishAt);
    if (Number.isNaN(date.getTime())) return undefined;
    return { plannedPublishAt: date, id: parsed.id };
  } catch {
    return undefined;
  }
}
