export type ContentFormat =
  | "static_post"
  | "carousel"
  | "story"
  | "short_form_video"
  | "long_form_video"
  | "live_content"
  | "article"
  | "other";

export const ALL_FORMATS: readonly ContentFormat[] = [
  "static_post",
  "carousel",
  "story",
  "short_form_video",
  "long_form_video",
  "live_content",
  "article",
  "other",
] as const;
