import "server-only";
import { analyticsTemplate } from "./analytics";
import type { ReportTemplateSpec } from "./types";

/**
 * Template registry — a single map of every report type the agency
 * picker can render. Adding a new template means:
 *
 *   1. Implementing `lib/reports/templates/<id>.tsx` with a
 *      `ReportTemplateSpec` export.
 *   2. Registering it here. The picker auto-discovers the entry.
 *
 * Anything else (the picker UI, the PDF renderer, the storage path)
 * stays untouched.
 */

const registry = new Map<string, ReportTemplateSpec>([["analytics", analyticsTemplate]]);

/**
 * Optional future templates. They ship with `labelKey` set so the
 * picker renders them as "Coming soon" rather than as a usable card
 * while the template author is still writing them. Once the spec is
 * registered, remove the entry from `upcoming` and add it to the
 * `registry` Map above.
 */
const upcoming: Array<{
  id: "post_engagement" | "ads_performance";
  label: string;
  blurb: string;
}> = [
  {
    id: "post_engagement",
    label: "Post engagement",
    blurb: "Per-post engagement with like / comment / share breakdown.",
  },
  {
    id: "ads_performance",
    label: "Ads campaigns",
    blurb: "Spend, ROAS, CPM, and creative-level efficiency by campaign.",
  },
];

export function getTemplate(id: string): ReportTemplateSpec | null {
  return registry.get(id) ?? null;
}

export function listTemplates(): ReadonlyArray<ReportTemplateSpec> {
  return Array.from(registry.values());
}

export function listUpcomingTemplates(): ReadonlyArray<{
  id: "post_engagement" | "ads_performance";
  label: string;
  blurb: string;
}> {
  return upcoming;
}

export function isTemplateAvailable(id: string): boolean {
  return registry.has(id);
}
