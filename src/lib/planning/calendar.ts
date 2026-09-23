import "server-only";
import { db } from "@/lib/db";
import {
  agencyTasks,
  agencies,
  contentItems,
  users,
  workspaceMemberships,
  workspaceSettings,
  workspaces,
} from "@/lib/db/schema";
import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import {
  hasWorkspaceRole,
  isAgencyAdmin,
  isAgencyMember,
  requirePolicy,
  type Actor,
} from "@/lib/auth/policy";
import { listWorkspaceContent } from "@/lib/content/service";
import {
  expandRecurrence,
  HolidayCalendarSchema,
  isHolidayDate,
  RecurrenceRuleSchema,
  resolveHolidaySet,
  type HolidayCalendar,
  type RecurrenceRule,
} from "@/lib/planning/recurrence";

/**
 * FEAT-13 (GAP-FULL-REVIEW-2026-08-25) — editorial-calendar view that
 * applies the workspace's recurrence rules and holiday suppression.
 *
 * The minimum viable contract (§11 "planned publish dates in the
 * workspace timezone") is that the calendar page renders every
 * planned publish in a `[monthStart, monthEnd)` window, including
 * the virtual occurrences of any recurring content. The page today
 * reads `listWorkspaceContent` which returns one row per base date;
 * recurring content needs to be expanded into multiple occurrences
 * and any occurrence on a holiday filtered out.
 *
 * The function is the single source of truth so the same view
 * powers the page, the (future) drag-to-reschedule UI, and any
 * downstream KPI counter. It returns a flat list of occurrences
 * — the page can group/sort as it sees fit.
 *
 * The recurrence rules are passed in via `opts.recurrenceRules`
 * keyed by `contentItemId` so the function is testable in
 * isolation. In production, the calendar page resolves the rules
 * from the workspace's templates (the `content_templates.relative_
 * schedule_rule` jsonb column) and the `content_items` schema will
 * eventually carry a per-item rule.
 */
export interface GetCalendarViewOptions {
  /**
   * Per-content-item recurrence rule. The page is responsible for
   * resolving rules from the content template library and (in
   * future) the per-item schema column. Missing IDs are treated
   * as "no recurrence — single occurrence on planned_publish_at".
   */
  recurrenceRules?: Record<string, RecurrenceRule | null | undefined>;
  /**
   * Holiday calendar override. When omitted, the function reads
   * the workspace settings column (a future additive migration);
   * today the override is required, or every item is shown.
   */
  holidayCalendar?: HolidayCalendar | null;
}

export interface CalendarOccurrence {
  /** The source content item id. */
  contentItemId: string;
  /** A stable id for this occurrence, used as a React key. */
  occurrenceId: string;
  /** The publish date for this occurrence (UTC midnight). */
  date: Date;
  /** True when this is a virtual occurrence from a recurrence rule. */
  isRecurrence: boolean;
}

export async function getCalendarView(
  actor: Actor,
  workspaceId: string,
  monthStart: Date,
  monthEnd: Date,
  opts: GetCalendarViewOptions = {},
): Promise<CalendarOccurrence[]> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
      "viewer",
    ]),
    "view_calendar",
  );

  // Fetch the workspace's holiday calendar from settings if the
  // caller didn't supply an override. The settings column is added
  // by a future migration; until then this is a no-op and the
  // caller MUST supply the calendar to get holiday filtering.
  let holidayCalendar: HolidayCalendar | null = opts.holidayCalendar ?? null;
  if (opts.holidayCalendar === undefined) {
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1);
    // The holiday calendar lives in a future jsonb column; for now
    // we fall back to "no holidays" if the override wasn't passed.
    holidayCalendar = null;
    void settings;
  }

  const holidays = resolveHolidaySet(holidayCalendar, monthStart, monthEnd);

  const items = await listWorkspaceContent(actor, workspaceId, {
    monthStart,
    monthEnd,
  });

  const rules = opts.recurrenceRules ?? {};
  const occurrences: CalendarOccurrence[] = [];
  for (const item of items) {
    if (item.plannedPublishAt < monthStart || item.plannedPublishAt >= monthEnd) {
      // The item is outside the month window but might be the base
      // date of a recurrence that lands inside it. The planner
      // query only returns the base date row, so we still need to
      // expand recurrences for items whose base is in-window.
      // Out-of-window base dates whose recurrence lands in-window
      // would be missed here; that case is handled by the caller
      // supplying a wider `monthStart` (or by the future schema
      // column being on the content item itself).
      continue;
    }
    const rawRule = rules[item.id];
    if (rawRule) {
      const parsed = RecurrenceRuleSchema.safeParse(rawRule);
      if (parsed.success) {
        const dates = expandRecurrence(parsed.data, item.plannedPublishAt, monthStart, monthEnd);
        for (const date of dates) {
          if (isHolidayDate(date, holidays)) continue;
          occurrences.push({
            contentItemId: item.id,
            occurrenceId: `${item.id}:${date.toISOString()}`,
            date,
            isRecurrence: true,
          });
        }
        continue;
      }
    }
    if (isHolidayDate(item.plannedPublishAt, holidays)) continue;
    occurrences.push({
      contentItemId: item.id,
      occurrenceId: `${item.id}:${item.plannedPublishAt.toISOString()}`,
      date: item.plannedPublishAt,
      isRecurrence: false,
    });
  }

  // Stable sort by date ascending then by item id.
  occurrences.sort((a, b) => {
    if (a.date.getTime() !== b.date.getTime()) return a.date.getTime() - b.date.getTime();
    return a.contentItemId.localeCompare(b.contentItemId);
  });

  return occurrences;
}

