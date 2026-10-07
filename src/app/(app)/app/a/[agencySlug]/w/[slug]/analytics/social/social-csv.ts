/**
 * M5 — CSV serialisation helpers.
 *
 * Pure functions, no DOM access. The client component
 * (`social-csv-export.tsx`) uses these to build a CSV string and a
 * filename, then constructs a Blob in the browser. The pure
 * separation lets us unit-test the CSV format without
 * `@testing-library/jsdom` Blob/URL workarounds.
 */
import type { SocialPlatform } from "@/lib/social/types";

export type CsvRow = {
  metricDate: string;
  followerCount: number | null;
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
  // Optional `partial` flag from the daily-metric sourceMetadata.
  // The `boolean | undefined` shape is required by
  // exactOptionalPropertyTypes; the caller either passes true,
  // false, or omits the key.
  partial?: boolean | undefined;
};

export function escapeCsvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // CSV per RFC 4180: wrap in quotes if the value contains a
  // comma, double-quote, or newline. Inner double-quotes are
  // escaped by doubling.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: CsvRow[], platform: SocialPlatform = "instagram"): string {
  const header = ["Date", "Followers", "Reach", "Views"];
  if (platform === "instagram") header.push("Engaged");
  header.push("Interactions", "Partial");
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      escapeCsvCell(r.metricDate),
      escapeCsvCell(r.followerCount),
      escapeCsvCell(r.reach),
      escapeCsvCell(r.views),
    ];
    if (platform === "instagram") cells.push(escapeCsvCell(r.engagedAccounts));
    cells.push(escapeCsvCell(r.interactions), escapeCsvCell(r.partial ? "true" : ""));
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function csvFilename(channelName: string, from: string, to: string): string {
  // Slugify the channel name for the filename. Lowercase, replace
  // runs of non-alphanumeric with a single dash, trim dashes.
  const slug = channelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `social-analytics-${slug || "channel"}-${from}_to_${to}.csv`;
}
