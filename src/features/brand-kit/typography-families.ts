import type { ComboboxOption } from "@/components/ui/combobox";

/**
 * Typography families — the canonical catalog of Google Fonts
 * surfaced by the Brand Kit typography Combobox (Phase 5).
 *
 * The list is grouped into four categories that match the visual
 * type system most agencies use:
 *
 *   - Sans      — workhorse UI and body faces
 *   - Serif     — long-form reading and editorial pull
 *   - Display   — poster / hero / launch typography
 *   - Mono      — code, captions, and tabular numbers
 *
 * The preview classes deliberately use CSS font-family declarations
 * instead of `next/font/google`. This catalog is imported by the
 * authenticated app and by the production build; fetching fourteen
 * Google Fonts stylesheets at build time made deploys depend on a
 * third-party response format and caused otherwise healthy builds to
 * fail. The selected family is still stored as the human-readable
 * name, while the browser uses the requested family when it is
 * available and a stable system fallback otherwise.
 *
 * Adding a new family is a 4-line change here: add its family name
 * and preview class, then add the matching CSS declaration in
 * `src/app/globals.css`.
 */

export type FontCategory = "Sans" | "Serif" | "Display" | "Mono";

interface FamilyEntry {
  family: string;
  category: FontCategory;
  className: string;
}

const FAMILY_CATALOG: FamilyEntry[] = [
  // Sans — workhorse UI / body faces
  { family: "Inter", category: "Sans", className: "font-preview-inter" },
  { family: "Roboto", category: "Sans", className: "font-preview-roboto" },
  { family: "Open Sans", category: "Sans", className: "font-preview-open-sans" },
  { family: "Lato", category: "Sans", className: "font-preview-lato" },
  { family: "Montserrat", category: "Sans", className: "font-preview-montserrat" },
  { family: "Poppins", category: "Sans", className: "font-preview-poppins" },
  { family: "Source Sans 3", category: "Sans", className: "font-preview-source-sans-3" },
  { family: "Nunito", category: "Sans", className: "font-preview-nunito" },
  { family: "Work Sans", category: "Sans", className: "font-preview-work-sans" },
  { family: "IBM Plex Sans", category: "Sans", className: "font-preview-ibm-plex-sans" },
  // Serif — long-form reading
  { family: "Playfair Display", category: "Serif", className: "font-preview-playfair-display" },
  { family: "Merriweather", category: "Serif", className: "font-preview-merriweather" },
  // Display — poster / hero / launch
  { family: "Raleway", category: "Display", className: "font-preview-raleway" },
  // Mono — code, captions, tabular
  { family: "Fira Sans", category: "Mono", className: "font-preview-fira-sans" },
];

/**
 * The Combobox option list. The order of the `FAMILY_CATALOG`
 * drives the display order; the `category` field drives the
 * sticky group headers in the dropdown.
 */
export const TYPOGRAPHY_OPTIONS: ComboboxOption[] = FAMILY_CATALOG.map((entry) => ({
  value: entry.family,
  label: entry.family,
  category: entry.category,
  className: entry.className,
}));

/**
 * Resolve the preview class for a given family name. Returns
 * `null` for families outside the catalog — the form's live
 * preview then falls back to a system-font declaration so the
 * page still renders (just with a system-font preview until the
 * user picks a known family).
 */
export function fontClassFor(family: string): string | null {
  return FAMILY_CATALOG.find((e) => e.family === family)?.className ?? null;
}

/**
 * The plain list of family names — exported separately so unit
 * tests don't need to know anything about the preview CSS.
 */
export const KNOWN_FAMILY_NAMES: readonly string[] = FAMILY_CATALOG.map((e) => e.family);
