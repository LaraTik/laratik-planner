import type { ContentFormat } from "@/lib/format-payload/schemas";

export interface BatchTemplateRow {
  title: string;
  format: ContentFormat;
  plannedPublishAt: string;
  brief: string;
  formatPayload?: Record<string, unknown>;
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
    formatPayload: {
      schemaVersion: 1,
      hook: "Meet your new autumn ritual.",
      mainMessage: "A warm, balanced blend for slower mornings.",
      callToAction: "Pre-order before launch day.",
      caption: "A new season deserves a new cup. Pre-order our autumn blend today.",
      hashtags: ["#AutumnBlend", "#SpecialtyCoffee"],
    },
  },
  {
    title: "Five ways to brew a better cup",
    format: "carousel",
    plannedPublishAt: "2026-09-06 12:00",
    brief:
      "5-slide carousel: 1 cover and hook; 2 grind size; 3 water temperature; 4 pour pattern; 5 save-and-shop CTA. Add each slide's copy and visual direction in More details.",
    formatPayload: {
      schemaVersion: 1,
      slideCount: 5,
      hook: "Your best cup starts before the first pour.",
      callToAction: "Save this guide for your next brew.",
    },
  },
  {
    title: "Morning brew countdown",
    format: "story",
    plannedPublishAt: "2026-09-07 08:30",
    brief: "Three-frame story counting down to the autumn blend launch with a link sticker.",
    formatPayload: {
      schemaVersion: 1,
      frameCount: 3,
      hook: "Three days until the new blend.",
      callToAction: "Tap to join the pre-order list.",
    },
  },
  {
    title: "Behind the roast: first crack",
    format: "short_form_video",
    plannedPublishAt: "2026-09-08 18:00",
    brief:
      "20-second vertical Reel: hook on the first crack, close-up roasting process, then a save-and-follow CTA.",
    formatPayload: {
      schemaVersion: 1,
      ratio: "9:16",
      durationSeconds: 20,
      hook: "Listen for the moment coffee wakes up.",
      callToAction: "Follow for the full roast story.",
      scenes: [
        {
          position: 1,
          summary: "Close-up of green beans entering the roaster.",
          durationSeconds: 5,
        },
        { position: 2, summary: "First crack with a tight shot of the roast.", durationSeconds: 8 },
        { position: 3, summary: "Finished beans and the autumn blend pack.", durationSeconds: 7 },
      ],
    },
  },
  {
    title: "How to brew the autumn blend",
    format: "long_form_video",
    plannedPublishAt: "2026-09-09 10:00",
    brief: "Eight-minute YouTube tutorial with a recipe, tasting notes, and chapters.",
    formatPayload: {
      schemaVersion: 1,
      durationSeconds: 480,
      hook: "Make the autumn blend taste sweeter at home.",
      callToAction: "Subscribe and download the recipe.",
    },
  },
  {
    title: "Live Q&A with the head roaster",
    format: "live_content",
    plannedPublishAt: "2026-09-10 19:00",
    brief:
      "Thirty-minute live session answering questions about roast level, origin, and grind size.",
    formatPayload: {
      schemaVersion: 1,
      hook: "Ask the roaster anything about your daily brew.",
      callToAction: "Send your question before we go live.",
    },
  },
  {
    title: "The guide to choosing your roast",
    format: "article",
    plannedPublishAt: "2026-09-11 09:00",
    brief: "Educational article comparing light, medium, and dark roast profiles for home brewers.",
    formatPayload: {
      schemaVersion: 1,
      hook: "Which roast belongs in your morning routine?",
      mainMessage: "A practical guide to choosing roast level by taste and brew method.",
      callToAction: "Use the guide to choose your next bag.",
    },
  },
  {
    title: "Autumn blend retail display",
    format: "other",
    plannedPublishAt: "2026-09-12 14:00",
    brief:
      "Custom in-store display brief for the launch week; define the deliverable in More details.",
    formatPayload: {
      schemaVersion: 1,
      notes: "Counter display with launch date, product pack, and QR code to pre-order.",
    },
  },
];

function cleanCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

/** Return a spreadsheet-ready TSV that can be pasted back into Batch Add. */
export function buildBatchTemplateTsv(channelNames: readonly string[] = []): string {
  const channels = channelNames.map(cleanCell).filter(Boolean).join(", ");
  const header = [
    "Title",
    "Format",
    "Date & time",
    "Short brief",
    "Channels",
    "Content language",
    "Hook",
    "Main message",
    "CTA",
    "Caption",
    "Hashtags",
    "First comment",
    "Visual direction",
    "Format payload JSON",
  ];
  const rows = BATCH_TEMPLATE_ROWS.map((row) => [
    row.title,
    row.format,
    row.plannedPublishAt,
    row.brief,
    channels,
    typeof row.formatPayload?.contentLanguage === "string" ? row.formatPayload.contentLanguage : "",
    typeof row.formatPayload?.hook === "string" ? row.formatPayload.hook : "",
    typeof row.formatPayload?.mainMessage === "string" ? row.formatPayload.mainMessage : "",
    typeof row.formatPayload?.callToAction === "string" ? row.formatPayload.callToAction : "",
    typeof row.formatPayload?.caption === "string" ? row.formatPayload.caption : "",
    Array.isArray(row.formatPayload?.hashtags) ? row.formatPayload.hashtags.join(" ") : "",
    typeof row.formatPayload?.firstComment === "string" ? row.formatPayload.firstComment : "",
    typeof row.formatPayload?.visualDirection === "string" ? row.formatPayload.visualDirection : "",
    JSON.stringify(row.formatPayload ?? { schemaVersion: 1 }),
  ]);
  return [header, ...rows].map((row) => row.map(cleanCell).join("\t")).join("\n");
}
