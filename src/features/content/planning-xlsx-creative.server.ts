import "server-only";

import { excelDateTime, type XlsxWorkbookSheet } from "@/lib/exports/xlsx";
import { humanFormat } from "@/lib/content/status";
import type { PlanningXlsxLabels } from "./planning-xlsx-export.server";
import type { CreativeExportData } from "./planning-xlsx-export-data.server";

type PlanningExportCreativeItem = Pick<
  import("@/lib/content/enriched-list").EnrichedContentItem,
  "id" | "title" | "format" | "plannedPublishAt" | "brief"
>;

export function makeCreativeExportSheets(
  items: readonly PlanningExportCreativeItem[],
  data: ReadonlyMap<string, CreativeExportData>,
  timezone: string,
  labels: PlanningXlsxLabels,
  channelId?: string,
): [XlsxWorkbookSheet, XlsxWorkbookSheet] {
  return [
    makeCreativeHandoffSheet(items, data, timezone, labels),
    makeChannelCopySheet(items, data, timezone, labels, channelId),
  ];
}

function makeCreativeHandoffSheet(
  items: readonly PlanningExportCreativeItem[],
  data: ReadonlyMap<string, CreativeExportData>,
  timezone: string,
  labels: PlanningXlsxLabels,
): XlsxWorkbookSheet {
  const headers = [
    labels.itemId,
    labels.plannedPublishAt,
    labels.title,
    labels.format,
    labels.brief,
    labels.contentLanguage,
    labels.caption,
    labels.hashtags,
    labels.hook,
    labels.mainMessage,
    labels.callToAction,
    labels.audience,
    labels.visualDirection,
    labels.onImageText,
    labels.onScreenText,
    labels.coverDirection,
    labels.voiceOverNotes,
    labels.formatOutline,
    labels.mediaRequired,
    labels.weekday,
    labels.requestedPlatforms,
    labels.requiredImageLinks,
    labels.designReadyLink,
    labels.references,
    labels.firstComment,
    labels.additionalNotes,
    labels.publicationStatus,
  ];
  const rows = [
    headers,
    ...items.map((item) => {
      const payload = data.get(item.id)?.payload ?? {};
      const creative = data.get(item.id);
      return [
        item.id,
        excelDateTime(item.plannedPublishAt, timezone),
        item.title,
        labels.formatLabels[item.format] ?? humanFormat(item.format),
        item.brief || null,
        textValue(payload.contentLanguage),
        textValue(payload.caption),
        listValue(payload.hashtags),
        textValue(payload.hook),
        textValue(payload.mainMessage),
        textValue(payload.callToAction),
        textValue(payload.audience),
        textValue(payload.visualDirection),
        textValue(payload.onImageText),
        textValue(payload.onScreenText),
        textValue(payload.coverDirection),
        textValue(payload.voiceOverNotes),
        formatOutline(payload),
        creative ? (creative.mediaRequired ? labels.yes : labels.no) : null,
        textValue(payload.weekday),
        textValue(payload.platforms),
        listValue(payload.requiredImageLinks),
        textValue(payload.designReadyLink),
        listValue(payload.references),
        textValue(payload.firstComment),
        textValue(payload.additionalNotes),
        textValue(payload.publicationStatus),
      ];
    }),
  ];
  return {
    name: labels.creativeHandoffTitle,
    rows,
    headerRows: [0],
    dateColumns: [1],
    columnWidths: [
      38, 21, 32, 20, 48, 15, 60, 36, 32, 32, 32, 28, 60, 48, 48, 40, 48, 60, 16, 18, 24, 48, 48,
      48, 48, 60, 24,
    ],
    rightToLeft: labels.locale === "ar",
    freezeRows: 1,
    autoFilter: true,
    wrapText: true,
  };
}

