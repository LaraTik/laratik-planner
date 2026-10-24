import { NextResponse, type NextRequest } from "next/server";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { exportPlanningWorkbook } from "@/features/content/server";
import { ALL_FORMATS, ALL_STATUSES } from "@/lib/content/status";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { auth } from "@/lib/auth/config";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { tForActive } from "@/lib/i18n/t-for-active";
import { workspaceMonthRange } from "@/lib/i18n/workspace-month";
import { parsePlanningFilterParams, type PlanningFilterInput } from "@/lib/planning/filter-params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXPORT_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
] as const;
const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const { t, code } = await tForActive();
  const url = new URL(request.url);
  const agencySlug = url.searchParams.get("agency");
  const workspaceSlug = url.searchParams.get("slug");
  if (!agencySlug || !workspaceSlug) {
    return NextResponse.json({ error: "missing_workspace" }, { status: 400 });
  }

  const workspace = await getAccessibleWorkspaceAtPath(
    { id: session.user.id },
    agencySlug,
    workspaceSlug,
  );
  if (!workspace) return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  if (!(await hasWorkspaceRole({ id: session.user.id }, workspace.id, [...EXPORT_ROLES]))) {
    return NextResponse.json({ error: "export_forbidden" }, { status: 403 });
  }

  const resolvedRange = resolveRange({
    preset: url.searchParams.get("range"),
    displayedMonth: url.searchParams.get("month"),
    startValue: url.searchParams.get("start"),
    endValue: url.searchParams.get("end"),
    timezone: workspace.timezone,
  });
  if (!resolvedRange) {
    return NextResponse.json({ error: t("planning.exportDateRangeError") }, { status: 400 });
  }

  const search = url.searchParams.get("search") ?? undefined;
  if (search && search.length > 80) {
    return NextResponse.json({ error: t("planning.exportInvalidFilters") }, { status: 400 });
  }
  const filterInput: PlanningFilterInput = {};
  const filterKeys = ["status", "stage", "format", "channel", "owner", "health", "risk"] as const;
  for (const key of filterKeys) {
    const value = url.searchParams.get(key);
    if (value !== null) filterInput[key] = value;
  }
  if (search) filterInput.search = search;
  const filters =
    url.searchParams.get("scope") === "all" ? undefined : parsePlanningFilterParams(filterInput);

  const statusLabels = Object.fromEntries(
    ALL_STATUSES.map((status) => [status, t(`planningFilters.statusLabels.${status}`, {})]),
  );
  const formatLabels = Object.fromEntries(
    ALL_FORMATS.map((format) => [format, t(`planningFilters.formatLabels.${format}`, {})]),
  );
  try {
    const data = await exportPlanningWorkbook({
      actor: { id: session.user.id },
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      timezone: workspace.timezone,
      start: resolvedRange.start,
      end: resolvedRange.end,
      startDate: resolvedRange.startDate,
      endDate: resolvedRange.endDate,
      ...(filters ? { filters } : {}),
      labels: {
        locale: code,
        summaryTitle: t("planning.exportSummarySheet"),
        scheduleTitle: t("planning.exportScheduleSheet"),
        creativeHandoffTitle: t("planning.exportCreativeHandoffSheet"),
        channelCopyTitle: t("planning.exportChannelCopySheet"),
        workspace: t("planning.exportWorkspace"),
        dateRange: t("planning.exportDateRange"),
        timezone: t("planning.exportTimezone"),
        activeFilters: t("planning.exportActiveFilters"),
        allItems: t("planning.exportAllItems"),
        itemCount: t("planning.exportItemCount"),
        count: t("planning.exportCount"),
        status: t("planning.exportStatus"),
        format: t("planning.exportFormat"),
        channel: t("planning.exportChannel"),
        plannedPublishAt: t("planning.exportPlannedPublishAt"),
        title: t("planning.exportTitle"),
        channels: t("planning.exportChannels"),
        owner: t("planning.exportOwner"),
        designer: t("planning.exportDesigner"),
        brief: t("planning.exportBrief"),
        itemId: t("planning.exportItemId"),
        contentLanguage: t("planning.exportContentLanguage"),
        caption: t("planning.exportCaption"),
        hashtags: t("planning.exportHashtags"),
        hook: t("planning.exportHook"),
        mainMessage: t("planning.exportMainMessage"),
        callToAction: t("planning.exportCallToAction"),
        audience: t("planning.exportAudience"),
        visualDirection: t("planning.exportVisualDirection"),
        onImageText: t("planning.exportOnImageText"),
        onScreenText: t("planning.exportOnScreenText"),
        coverDirection: t("planning.exportCoverDirection"),
        voiceOverNotes: t("planning.exportVoiceOverNotes"),
        formatOutline: t("planning.exportFormatOutline"),
        mediaRequired: t("planning.exportMediaRequired"),
        yes: t("planning.exportYes"),
        no: t("planning.exportNo"),
        requiredImageLinks: t("planning.exportRequiredImageLinks"),
        designReadyLink: t("planning.exportDesignReadyLink"),
        references: t("planning.exportReferences"),
        firstComment: t("planning.exportFirstComment"),
        additionalNotes: t("planning.exportAdditionalNotes"),
        weekday: t("planning.exportWeekday"),
        requestedPlatforms: t("planning.exportRequestedPlatforms"),
        publicationStatus: t("planning.exportPublicationStatus"),
        channelCaption: t("planning.exportChannelCaption"),
        channelHashtags: t("planning.exportChannelHashtags"),
        channelFirstComment: t("planning.exportChannelFirstComment"),
        channelDescription: t("planning.exportChannelDescription"),
        channelCallToAction: t("planning.exportChannelCallToAction"),
        channelCallToActionUrl: t("planning.exportChannelCallToActionUrl"),
        destinationUrl: t("planning.exportDestinationUrl"),
        captionSource: t("planning.exportCaptionSource"),
        hashtagsSource: t("planning.exportHashtagsSource"),
        channelOverride: t("planning.exportChannelOverride"),
        sharedDraft: t("planning.exportSharedDraft"),
        briefFallback: t("planning.exportBriefFallback"),
        noContent: t("planning.exportNoContent"),
        noChannels: t("planning.noChannels"),
        statusLabels,
        formatLabels,
        stageLabels: Object.fromEntries(
          (filters?.stage ? [filters.stage] : []).map((stage) => [
            stage,
            t(`planningFilters.stageLabels.${stage}`, {}),
          ]),
        ),
        healthLabels: Object.fromEntries(
          (filters?.healthIn ?? []).map((health) => [
            health,
            t(`planningFilters.healthLabels.${health}`, {}),
          ]),
        ),
        statusFilter: t("planning.exportFilterStatus"),
        stageFilter: t("planning.exportFilterStage"),
        formatFilter: t("planning.exportFilterFormat"),
        channelFilter: t("planning.exportFilterChannel"),
        ownerFilter: t("planning.exportFilterOwner"),
        readinessFilter: t("planning.exportFilterReadiness"),
        riskFilter: t("planning.exportFilterRisk"),
        searchFilter: t("planning.exportFilterSearch"),
        selected: t("planning.exportSelected"),
        atRisk: t("planning.exportAtRisk"),
      },
    });

    const filename = `planning-${workspace.slug}-${resolvedRange.startDate}-${resolvedRange.endDate}.xlsx`;
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "planning_export_limit_exceeded") {
      return NextResponse.json({ error: t("planning.exportTooManyItems") }, { status: 413 });
    }
    throw error;
  }
}

