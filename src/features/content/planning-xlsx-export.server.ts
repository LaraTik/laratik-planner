import "server-only";

import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import {
  listWorkspaceContentEnriched,
  resolveActorRoles,
  type EnrichedContentItem,
  type ListEnrichedOptions,
} from "@/lib/content/enriched-list";
import { humanFormat, humanStatus } from "@/lib/content/status";
import type { PlanningFilterSelection } from "@/lib/planning/filter-params";
import { excelDateTime, workbookToXlsx, type XlsxWorkbookSheet } from "@/lib/exports/xlsx";
import { makeCreativeExportSheets } from "./planning-xlsx-creative.server";
import { loadCreativeExportData } from "./planning-xlsx-export-data.server";

const PAGE_SIZE = 500;
const MAX_EXPORT_ITEMS = 25_000;

export interface PlanningXlsxLabels {
  locale: string;
  summaryTitle: string;
  scheduleTitle: string;
  creativeHandoffTitle: string;
  channelCopyTitle: string;
  workspace: string;
  dateRange: string;
  timezone: string;
  activeFilters: string;
  allItems: string;
  itemCount: string;
  count: string;
  status: string;
  format: string;
  channel: string;
  plannedPublishAt: string;
  title: string;
  channels: string;
  owner: string;
  designer: string;
  brief: string;
  itemId: string;
  contentLanguage: string;
  caption: string;
  hashtags: string;
  hook: string;
  mainMessage: string;
  callToAction: string;
  audience: string;
  visualDirection: string;
  onImageText: string;
  onScreenText: string;
  coverDirection: string;
  voiceOverNotes: string;
  formatOutline: string;
  mediaRequired: string;
  yes: string;
  no: string;
  requiredImageLinks: string;
  designReadyLink: string;
  references: string;
  firstComment: string;
  additionalNotes: string;
  weekday: string;
  requestedPlatforms: string;
  publicationStatus: string;
  channelCaption: string;
  channelHashtags: string;
  channelFirstComment: string;
  channelDescription: string;
  channelCallToAction: string;
  channelCallToActionUrl: string;
  destinationUrl: string;
  captionSource: string;
  hashtagsSource: string;
  channelOverride: string;
  sharedDraft: string;
  briefFallback: string;
  noContent: string;
  noChannels: string;
  statusLabels: Record<string, string>;
  formatLabels: Record<string, string>;
  stageLabels: Record<string, string>;
  healthLabels: Record<string, string>;
  statusFilter: string;
  stageFilter: string;
  formatFilter: string;
  channelFilter: string;
  ownerFilter: string;
  readinessFilter: string;
  riskFilter: string;
  searchFilter: string;
  selected: string;
  atRisk: string;
}

export interface PlanningXlsxExportOptions {
  actor: Actor;
  workspaceId: string;
  workspaceName: string;
  timezone: string;
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  filters?: PlanningFilterSelection;
  labels: PlanningXlsxLabels;
}

export async function exportPlanningWorkbook(options: PlanningXlsxExportOptions): Promise<Buffer> {
  const { actor, workspaceId, workspaceName, timezone, start, end, startDate, endDate, labels } =
    options;
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
    ]),
    "export_planning_xlsx",
  );

  const filterOptions = toQueryFilters(options.filters);
  const actorRoles = await resolveActorRoles(actor, workspaceId);
  const now = new Date();
  const items: EnrichedContentItem[] = [];
  let cursor: ListEnrichedOptions["cursor"];
  let total = 0;

  while (true) {
    const page = await listWorkspaceContentEnriched(
      actor,
      workspaceId,
      {
        monthStart: start,
        monthEnd: end,
        ...filterOptions,
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      },
      now,
      actorRoles,
    );
    total = page.total;
    if (total > MAX_EXPORT_ITEMS) {
      throw new Error("planning_export_limit_exceeded");
    }
    items.push(
      ...page.items.filter((item) => {
        const healthMatches =
          !options.filters?.healthIn?.length || options.filters.healthIn.includes(item.health);
        const riskMatches =
          options.filters?.risk !== "at_risk" ||
          (item.plannedPublishAt < now &&
            ![
              "ready_to_publish",
              "partially_published",
              "published",
              "cancelled",
              "blocked",
              "draft",
            ].includes(item.status));
        return healthMatches && riskMatches;
      }),
    );
    const last = page.items.at(-1);
    if (page.items.length < PAGE_SIZE || !last) break;
    cursor = { plannedPublishAt: last.plannedPublishAt, id: last.id };
  }

  const selectedFilters = filterLabels(options.filters, labels);
  const filterSummary = selectedFilters.length ? selectedFilters.join(", ") : labels.allItems;
  const creativeData = await loadCreativeExportData(workspaceId, items);
  const schedule = makeScheduleSheet(items, timezone, labels);
  const [handoff, channelCopy] = makeCreativeExportSheets(
    items,
    creativeData,
    timezone,
    labels,
    options.filters?.channelId,
  );
  const summary = makeSummarySheet({
    items,
    workspaceName,
    timezone,
    period: `${startDate} – ${endDate}`,
    filterSummary,
    labels,
  });
  return workbookToXlsx([summary, schedule, handoff, channelCopy]);
}

