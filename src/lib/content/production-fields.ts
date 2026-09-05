import type { ContentFormat } from "@/lib/format-payload/schemas";

/** Payload fields owned by a designer during the production stage. */
export const DESIGNER_EDITABLE_FORMAT_FIELDS: Record<ContentFormat, ReadonlyArray<string>> = {
  static_post: ["visualDirection", "visualSlides", "references", "additionalNotes"],
  carousel: ["slideOutline", "visualDirection", "references", "additionalNotes"],
  story: ["frameCount", "visualDirection", "additionalNotes"],
  short_form_video: [
    "ratio",
    "durationSeconds",
    "scenes",
    "onScreenText",
    "voiceOverNotes",
    "audioReference",
    "coverDirection",
    "visualDirection",
    "references",
    "additionalNotes",
  ],
  long_form_video: [
    "ratio",
    "durationSeconds",
    "chapters",
    "visualDirection",
    "references",
    "additionalNotes",
  ],
  live_content: ["guests", "runOfShow", "visualDirection", "additionalNotes"],
  article: ["outline", "visualDirection", "references", "additionalNotes"],
  other: ["visualDirection", "references", "additionalNotes"],
};

export function designerEditableFieldsFor(format: ContentFormat): ReadonlyArray<string> {
  return DESIGNER_EDITABLE_FORMAT_FIELDS[format];
}
