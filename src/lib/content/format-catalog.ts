import type { ContentFormat } from "@/lib/format-payload/schemas";

export interface ContentFormatDefinition {
  value: ContentFormat;
  labelKey: string;
  descriptionKey: string;
  aliases: ReadonlyArray<string>;
  guidance: {
    ratio?: string;
    duration?: string;
    detailKey: string;
  };
}

/**
 * The batch picker and the raw importer deliberately share this catalog.
 * Database values stay canonical while people can use the words they use
 * in conversation ("reel", "image", or "long video") when pasting rows.
 */
export const CONTENT_FORMAT_DEFINITIONS: ReadonlyArray<ContentFormatDefinition> = [
  {
    value: "static_post",
    labelKey: "planningFilters.formatLabels.static_post",
    descriptionKey: "batchAdd.form.formats.static_post.description",
    aliases: ["static_post", "static post", "static", "image", "photo", "feed post"],
    guidance: { detailKey: "batchAdd.form.formats.static_post.detail" },
  },
  {
    value: "carousel",
    labelKey: "planningFilters.formatLabels.carousel",
    descriptionKey: "batchAdd.form.formats.carousel.description",
    aliases: ["carousel", "carousel post", "slideshow"],
    guidance: { detailKey: "batchAdd.form.formats.carousel.detail" },
  },
  {
    value: "story",
    labelKey: "planningFilters.formatLabels.story",
    descriptionKey: "batchAdd.form.formats.story.description",
    aliases: ["story", "stories"],
    guidance: { detailKey: "batchAdd.form.formats.story.detail" },
  },
  {
    value: "short_form_video",
    labelKey: "planningFilters.formatLabels.short_form_video",
    descriptionKey: "batchAdd.form.formats.short_form_video.description",
    aliases: [
      "short_form_video",
      "short form video",
      "short video",
      "reel",
      "reels",
      "tiktok",
      "short",
    ],
    guidance: {
      ratio: "9:16",
      duration: "5–90s",
      detailKey: "batchAdd.form.formats.short_form_video.detail",
    },
  },
  {
    value: "long_form_video",
    labelKey: "planningFilters.formatLabels.long_form_video",
    descriptionKey: "batchAdd.form.formats.long_form_video.description",
    aliases: ["long_form_video", "long form video", "long video", "video", "youtube video"],
    guidance: {
      ratio: "16:9",
      duration: "30–3600s",
      detailKey: "batchAdd.form.formats.long_form_video.detail",
    },
  },
  {
    value: "live_content",
    labelKey: "planningFilters.formatLabels.live_content",
    descriptionKey: "batchAdd.form.formats.live_content.description",
    aliases: ["live_content", "live content", "live", "livestream", "stream"],
    guidance: { detailKey: "batchAdd.form.formats.live_content.detail" },
  },
  {
    value: "article",
    labelKey: "planningFilters.formatLabels.article",
    descriptionKey: "batchAdd.form.formats.article.description",
    aliases: ["article", "blog", "blog post"],
    guidance: { detailKey: "batchAdd.form.formats.article.detail" },
  },
  {
    value: "other",
    labelKey: "planningFilters.formatLabels.other",
    descriptionKey: "batchAdd.form.formats.other.description",
    aliases: ["other", "custom"],
    guidance: { detailKey: "batchAdd.form.formats.other.detail" },
  },
];

const FORMAT_BY_ALIAS = new Map<string, ContentFormat>();
for (const definition of CONTENT_FORMAT_DEFINITIONS) {
  for (const alias of definition.aliases) {
    FORMAT_BY_ALIAS.set(alias.trim().toLowerCase().replaceAll("_", " "), definition.value);
  }
}

export function normalizeBatchFormat(value: unknown): ContentFormat | null {
  if (typeof value !== "string") return null;
  return FORMAT_BY_ALIAS.get(value.trim().toLowerCase().replaceAll("_", " ")) ?? null;
}

export function formatDefinitionFor(value: unknown): ContentFormatDefinition | undefined {
  const normalized = normalizeBatchFormat(value);
  return CONTENT_FORMAT_DEFINITIONS.find((definition) => definition.value === normalized);
}
