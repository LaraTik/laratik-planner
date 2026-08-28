/**
 * Per-field direction auto-detection.
 *
 * Why this exists: a workspace may be `ar` (the agency default
 * locale), but a planner writing a hashtag or a mention will mix
 * English chars inside the field. The HTML `dir` attribute on the
 * root is the *page* direction; the `dir` attribute on the input
 * is the *content* direction. They are not the same — the user
 * expects English in a hashtag to flow LTR even when the field
 * is in an otherwise RTL form.
 *
 * The detection rule is deliberately simple: scan the first
 * non-whitespace, non-control character; if it falls in the
 * Arabic Unicode block (U+0600–U+06FF, plus the Arabic
 * Supplement U+0750–U+077F and the Arabic Presentation
 * Forms-B U+FE70–U+FEFF), the field is RTL. Otherwise LTR.
 *
 * The detector is cheap (no Unicode normalisation, no case
 * folding) and is called on every keystroke via React's
 * `useDeferredValue` so the input stays smooth on long fields.
 * The detection result drives the `dir` attribute, which
 * the browser uses to align caret + scroll + bidi punctuation
 * correctly.
 *
 * The function is pure and safe to import from client or server
 * modules.
 */

const ARABIC_RANGES: ReadonlyArray<[number, number]> = [
  // Arabic
  [0x0600, 0x06ff],
  // Arabic Supplement
  [0x0750, 0x077f],
  // Arabic Extended-A
  [0x08a0, 0x08ff],
  // Arabic Presentation Forms-B
  [0xfe70, 0xfeff],
];

function isArabicCodePoint(code: number): boolean {
  for (const [lo, hi] of ARABIC_RANGES) {
    if (code >= lo && code <= hi) return true;
  }
  return false;
}

/**
 * Inspect a string and return the direction the text should be
 * laid out in. Empty / whitespace-only / control-only strings
 * return the supplied `fallback` (typically the workspace
 * locale's direction). The detector is conservative: it scans
 * the first 8 non-whitespace chars and calls RTL on the first
 * Arabic char it sees; LTR otherwise.
 *
 * The 8-char cap is a small perf guard for pathologically long
 * single-line inputs. In practice the first char of real content
 * is enough — the cap exists so a textarea paste of 200 KB of
 * Latin text isn't a 200 KB scan.
 */
export function detectDir(text: string, fallback: "ltr" | "rtl" = "ltr"): "ltr" | "rtl" {
  if (!text) return fallback;
  const max = Math.min(text.length, 64);
  for (let i = 0; i < max; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x20) continue; // whitespace + control
    return isArabicCodePoint(code) ? "rtl" : "ltr";
  }
  return fallback;
}

/**
 * HTML `dir` attribute value for a text input. Returns
 * `"rtl"` or `"ltr"` (never the empty string — the browser
 * treats `dir=""` as "inherit" which we don't want here).
 */
export function dirAttrFor(text: string, fallback: "ltr" | "rtl" = "ltr"): "ltr" | "rtl" {
  return detectDir(text, fallback);
}