function resolveRange(input: {
  preset: string | null;
  displayedMonth: string | null;
  startValue: string | null;
  endValue: string | null;
  timezone: string;
}): { start: Date; end: Date; startDate: string; endDate: string } | null {
  const now = new Date();
  const preset = input.preset ?? "view_month";
  if (preset === "custom") {
    const startParts = parseDate(input.startValue);
    const endParts = parseDate(input.endValue);
    if (!startParts || !endParts || input.startValue! > input.endValue!) return null;
    const start = fromZonedTime(
      new Date(startParts.year, startParts.month - 1, startParts.day),
      input.timezone,
    );
    const exclusiveEnd = new Date(endParts.year, endParts.month - 1, endParts.day + 1);
    const end = fromZonedTime(exclusiveEnd, input.timezone);
    return { start, end, startDate: input.startValue!, endDate: input.endValue! };
  }

  let year: number;
  let monthIndex: number;
  if (preset === "view_month") {
    const match = input.displayedMonth?.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    year = Number(match[1]);
    monthIndex = Number(match[2]) - 1;
    if (year < 1900 || monthIndex < 0 || monthIndex > 11) return null;
  } else {
    const zonedNow = toZonedTime(now, input.timezone);
    year = zonedNow.getFullYear();
    monthIndex = zonedNow.getMonth() + (preset === "next_month" ? 1 : 0);
    if (preset !== "current_month" && preset !== "next_month") return null;
  }

  const normalizedMonth = new Date(Date.UTC(year, monthIndex, 1));
  year = normalizedMonth.getUTCFullYear();
  monthIndex = normalizedMonth.getUTCMonth();

  const range = workspaceMonthRange(year, monthIndex, input.timezone);
  return {
    ...range,
    startDate: dateString(year, monthIndex + 1, 1),
    endDate: dateString(
      year,
      monthIndex + 1,
      new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
    ),
  };
}

function parseDate(value: string | null): { year: number; month: number; day: number } | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1900 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function dateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
