import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { Activity, Filter as FilterIcon, History } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { users, workspaceMemberships } from "@/lib/db/schema";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTableToolbar, FilterChip } from "@/components/ui/data-table-toolbar";
import { ListPagination } from "@/components/ui/list-pagination";
import { EmptyState } from "@/components/feedback/empty-state";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { tForActive } from "@/lib/i18n/t-for-active";
import {
  buildListHref,
  hasActiveFilters,
  paginate,
  parseListFilters,
  type AllowedPageSize,
  type ListFilters,
} from "@/lib/list-page-utils";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";
import {
  type ActivityScope,
  type ListWorkspaceActivityFilters,
  listWorkspaceActivity,
  listWorkspaceActivityCounts,
} from "@/lib/workspace-activity/service";
import { buildActivityContext } from "@/lib/activity/resolve";
import { formatActivityEvent } from "@/lib/activity/format";
import { ActivityFeedCard } from "@/components/activity";
import type { ActivityRenderSpec } from "@/lib/activity/types";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("activity.title") };
}

/**
 * /app/w/[slug]/activity — the workspace-wide Activity feed.
 *
 * Replaces the old brand-kit-scoped activity at
 * `/app/w/[slug]/brand-kit/activity` (kept as a one-line redirect
 * shim to preserve existing deep links). Reads from a unified
 * `listWorkspaceActivity` helper that aggregates `activity_event`
 * + the four brand-kit tables.
 *
 * Filter chips: All / Content / Reviews / Brand kit / Planning /
 * Publications. Free-text search hits the row summary; the
 * "since 30 days" framing belongs to a future toolbar addition
 * (the current surface is "all-time" by default — weekly
 * digest-style emails are an out-of-scope v2).
 */
const SCOPE_CHIP_VALUES: ActivityScope[] = [
  "all",
  "content",
  "review",
  "brand_kit",
  "planning",
  "publication",
];

type ActivityUrlFilters = Pick<ListFilters, "q" | "status" | "role" | "size"> & {
  actorId: string;
  from: string;
  to: string;
};

type ActivityHrefNext = {
  q?: string;
  status?: string[];
  role?: string[];
  size?: AllowedPageSize;
  page?: number;
  actorId?: string;
  from?: string;
  to?: string;
};

function firstParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = searchParams[key];
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(`${value}T`);
}

function dateBoundary(value: string, timeZone: string, endOfDay: boolean): Date | null {
  if (!isCalendarDate(value)) return null;
  const [yearText, monthText, dayText] = value.split("-");
  if (!yearText || !monthText || !dayText) return null;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const wallClockDate = new Date(year, month - 1, day + (endOfDay ? 1 : 0), 0, 0, 0, 0);
  const instant = fromZonedTime(wallClockDate, timeZone);
  return endOfDay ? new Date(instant.getTime() - 1) : instant;
}

function buildActivityHref(args: {
  basePath: string;
  current: ActivityUrlFilters;
  next?: ActivityHrefNext;
}): string {
  const { basePath, current, next = {} } = args;
  const listNext: {
    q?: string;
    status?: string[];
    role?: string[];
    size?: AllowedPageSize;
    page?: number;
  } = {};
  if (next.q !== undefined) listNext.q = next.q;
  if (next.status !== undefined) listNext.status = next.status;
  if (next.role !== undefined) listNext.role = next.role;
  if (next.size !== undefined) listNext.size = next.size;
  if (next.page !== undefined) listNext.page = next.page;

  const href = buildListHref({
    basePath,
    current,
    next: listNext,
  });
  const url = new URL(href, "https://activity.local");
  const actorId = next.actorId ?? current.actorId;
  const from = next.from ?? current.from;
  const to = next.to ?? current.to;
  if (actorId) url.searchParams.set("actor", actorId);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  return `${url.pathname}${url.search}`;
}