function makeChannelCopySheet(
  items: readonly PlanningExportCreativeItem[],
  data: ReadonlyMap<string, CreativeExportData>,
  timezone: string,
  labels: PlanningXlsxLabels,
  channelId?: string,
): XlsxWorkbookSheet {
  const rows = [
    [
      labels.itemId,
      labels.title,
      labels.channel,
      labels.plannedPublishAt,
      labels.channelCaption,
      labels.channelHashtags,
      labels.channelFirstComment,
      labels.channelDescription,
      labels.channelCallToAction,
      labels.channelCallToActionUrl,
      labels.destinationUrl,
      labels.contentLanguage,
      labels.captionSource,
      labels.hashtagsSource,
    ],
    ...items.flatMap((item) => {
      const creative = data.get(item.id);
      const sharedCaption = textValue(creative?.payload.caption);
      const sharedHashtags = stringList(creative?.payload.hashtags);
      return (creative?.channels ?? [])
        .filter((channel) => !channelId || channel.socialChannelId === channelId)
        .map((channel) => {
          const platformPayload = channel.platformPayload;
          const platformHashtags = stringList(platformPayload.hashtags);
          const channelCaption = textValue(platformPayload.caption) ?? channel.caption;
          const channelHashtags = platformHashtags.length ? platformHashtags : channel.hashtags;
          const captionSource = channelCaption
            ? labels.channelOverride
            : sharedCaption
              ? labels.sharedDraft
              : item.brief
                ? labels.briefFallback
                : labels.noContent;
          const hashtagsSource =
            platformHashtags.length || channel.hashtags.length
              ? labels.channelOverride
              : sharedHashtags.length
                ? labels.sharedDraft
                : labels.noContent;
          const callToAction = asRecord(platformPayload.callToAction);
          return [
            item.id,
            item.title,
            `${channel.platform}: ${channel.accountName}`,
            excelDateTime(channel.plannedPublishAtOverride ?? item.plannedPublishAt, timezone),
            channelCaption ?? sharedCaption ?? item.brief ?? null,
            channelHashtags.length
              ? channelHashtags.join("\n")
              : listValue(creative?.payload.hashtags),
            textValue(platformPayload.firstComment) ?? textValue(creative?.payload.firstComment),
            textValue(platformPayload.description) ?? textValue(creative?.payload.description),
            textValue(callToAction.label) ??
              channel.callToAction ??
              textValue(creative?.payload.callToAction),
            textValue(callToAction.url),
            textValue(platformPayload.destinationUrl),
            textValue(platformPayload.contentLanguage) ??
              textValue(creative?.payload.contentLanguage),
            captionSource,
            hashtagsSource,
          ];
        });
    }),
  ];
  return {
    name: labels.channelCopyTitle,
    rows,
    headerRows: [0],
    dateColumns: [3],
    columnWidths: [38, 32, 36, 21, 60, 40, 48, 56, 32, 48, 48, 15, 22, 22],
    rightToLeft: labels.locale === "ar",
    freezeRows: 1,
    autoFilter: true,
    wrapText: true,
  };
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function listValue(value: unknown): string | null {
  const values = stringList(value);
  return values.length ? values.join("\n") : null;
}

function formatOutline(payload: Record<string, unknown>): string | null {
  const outline = Array.isArray(payload.scenes)
    ? payload.scenes
    : Array.isArray(payload.slideOutline)
      ? payload.slideOutline
      : Array.isArray(payload.visualSlides)
        ? payload.visualSlides
        : Array.isArray(payload.chapters)
          ? payload.chapters
          : [];
  const lines = outline.map((entry, index) => {
    const part = asRecord(entry);
    const position = typeof part.position === "number" ? part.position : index + 1;
    const title = textValue(part.title) ?? textValue(part.summary) ?? "";
    const visual = textValue(part.visual);
    const duration = typeof part.durationSeconds === "number" ? ` (${part.durationSeconds}s)` : "";
    const start =
      typeof part.startsAtSeconds === "number" ? ` (${formatSeconds(part.startsAtSeconds)})` : "";
    return `${position}. ${title}${duration}${start}${visual ? ` — ${visual}` : ""}`;
  });
  return lines.length ? lines.join("\n") : null;
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