function toQueryFilters(
  filters?: PlanningFilterSelection,
): Omit<ListEnrichedOptions, "monthStart" | "monthEnd" | "limit" | "cursor" | "offset"> {
  if (!filters) return {};
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.stage ? { stage: filters.stage } : {}),
    ...(filters.searchTerm ? { search: filters.searchTerm } : {}),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.format ? { format: filters.format } : {}),
    ...(filters.channelId ? { channelId: filters.channelId } : {}),
  };
}

function filterLabels(filters: PlanningFilterSelection | undefined, labels: PlanningXlsxLabels) {
  if (!filters) return [];
  const selected: string[] = [];
  if (filters.status) {
    selected.push(
      `${labels.statusFilter}: ${labels.statusLabels[filters.status] ?? humanStatus(filters.status)}`,
    );
  }
  if (filters.stage) {
    selected.push(
      `${labels.stageFilter}: ${labels.stageLabels[filters.stage] ?? humanStatus(filters.stage)}`,
    );
  }
  if (filters.format) {
    selected.push(
      `${labels.formatFilter}: ${labels.formatLabels[filters.format] ?? humanFormat(filters.format)}`,
    );
  }
  if (filters.channelId) selected.push(`${labels.channelFilter}: ${labels.selected}`);
  if (filters.ownerId) selected.push(`${labels.ownerFilter}: ${labels.selected}`);
  if (filters.healthIn?.length) {
    selected.push(
      `${labels.readinessFilter}: ${filters.healthIn
        .map((health) => labels.healthLabels[health] ?? humanStatus(health))
        .join(", ")}`,
    );
  }
  if (filters.risk) selected.push(`${labels.riskFilter}: ${labels.atRisk}`);
  if (filters.searchTerm) selected.push(`${labels.searchFilter}: ${filters.searchTerm}`);
  return selected;
}

function makeScheduleSheet(
  items: readonly EnrichedContentItem[],
  timezone: string,
  labels: PlanningXlsxLabels,
): XlsxWorkbookSheet {
  const rows = [
    [
      labels.plannedPublishAt,
      labels.title,
      labels.format,
      labels.channels,
      labels.status,
      labels.owner,
      labels.designer,
      labels.brief,
    ],
    ...items.map((item) => [
      excelDateTime(item.plannedPublishAt, timezone),
      item.title,
      labels.formatLabels[item.format] ?? humanFormat(item.format),
      item.channels.length
        ? item.channels.map((channel) => `${channel.platform}: ${channel.accountName}`).join("; ")
        : labels.noChannels,
      labels.statusLabels[item.status] ?? humanStatus(item.status),
      item.owner?.displayName ?? null,
      item.designer?.displayName ?? null,
      item.brief || null,
    ]),
  ];

  return {
    name: labels.scheduleTitle,
    rows,
    headerRows: [0],
    dateColumns: [0],
    columnWidths: [21, 32, 20, 42, 23, 24, 24, 56],
    rightToLeft: labels.locale === "ar",
    freezeRows: 1,
    autoFilter: true,
  };
}

function makeSummarySheet(input: {
  items: readonly EnrichedContentItem[];
  workspaceName: string;
  timezone: string;
  period: string;
  filterSummary: string;
  labels: PlanningXlsxLabels;
}): XlsxWorkbookSheet {
  const { items, workspaceName, timezone, period, filterSummary, labels } = input;
  const rows: (string | number | null)[][] = [
    [labels.summaryTitle, null],
    [labels.workspace, workspaceName],
    [labels.dateRange, period],
    [labels.timezone, timezone],
    [labels.activeFilters, filterSummary],
    [labels.itemCount, items.length],
    [null, null],
  ];
  const headerRows: number[] = [];

  appendGroup(
    rows,
    headerRows,
    labels.status,
    countBy(items, (item) => labels.statusLabels[item.status] ?? humanStatus(item.status)),
    labels.count,
  );
  appendGroup(
    rows,
    headerRows,
    labels.format,
    countBy(items, (item) => labels.formatLabels[item.format] ?? humanFormat(item.format)),
    labels.count,
  );
  appendGroup(
    rows,
    headerRows,
    labels.channel,
    countBy(items, (item) =>
      item.channels.length
        ? item.channels.map((channel) => `${channel.platform}: ${channel.accountName}`)
        : [labels.noChannels],
    ),
    labels.count,
  );

  return {
    name: labels.summaryTitle,
    rows,
    titleRows: [0],
    headerRows,
    columnWidths: [24, 58],
    rightToLeft: labels.locale === "ar",
    freezeRows: 1,
  };
}

function appendGroup(
  rows: (string | number | null)[][],
  headerRows: number[],
  heading: string,
  counts: Map<string, number>,
  countLabel: string,
) {
  if (rows.length > 0 && !rows.at(-1)?.every((cell) => cell === null)) rows.push([null, null]);
  headerRows.push(rows.length);
  rows.push([heading, countLabel]);
  for (const [label, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push([label, count]);
  }
}

function countBy(
  items: readonly EnrichedContentItem[],
  selector: (item: EnrichedContentItem) => string | readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const values = selector(item);
    for (const value of typeof values === "string" ? [values] : values) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}