export default async function WorkspaceActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { agencySlug, slug } = await params;
  const workspace = await getAccessibleWorkspaceAtPath({ id: session.user.id }, agencySlug, slug);
  if (!workspace) notFound();
  const { t, code } = await tForActive();
  const rawSearchParams = await searchParams;
  const filters = parseListFilters(rawSearchParams);
  const actorId = firstParam(rawSearchParams, "actor");
  const from = isCalendarDate(firstParam(rawSearchParams, "from"))
    ? firstParam(rawSearchParams, "from")
    : "";
  const to = isCalendarDate(firstParam(rawSearchParams, "to"))
    ? firstParam(rawSearchParams, "to")
    : "";
  const scopeRaw = (filters.role[0] ?? "all").toLowerCase();
  const validScope = (SCOPE_CHIP_VALUES as string[]).includes(scopeRaw)
    ? (scopeRaw as ActivityScope)
    : "all";

  const serviceFilters: ListWorkspaceActivityFilters = {
    scope: validScope,
    limit: filters.size,
  };
  if (filters.q) serviceFilters.query = filters.q;
  if (actorId) serviceFilters.actorId = actorId;
  const after = dateBoundary(from, workspace.timezone, false);
  const before = dateBoundary(to, workspace.timezone, true);
  if (after) serviceFilters.after = after;
  if (before) serviceFilters.before = before;

  const countFilters: { actorId?: string; after?: Date; before?: Date; query?: string } = {};
  if (actorId) countFilters.actorId = actorId;
  if (after) countFilters.after = after;
  if (before) countFilters.before = before;
  if (filters.q) countFilters.query = filters.q;

  const memberRows = await db
    .select({ id: users.id, name: users.displayName, email: users.email })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspace.id),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.email));
  const activityActors = Array.from(
    new Map(
      memberRows.map((member) => [
        member.id,
        { id: member.id, label: member.name || member.email },
      ]),
    ).values(),
  );

  const [feed, counts] = await Promise.all([
    listWorkspaceActivity({ id: workspace.id, slug: workspace.slug }, serviceFilters),
    listWorkspaceActivityCounts({ id: workspace.id, slug: workspace.slug }, countFilters),
  ]);

  const rows = feed.rows;

  // Build the resolver context for the visible rows. We only
  // include the page slice in the lookup so the batched
  // queries stay bounded. The resolver handles missing IDs by
  // falling back to "Unknown" labels with `data-*` test ids.
  const context = await buildActivityContext(
    workspace.id,
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      summary: row.summary,
      actorId: row.actor?.id ?? null,
      occurredAt: row.at,
      href: row.href,
      metadata: row.metadata ?? null,
      beforeData: row.beforeData ?? null,
      afterData: row.afterData ?? null,
      targetLabel: row.targetLabel,
      targetId: row.targetId ?? null,
    })),
    code,
  );

  // Format every visible row once on the server. The result is
  // a serialisable spec consumed by the shared `<ActivityEntry
  // />` (server-renderable). Per-row name resolution happens
  // through the resolver; the page never touches `db`.
  const specs: ActivityRenderSpec[] = rows.map((row) =>
    formatActivityEvent(
      {
        id: row.id,
        kind: row.kind,
        summary: row.summary,
        actorId: row.actor?.id ?? null,
        occurredAt: row.at,
        href: row.href,
        metadata: row.metadata ?? null,
        beforeData: row.beforeData ?? null,
        afterData: row.afterData ?? null,
        targetLabel: row.targetLabel,
        targetId: row.targetId ?? null,
      },
      context,
      t,
      {
        formatDate: (value) =>
          formatDate(value, code, {
            timeZone: workspace.timezone,
            ...DateFormat.dateTime,
          }),
        systemActorFallback: t("activity.systemActor"),
      },
    ),
  );

  const scopeLabelMap = new Map<string, string>(
    SCOPE_CHIP_VALUES.map((s) => [s, t(`activity.scopeLabels.${s}`)]),
  );
  // The spec carries the event `kind` (e.g. "publication") but
  // the chip on the workspace feed wants the *scope* (e.g.
  // "Publications"). Map per-row.
  const scopeByKind = (kind: string): string => {
    if (kind.startsWith("brand.")) return "brand_kit";
    return rows.find((r) => r.kind === kind)?.scope ?? "content";
  };
  const specScopeLabels = new Map<string, string>();
  for (const spec of specs) {
    const scope = scopeByKind(spec.kind);
    specScopeLabels.set(spec.id, scopeLabelMap.get(scope) ?? scope);
  }
  // Wrap into the existing `paginate` helper so the toolbar's pagination
  // contract stays identical to the Team & Access lists.
  const total = counts.all;
  const rowCount = feed.hasNext ? rows.length + 1 : rows.length;
  const totalPages = Math.max(1, Math.ceil(rowCount / filters.size));
  const paginated = paginate(rows, filters.page, filters.size);
  // Override the paginated math to reflect the cursor-based reality:
  // we asked for at most `limit` rows, but the source may have had
  // more. Compose the final "page" view here.
  const finalRows = paginated.rows;
  const finalFrom = paginated.from;
  const finalTo = paginated.to;
  const finalTotal = feed.hasNext ? rows.length + 1 : rows.length;
  const currentHrefFilters: ActivityUrlFilters = {
    q: filters.q,
    status: filters.status,
    role: validScope === "all" ? [] : [validScope],
    size: filters.size,
    actorId,
    from,
    to,
  };
  const prevHref =
    filters.page > 1
      ? buildActivityHref({
          basePath: `/app/w/${workspace.slug}/activity`,
          current: currentHrefFilters,
          next: { page: filters.page - 1 },
        })
      : null;
  const nextHref =
    filters.page < totalPages
      ? buildActivityHref({
          basePath: `/app/w/${workspace.slug}/activity`,
          current: currentHrefFilters,
          next: { page: filters.page + 1 },
        })
      : null;

  const filterActive =
    hasActiveFilters({
      ...filters,
      role: validScope === "all" ? [] : [validScope],
    }) || Boolean(actorId || from || to);

  return (
    <div className="space-y-6" data-testid="workspace-activity-root">
      <PageHeader
        eyebrow={workspace.name}
        title={t("activity.title")}
        description={<>{t("activity.description")}</>}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {SCOPE_CHIP_VALUES.map((scope) => (
          <KpiTile
            key={scope}
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            label={t(`activity.scopeLabels.${scope}`)}
            value={counts[scope as keyof typeof counts] ?? 0}
            tone={scope === validScope ? "success" : "default"}
            data-testid={`activity-kpi-${scope}`}
          />
        ))}
      </div>

      <Card padding="none" className="overflow-hidden">
        <CardHeader className="border-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="text-primary h-5 w-5" aria-hidden="true" />
            <CardTitle>{t("activity.feedTitle")}</CardTitle>
          </div>
          <p className="text-label text-fg-muted mt-0.5">
            {t("activity.feedDescription", { count: total })}
          </p>
        </CardHeader>

        <DataTableToolbar
          testIdPrefix="activity-toolbar"
          searchPlaceholder={t("activity.searchPlaceholder")}
          searchLabel={t("activity.searchLabel")}
          defaultSearchValue={filters.q}
          hiddenParams={{
            ...(filters.size !== 50 ? { size: String(filters.size) } : {}),
            ...(validScope !== "all" ? { role: validScope } : {}),
          }}
          clearHref={buildActivityHref({
            basePath: `/app/w/${workspace.slug}/activity`,
            current: currentHrefFilters,
            next: {
              q: "",
              status: [],
              role: [],
              page: 1,
              size: 50,
              actorId: "",
              from: "",
              to: "",
            },
          })}
          clearLabel={t("activity.searchClear")}
        >
          <FilterIcon className="text-fg-muted h-4 w-4" aria-hidden={true} />
          {SCOPE_CHIP_VALUES.map((scope) => (
            <FilterChip
              key={scope}
              name="role"
              value={scope}
              selected={validScope === scope}
              label={t(`activity.scopeLabels.${scope}`)}
              testId={`activity-filter-scope-${scope}`}
            />
          ))}
          <label className="text-label text-fg-secondary inline-flex min-h-9 items-center gap-2">
            <span>{t("activity.userFilterLabel")}</span>
            <select
              name="actor"
              defaultValue={actorId}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-9 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              data-testid="activity-filter-user"
            >
              <option value="">{t("activity.allUsers")}</option>
              {activityActors.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-label text-fg-secondary inline-flex min-h-9 items-center gap-2">
            <span>{t("activity.fromDate")}</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-9 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              data-testid="activity-filter-from"
            />
          </label>
          <label className="text-label text-fg-secondary inline-flex min-h-9 items-center gap-2">
            <span>{t("activity.toDate")}</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-9 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              data-testid="activity-filter-to"
            />
          </label>
        </DataTableToolbar>

        {finalRows.length === 0 ? (
          <div className="p-6" data-testid="activity-empty">
            <EmptyState
              icon={<Activity className="h-8 w-8" aria-hidden="true" />}
              title={filterActive ? t("activity.emptyNoMatch") : t("activity.emptyNoActivity")}
              description={
                filterActive ? t("activity.emptyNoMatchBody") : t("activity.emptyNoActivityBody")
              }
            />
          </div>
        ) : (
          (() => {
            const ids = new Set(finalRows.map((r) => r.id));
            const visibleSpecs = specs.filter((spec) => ids.has(spec.id));
            return (
              <ActivityFeedCard
                title=""
                specs={visibleSpecs}
                emptyTitle={t("activity.emptyNoActivity")}
                emptyBody={t("activity.emptyNoActivityBody")}
                scopeLabels={specScopeLabels}
                renderTime={(iso) =>
                  formatDate(iso, code, {
                    timeZone: workspace.timezone,
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                }
              />
            );
          })()
        )}

        {finalRows.length > 0 ? (
          <ListPagination
            testId="activity-pagination"
            page={paginated.page}
            totalPages={Math.max(totalPages, paginated.totalPages)}
            total={finalTotal}
            from={finalFrom}
            to={finalTo}
            prevHref={prevHref}
            nextHref={nextHref}
            counterLabel={t("activity.paginationAll", {
              from: finalFrom,
              to: finalTo,
              total: finalTotal,
            })}
            ariaLabel={t("activity.paginationAria")}
            prevLabel={t("activity.paginationPrev")}
            nextLabel={t("activity.paginationNext")}
            pageIndicator={t("activity.paginationPageOf", {
              page: paginated.page,
              total: Math.max(totalPages, paginated.totalPages),
            })}
          />
        ) : null}
      </Card>
    </div>
  );
}

/* ── helpers ──────────────────────────────────────────────────────────── */
// Local helpers for this page were retired in 2026-09-27 when the
// page migrated to the shared `<ActivityFeedCard />` + the
// `formatActivityEvent` formatter (see `src/lib/activity/format.ts`).
// The verb templates live in `messages/{en,ar}/activity.json`
// under `activity.verbs.<kind>` and are interpolated with the
// resolver-resolved user / channel / status names.
