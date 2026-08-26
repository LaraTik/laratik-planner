import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  History,
  Image as ImageIcon,
  Link as LinkIcon,
  MessageCircle,
  Palette,
  Sparkles,
  Tag,
  Type,
} from "lucide-react";

/**
 * BRAND_KIT_SECTIONS — the single source of truth for every section
 * on `/app/w/[slug]/brand-kit`.
 *
 * Why a config:
 *   - The page, the top tabs, the `AddAssetMenu`, and the future
 *     keyboard-shortcut handler all need to enumerate the sections.
 *     Without a config they each inline their own copy, and the
 *     menu/tabs drift out of sync (the bug closed in C-1.1 was
 *     caused by exactly this drift on icons).
 *   - Adding a new section is a one-line change here, not a 5-file
 *     change.
 *   - The TypeScript discriminated union (`addMenuLabel` is optional)
 *     forces the read-only sections (`overview`, `recent`) to opt out
 *     of the Add menu by leaving it undefined.
 *
 * Locked in the brand-kit rebuild plan (`docs/design/BRAND_KIT_AUDIT_2026-08-26.md`).
 */

export type BrandKitSectionId =
  | "overview"
  | "logo"
  | "color"
  | "guidelines"
  | "voice"
  | "pillars"
  | "publishing"
  | "linked"
  | "recent";

export interface BrandKitSection {
  id: BrandKitSectionId;
  /** Tab label and SectionCard title. */
  label: string;
  /** Lucide icon for the top tab and the Add menu row. */
  icon: LucideIcon;
  /** When set, the section shows up in the Add menu with this label. */
  addMenuLabel?: string;
  /** When set, the Add menu row shows this 1-line description. */
  addMenuDescription?: string;
  /** When true, the inline create form is rendered only to managers. */
  managerOnlyAdd: boolean;
  /** Reserved for Phase 5 (edit-in-place). */
  supportsEdit: boolean;
  /** Reserved for Phase 5 (archived view). */
  supportsArchive: boolean;
}

export const BRAND_KIT_SECTIONS: readonly BrandKitSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: Sparkles,
    managerOnlyAdd: false,
    supportsEdit: false,
    supportsArchive: false,
  },
  {
    id: "logo",
    label: "Logos",
    icon: ImageIcon,
    addMenuLabel: "Logo",
    addMenuDescription: "Upload a file or paste an external URL",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "color",
    label: "Colors",
    icon: Palette,
    addMenuLabel: "Color",
    addMenuDescription: "Add a hex token to the palette",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "guidelines",
    label: "Typography",
    icon: Type,
    addMenuLabel: "Typography",
    addMenuDescription: "Catalogue a font with role + weight",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "voice",
    label: "Voice",
    icon: MessageCircle,
    addMenuLabel: "Voice rule",
    addMenuDescription: "Document tone, do's, or don'ts",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "pillars",
    label: "Pillars",
    icon: Tag,
    addMenuLabel: "Content pillar",
    addMenuDescription: "Add a topic pillar with color + blurb",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "publishing",
    label: "Publishing",
    icon: BookOpen,
    addMenuLabel: "Publishing rule",
    addMenuDescription: "Editorial guardrail for the team",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "linked",
    label: "Linked",
    icon: LinkIcon,
    addMenuLabel: "Linked resource",
    addMenuDescription: "Figma, Drive, Canva, or Dropbox link",
    managerOnlyAdd: true,
    supportsEdit: true,
    supportsArchive: true,
  },
  {
    id: "recent",
    label: "Activity",
    icon: History,
    managerOnlyAdd: false,
    supportsEdit: false,
    supportsArchive: false,
  },
] as const;

/** Sections that show up in the top tab strip and the Bento grid. */
export const ORDERED_TAB_SECTIONS: readonly BrandKitSection[] = BRAND_KIT_SECTIONS;

/** Sections that show up in the AddAssetMenu (read-only sections are excluded). */
export const ADD_MENU_SECTIONS: readonly BrandKitSection[] = BRAND_KIT_SECTIONS.filter(
  (s) => s.addMenuLabel !== undefined,
);

/** Lookup helper. Returns undefined for unknown ids. */
export function getBrandKitSection(id: string): BrandKitSection | undefined {
  return BRAND_KIT_SECTIONS.find((s) => s.id === id);
}