// Silence "unused import" — HolidayCalendarSchema is the
// re-export point for the calendar page; the function uses the
// resolved value, not the schema.
void HolidayCalendarSchema;

export type AgencyCalendarEvent = {
  id: string;
  kind: "plan" | "task";
  title: string;
  startsAt: Date;
  status: string;
  priority?: string;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceSlug: string | null;
  workspaceTimezone: string | null;
  assigneeName?: string | null;
  href: string;
};

export async function getAgencyTimezone(actor: Actor, agencyId: string): Promise<string> {
  if (!(await isAgencyMember(actor, agencyId))) throw new Error("calendar.forbidden");
  const [agency] = await db
    .select({ timezone: agencies.timezone })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  return agency?.timezone ?? "UTC";
}

/** Cross-workspace month view used by the agency calendar overview. */
export async function getAgencyCalendarView(
  actor: Actor,
  agencyId: string,
  monthStart: Date,
  monthEnd: Date,
): Promise<{ agencyTimezone: string; events: AgencyCalendarEvent[] }> {
  if (!(await isAgencyMember(actor, agencyId))) throw new Error("calendar.forbidden");
  const admin = await isAgencyAdmin(actor, agencyId);
  const planQuery = db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      status: contentItems.status,
      startsAt: contentItems.plannedPublishAt,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      workspaceTimezone: workspaces.timezone,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId));
  const scopedPlans = admin
    ? planQuery.where(
        and(
          eq(workspaces.agencyId, agencyId),
          isNull(contentItems.archivedAt),
          gte(contentItems.plannedPublishAt, monthStart),
          lt(contentItems.plannedPublishAt, monthEnd),
        ),
      )
    : planQuery
        .innerJoin(workspaceMemberships, eq(workspaceMemberships.workspaceId, workspaces.id))
        .where(
          and(
            eq(workspaces.agencyId, agencyId),
            eq(workspaceMemberships.userId, actor.id),
            eq(workspaceMemberships.status, "active"),
            isNull(contentItems.archivedAt),
            gte(contentItems.plannedPublishAt, monthStart),
            lt(contentItems.plannedPublishAt, monthEnd),
          ),
        );
  const [plans, tasks, [agency]] = await Promise.all([
    scopedPlans,
    db
      .select({
        id: agencyTasks.id,
        title: agencyTasks.title,
        status: agencyTasks.status,
        priority: agencyTasks.priority,
        startsAt: agencyTasks.dueAt,
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceSlug: workspaces.slug,
        workspaceTimezone: workspaces.timezone,
        assigneeName: users.displayName,
      })
      .from(agencyTasks)
      .leftJoin(workspaces, eq(workspaces.id, agencyTasks.workspaceId))
      .leftJoin(users, eq(users.id, agencyTasks.assigneeId))
      .where(
        and(
          eq(agencyTasks.agencyId, agencyId),
          isNull(agencyTasks.archivedAt),
          gte(agencyTasks.dueAt, monthStart),
          lt(agencyTasks.dueAt, monthEnd),
        ),
      )
      .orderBy(asc(agencyTasks.dueAt)),
    db
      .select({ timezone: agencies.timezone })
      .from(agencies)
      .where(eq(agencies.id, agencyId))
      .limit(1),
  ]);
  return {
    agencyTimezone: agency?.timezone ?? "UTC",
    events: [
      ...plans.map((plan) => ({
        ...plan,
        kind: "plan" as const,
        workspaceId: plan.workspaceId,
        href: `/app/w/${plan.workspaceSlug}/planning/${plan.id}`,
      })),
      ...tasks
        .filter((task): task is typeof task & { startsAt: Date } => task.startsAt !== null)
        .map((task) => ({ ...task, kind: "task" as const, href: `/app/tasks/${task.id}` })),
    ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
  };
}
