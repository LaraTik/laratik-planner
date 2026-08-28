/**
 * Supported application locales + direction metadata.
 *
 * The locale set is intentionally narrow in v1: `en` and `ar`.
 * Adding a locale here is the only place the rest of the app
 * needs to know about it — `dir.ts` reads from this list, the
 * layout reads the active agency's `agencies.locale` against
 * this list, and the per-format editor's translation picker
 * offers a button for every entry that isn't the source locale.
 *
 * Direction is the *content* direction (the direction text flows
 * in for that locale). The HTML root's `dir` attribute is set
 * from the active agency locale in `app/layout.tsx`; the
 * per-field `dir` attribute is set per-input by `dir.ts` based
 * on the actual character content (so a user can type English
 * inside an Arabic-locale field and the input still flows LTR).
 *
 * Locale codes follow BCP 47: language only (`en`, `ar`) or
 * language + region (`en-US`, `pt-BR`). The `code` is the
 * canonical storage value (the `agencies.locale` column).
 */
export type LocaleCode = "en" | "ar";

export interface LocaleDescriptor {
  code: LocaleCode;
  /** Human label for the locale picker (English, in v1). */
  label: string;
  /** Native script label, shown in the locale picker. */
  nativeLabel: string;
  /** Content direction for this locale. */
  dir: "ltr" | "rtl";
}

export const SUPPORTED_LOCALES: ReadonlyArray<LocaleDescriptor> = [
  { code: "en", label: "English", nativeLabel: "English", dir: "ltr" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", dir: "rtl" },
] as const;

const BY_CODE: Map<LocaleCode, LocaleDescriptor> = new Map(
  SUPPORTED_LOCALES.map((l) => [l.code, l]),
);

/**
 * Resolve a locale descriptor by code. Unknown codes (e.g. legacy
 * `en-US` rows from before the v1 narrow-set) fall back to `en`
 * rather than throwing — the layout must never crash on a stale
 * DB value.
 */
export function resolveLocale(code: string | null | undefined): LocaleDescriptor {
  if (!code) return getByCode("en");
  return BY_CODE.get(code as LocaleCode) ?? getByCode("en");
}

export function getByCode(code: LocaleCode): LocaleDescriptor {
  const found = BY_CODE.get(code);
  if (!found) {
    // Defensive: should never happen because SUPPORTED_LOCALES is
    // a closed set. If it does, throw so the caller can decide
    // rather than silently swapping in English.
    throw new Error(`Unknown locale code: ${code}`);
  }
  return found;
}

/**
 * The list of locales a workspace can offer as a *translation*
 * target. The "source" locale (the one the field is being
 * written in) is excluded by the caller.
 */
export function translationLocalesFor(source: LocaleCode): ReadonlyArray<LocaleDescriptor> {
  return SUPPORTED_LOCALES.filter((l) => l.code !== source);
}
