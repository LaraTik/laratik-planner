/**
 * Resolve the default audience language for a content item.
 *
 * Explicit contentLanguage always wins. Older items may not have that
 * field, so use the audience-facing source copy as a compatibility hint
 * before falling back to the agency default. This keeps Publishing from
 * displaying English as the selected language while showing Arabic copy.
 */
export function resolveContentLocale(input: { formatPayload: unknown; fallback: string }): string {
  if (input.formatPayload && typeof input.formatPayload === "object") {
    const payload = input.formatPayload as Record<string, unknown>;
    if (payload.contentLanguage === "en" || payload.contentLanguage === "ar") {
      return payload.contentLanguage;
    }

    const sourceText = [
      payload.caption,
      payload.description,
      payload.firstComment,
      payload.callToAction,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    const arabicCharacters =
      sourceText.match(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/g)?.length ?? 0;
    const latinCharacters = sourceText.match(/[A-Za-z]/g)?.length ?? 0;
    if (arabicCharacters >= 2 && arabicCharacters >= latinCharacters) return "ar";
  }

  return input.fallback;
}
