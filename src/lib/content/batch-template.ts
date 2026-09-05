import type { ContentFormat } from "@/lib/format-payload/schemas";

export interface BatchTemplateRow {
  title: string;
  format: ContentFormat;
  plannedPublishAt: string;
  brief: string;
}

/**
 * A complete, copy-ready planning template. It intentionally contains one
 * realistic row for every supported format while keeping production fields in
 * the More details editor, where their format-specific schemas live.
 */
export const BATCH_TEMPLATE_ROWS: readonly BatchTemplateRow[] = [
  {
    title: "Autumn blend pre-order",
    format: "static_post",
    plannedPublishAt: "2026-09-05 09:00",
    brief: "Single image of the new autumn blend with a clear pre-order CTA.",
  },
  {
    title: "Five ways to brew a better cup",
    format: "carousel",
    plannedPublishAt: "2026-09-06 12:00",
    brief:
      "5-slide carousel: 1 cover and hook; 2 grind size; 3 water temperature; 4 pour pattern; 5 save-and-shop CTA. Add each slide's copy and visual direction in More details.",
  },
  {
    title: "Morning brew countdown",
    format: "story",
    plannedPublishAt: "2026-09-07 08:30",
    brief: "Three-frame story counting down to the autumn blend launch with a link sticker.",
  },
  {
    title: "Behind the roast: first crack",
    format: "short_form_video",
    plannedPublishAt: "2026-09-08 18:00",
    brief:
      "20-second vertical Reel: hook on the first crack, close-up roasting process, then a save-and-follow CTA.",
  },
  {
    title: "How to brew the autumn blend",
    format: "long_form_video",
    plannedPublishAt: "2026-09-09 10:00",
    brief: "Eight-minute YouTube tutorial with a recipe, tasting notes, and chapters.",
  },
  {
    title: "Live Q&A with the head roaster",
    format: "live_content",
    plannedPublishAt: "2026-09-10 19:00",
    brief:
      "Thirty-minute live session answering questions about roast level, origin, and grind size.",
  },
  {
    title: "The guide to choosing your roast",
    format: "article",
    plannedPublishAt: "2026-09-11 09:00",
    brief: "Educational article comparing light, medium, and dark roast profiles for home brewers.",
  },
  {
    title: "Autumn blend retail display",
    format: "other",
    plannedPublishAt: "2026-09-12 14:00",
    brief:
      "Custom in-store display brief for the launch week; define the deliverable in More details.",
  },
];

function cleanCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

/** Return a spreadsheet-ready TSV that can be pasted back into Batch Add. */
export function buildBatchTemplateTsv(channelNames: readonly string[] = []): string {
  const channels = channelNames.map(cleanCell).filter(Boolean).join(", ");
  const header = ["Title", "Format", "Date & time", "Short brief", "Channels"];
  const rows = BATCH_TEMPLATE_ROWS.map((row) => [
    row.title,
    row.format,
    row.plannedPublishAt,
    row.brief,
    channels,
  ]);
  return [header, ...rows].map((row) => row.map(cleanCell).join("\t")).join("\n");
}
