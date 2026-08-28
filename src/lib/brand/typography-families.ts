import {
  Fira_Sans,
  IBM_Plex_Sans,
  Inter,
  Lato,
  Merriweather,
  Montserrat,
  Nunito,
  Open_Sans,
  Playfair_Display,
  Poppins,
  Raleway,
  Roboto,
  Source_Sans_3,
  Work_Sans,
} from "next/font/google";
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
 * Each family is pre-loaded via `next/font/google` at module load
 * so the live preview in the dropdown renders the real font
 * (no FOUT, no `@import` round-trip). The map is keyed by the
 * catalog label; the `family` field on the `brand_assets` row
 * stores the same string so the loader is the single source of
 * truth for the human-readable name.
 *
 * Adding a new family is a 4-line change here: import the
 * `next/font` loader, add an entry to KNOWN_FAMILIES with the
 * matching `className` from the loader, and (optionally) add it
 * to the `lib/ai/context.ts` font preview map.
 */

const inter = Inter({ subsets: ["latin"], display: "swap" });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const openSans = Open_Sans({ subsets: ["latin"], display: "swap" });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], display: "swap" });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], display: "swap" });
const raleway = Raleway({ subsets: ["latin"], display: "swap" });
const nunito = Nunito({ subsets: ["latin"], display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], display: "swap" });
const firaSans = Fira_Sans({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], display: "swap" });

export type FontCategory = "Sans" | "Serif" | "Display" | "Mono";

interface FamilyEntry {
  family: string;
  category: FontCategory;
  className: string;
}

const FAMILY_CATALOG: FamilyEntry[] = [
  // Sans — workhorse UI / body faces
  { family: "Inter", category: "Sans", className: inter.className },
  { family: "Roboto", category: "Sans", className: roboto.className },
  { family: "Open Sans", category: "Sans", className: openSans.className },
  { family: "Lato", category: "Sans", className: lato.className },
  { family: "Montserrat", category: "Sans", className: montserrat.className },
  { family: "Poppins", category: "Sans", className: poppins.className },
  { family: "Source Sans 3", category: "Sans", className: sourceSans.className },
  { family: "Nunito", category: "Sans", className: nunito.className },
  { family: "Work Sans", category: "Sans", className: workSans.className },
  { family: "IBM Plex Sans", category: "Sans", className: ibmPlexSans.className },
  // Serif — long-form reading
  { family: "Playfair Display", category: "Serif", className: playfair.className },
  { family: "Merriweather", category: "Serif", className: merriweather.className },
  // Display — poster / hero / launch
  { family: "Raleway", category: "Display", className: raleway.className },
  // Mono — code, captions, tabular
  { family: "Fira Sans", category: "Mono", className: firaSans.className },
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
 * Resolve a `next/font` className for a given family name. Returns
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
 * tests don't have to import next/font (the test file already
 * needs the names, not the className).
 */
export const KNOWN_FAMILY_NAMES: readonly string[] = FAMILY_CATALOG.map((e) => e.family);
