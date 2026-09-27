import Link from "next/link";
import { AlertOctagon, ExternalLink, Search } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { KpiTile } from "@/components/workspace/kpi-tile";
import { PageHeader } from "@/components/workspace/page-header";
import { PermissionNotice } from "@/components/platform/permission-notice";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { currentActor } from "@/lib/auth/current-actor";
import { requirePlatformPermission } from "@/lib/auth/platform-access";
import {
  listAppErrorGroups,
  listAppErrors,
  type AppErrorGroupRow,
  type AppErrorRow,
} from "@/lib/observability/app-errors";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { tForActive } from "@/lib/i18n/t-for-active";
import { cn } from "@/lib/utils";

/**
 * Platform console — recent app errors (OBS-002).
 *
 * This is the in-app mirror of the Sentry feed. The table reads from
 * `app_error_event`, which the `(app)/error.tsx` and
 * `app/global-error.tsx` boundaries write to. The page is gated on
 * `platform.console.read` (the same permission as the rest of the
 * platform console) so any platform admin / auditor / operator can
 * see the recent failure shape.
 *
 * Why an in-app mirror and not "just look at Sentry":
 *   - The mirror has zero SDK dependency, so a Sentry outage or
 *     misconfiguration does not take the debugging surface down with it.
 *   - It joins cleanly with the rest of the platform console (same
 *     layout, same role gating, same nav).
 *   - It is the *only* place the digest deep-link from `error.tsx`
 *     resolves to. The link in the user-facing error page is the
 *     primary funnel; the operator lands here.
 *
 * Retention is intentionally not implemented yet — a 30-day prune is
 * a follow-up after we collect usage data.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("platform.appErrorsTitle") };
}
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SEARCH_PARAM = "q";
const GROUP_PAGE_SIZE = 25;

type SearchParams = {
  page?: string;
  q?: string;
  focus?: string;
  /** `grouped` (default — one row per error class) or `events` (raw occurrences). */
  view?: string;
  /** Exact source filter. */
  source?: string;
  /** Time window: `24h` | `7d` | `30d`. */
  range?: string;
};

const SOURCE_LABEL_KEY: Record<string, string> = {
  "app.error": "platform.sourceAppError",
  "global.error": "platform.sourceGlobalError",
  server_action: "platform.sourceServerAction",
  "client.unhandled": "platform.sourceClientUnhandled",
  "server.render": "platform.sourceServerRender",
  "server.route": "platform.sourceServerRoute",
  "server.proxy": "platform.sourceServerProxy",
  "server.unhandled": "platform.sourceServerUnhandled",
};

const ERROR_SOURCES = Object.keys(SOURCE_LABEL_KEY);

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** Resolve the `range` filter into an absolute lower bound. */
function rangeSince(range: string | undefined): Date | undefined {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "24h" ? 1 : undefined;
  // No `range` means "all time" for the event view (it has its own
  // pagination), but the grouped view is a triage queue and defaults to
  // the last 7 days so it stays scannable.
  if (days === undefined) return undefined;
  return new Date(new Date().getTime() - days * 86_400_000);
}

export default async function PlatformErrorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await currentActor();
  const { t, code } = await tForActive();
  if (!actor) {
    return (
      <PermissionNotice
        title={t("platform.signInRequired")}
        description={t("platform.signInRequiredErrorsBody")}
      />
    );
  }
  try {
    await requirePlatformPermission(actor, "platform.console.read");
  } catch {
    return (
      <PermissionNotice
        title={t("platform.errorsUnavailable")}
        description={t("platform.errorsUnavailableBody")}
      />
    );
  }

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const query = (sp.q ?? "").trim();
  const view = sp.view === "events" ? "events" : "grouped";
  const sourceFilter = sp.source && ERROR_SOURCES.includes(sp.source) ? sp.source : undefined;
  const since = rangeSince(sp.range);

  // The grouped view is the triage queue: one row per distinct failure
  // with its occurrence count, so "this broke 47 times" is the first
  // thing on screen rather than 47 identical rows. The events view keeps
  // the original raw-occurrence log for hunting one specific failure.
  const groups =
    view === "grouped"
      ? await listAppErrorGroups({
          limit: GROUP_PAGE_SIZE,
          ...(query ? { query } : {}),
          ...(sourceFilter ? { source: sourceFilter } : {}),
          ...(since ? { since } : {}),
        })
      : [];

  const { rows, total, matched } = await listAppErrors({
    page,
    pageSize: PAGE_SIZE,
    ...(query ? { query } : {}),
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(since ? { since } : {}),
  });
  const totalPages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const showingFrom = matched === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(matched, page * PAGE_SIZE);

  // Total occurrences across the groups currently in view — the number
  // that actually answers "how bad is this".
  const groupOccurrenceTotal = groups.reduce((sum, group) => sum + group.occurrenceCount, 0);
  const openGroupCount = groups.filter((group) => !group.resolvedAt).length;

  // Capture the request-time clock once at the top of the server
  // component. `new Date().getTime()` is the same pattern used by
  // `/app/w/[slug]/page.tsx`; the strict react-hooks/purity rule
  // complains about the bare `Date.now()` call but accepts this
  // form (the value is only read once during render, never
  // mutated).
  const last7Cutoff = new Date().getTime() - 7 * 86_400_000;
  const last7Count = rows.filter((r) => r.createdAt.getTime() >= last7Cutoff).length;

  // Preserve the active view + filters across pagination and the
  // grouped/events toggle, so switching view does not silently drop a
  // filter the operator just set.
  const buildHref = (
    nextPage: number,
    nextQuery: string,
    nextView: "grouped" | "events" = view,
  ) => {
    const params = new URLSearchParams();
    if (nextView === "events") params.set("view", "events");
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextQuery) params.set(SEARCH_PARAM, nextQuery);
    if (sourceFilter) params.set("source", sourceFilter);
    if (sp.range) params.set("range", sp.range);
    const qs = params.toString();
    return qs ? `/app/platform/errors?${qs}` : "/app/platform/errors";
  };

  const errorColumns: DataTableColumnDef<AppErrorRow>[] = [
    {
      key: "time",
      header: t("platform.colWhen"),
      cell: (row) => (
        <div className="text-body text-fg-secondary">
          <p>{formatRelativeDate(row.createdAt, new Date(), code)}</p>
          <p className="text-label text-fg-muted font-mono">
            {row.createdAt.toISOString().replace("T", " ").slice(0, 19)}Z
          </p>
        </div>
      ),
    },
    {
      key: "route",
      header: t("platform.colRoute"),
      cell: (row) => (
        <code className="text-label text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono">
          {row.method ? `${row.method} ` : ""}
          {row.route}
        </code>
      ),
    },
    {
      key: "source",
      header: t("platform.colSource"),
      hideOn: "md",
      cell: (row) => (
        <Badge variant="outline">{t(SOURCE_LABEL_KEY[row.source] ?? row.source)}</Badge>
      ),
    },
    {
      key: "digest",
      header: t("platform.colDigest"),
      cell: (row) =>
        row.digest ? (
          <code className="text-label text-fg-secondary font-mono">{row.digest}</code>
        ) : (
          <span className="text-fg-muted text-label">—</span>
        ),
    },
    {
      key: "message",
      header: t("platform.colMessage"),
      cell: (row) => (
        <p className="text-body text-fg-primary max-w-md truncate" title={row.message}>
          {row.message}
        </p>
      ),
    },
    {
      key: "context",
      header: t("platform.colContext"),
      hideOn: "lg",
      cell: (row) => (
        <div className="text-label text-fg-muted space-y-0.5 font-mono">
          {row.requestId ? <p>req {row.requestId.slice(0, 8)}</p> : null}
          {row.actorId ? <p>actor {row.actorId.slice(0, 8)}</p> : null}
          {row.buildVersion ? <p>build {row.buildVersion.slice(0, 7)}</p> : null}
        </div>
      ),
    },
  ];

  const groupColumns: DataTableColumnDef<AppErrorGroupRow>[] = [
    {
      key: "count",
      header: t("platform.colOccurrences"),
      cell: (row) => (
        <span
          className={cn(
            "font-mono font-semibold",
            row.occurrenceCount > 1 ? "text-danger" : "text-fg-secondary",
          )}
          data-testid={`platform-error-group-count-${row.fingerprint}`}
        >
          {row.occurrenceCount}×
        </span>
      ),
    },
    {
      key: "message",
      header: t("platform.colMessage"),
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-body text-fg-primary max-w-md truncate" title={row.sampleMessage}>
            {row.sampleMessage}
          </p>
          <p className="text-label text-fg-muted font-mono">
            {row.errorName ?? "—"} ·{" "}
            <code title="Error-group fingerprint — the key the diagnostics MCP searches by">
              {row.fingerprint}
            </code>
          </p>
        </div>
      ),
    },
    {
      key: "route",
      header: t("platform.colRoute"),
      cell: (row) => (
        <code className="text-label text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono">
          {row.route}
        </code>
      ),
    },
    {
      key: "source",
      header: t("platform.colSource"),
      hideOn: "md",
      cell: (row) => (
        <Badge variant="outline">{t(SOURCE_LABEL_KEY[row.source] ?? row.source)}</Badge>
      ),
    },
    {
      key: "window",
      header: t("platform.colSeenWindow"),
      hideOn: "lg",
      cell: (row) => (
        <div className="text-label text-fg-muted space-y-0.5 font-mono">
          <p>first {row.firstSeenAt.toISOString().replace("T", " ").slice(0, 19)}Z</p>
          <p>last {row.lastSeenAt.toISOString().replace("T", " ").slice(0, 19)}Z</p>
        </div>
      ),
    },
    {
      key: "state",
      header: t("platform.colState"),
      cell: (row) =>
        row.resolvedAt ? (
          <Badge variant="outline" data-testid={`platform-error-group-resolved-${row.fingerprint}`}>
            {t("platform.groupResolved")}
          </Badge>
        ) : (
          <Badge variant="outline">{t("platform.groupOpen")}</Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6" data-testid="platform-errors">
      <PageHeader
        eyebrow={t("platform.eyebrow")}
        title={t("platform.appErrorsTitle")}
        description={t("platform.appErrorsDescription")}
        action={
          <Link
            href="/app/platform/overview"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("platform.backToOverview")}
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2" data-testid="platform-errors-view-toggle">
        <Link
          href={buildHref(1, query, "grouped")}
          className={cn(
            buttonVariants({ variant: view === "grouped" ? "default" : "ghost", size: "sm" }),
          )}
          aria-current={view === "grouped" ? "page" : undefined}
          data-testid="platform-errors-view-grouped"
        >
          {t("platform.viewGrouped")}
        </Link>
        <Link
          href={buildHref(1, query, "events")}
          className={cn(
            buttonVariants({ variant: view === "events" ? "default" : "ghost", size: "sm" }),
          )}
          aria-current={view === "events" ? "page" : undefined}
          data-testid="platform-errors-view-events"
        >
          {t("platform.viewEvents")}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="platform-errors-kpis">
        {view === "grouped" ? (
          <>
            <KpiTile
              label={t("platform.kpiOccurrences")}
              value={groupOccurrenceTotal}
              icon={<AlertOctagon className="h-4 w-4" />}
            />
            <KpiTile
              label={t("platform.kpiDistinct")}
              value={groups.length}
              tone={openGroupCount > 0 ? "warning" : "default"}
              icon={<Search className="h-4 w-4" />}
            />
            <KpiTile
              label={t("platform.kpiOpen")}
              value={openGroupCount}
              icon={<ExternalLink className="h-4 w-4" />}
            />
          </>
        ) : (
          <>
            <KpiTile
              label={t("platform.kpiTotalCaptured")}
              value={total}
              icon={<AlertOctagon className="h-4 w-4" />}
            />
            <KpiTile
              label={query ? t("platform.kpiMatching") : t("platform.kpiOnThisPage")}
              value={query ? matched : showingTo}
              tone={query ? "warning" : "default"}
              icon={<Search className="h-4 w-4" />}
            />
            <KpiTile
              label={t("platform.kpiLast7Days")}
              value={last7Count}
              icon={<ExternalLink className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <Card padding="none" className="overflow-hidden" data-testid="platform-errors-card">
        <form
          method="GET"
          action="/app/platform/errors"
          className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-3"
          data-testid="platform-errors-search"
        >
          <label htmlFor="platform-errors-search-input" className="sr-only">
            {t("platform.searchAria")}
          </label>
          <div className="relative min-w-64 flex-1">
            <Search
              className="text-fg-muted pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="platform-errors-search-input"
              type="search"
              name={SEARCH_PARAM}
              defaultValue={query}
              placeholder={t("platform.searchPlaceholder")}
              className="border-border bg-surface text-body text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring h-9 w-full rounded-[var(--radius-control)] border ps-8 pe-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            />
          </div>
          {page > 1 ? <input type="hidden" name="page" value="1" /> : null}
          {view === "events" ? <input type="hidden" name="view" value="events" /> : null}
          {sourceFilter ? <input type="hidden" name="source" value={sourceFilter} /> : null}
          {sp.range ? <input type="hidden" name="range" value={sp.range} /> : null}
          <label htmlFor="platform-errors-source" className="sr-only">
            {t("platform.filterSourceAria")}
          </label>
          <select
            id="platform-errors-source"
            name="source"
            defaultValue={sourceFilter ?? ""}
            className="border-border bg-surface text-body text-fg-primary h-9 rounded-[var(--radius-control)] border px-2"
            data-testid="platform-errors-source-filter"
          >
            <option value="">{t("platform.filterAllSources")}</option>
            {ERROR_SOURCES.map((value) => (
              <option key={value} value={value}>
                {t(SOURCE_LABEL_KEY[value] ?? value)}
              </option>
            ))}
          </select>
          <label htmlFor="platform-errors-range" className="sr-only">
            {t("platform.filterRangeAria")}
          </label>
          <select
            id="platform-errors-range"
            name="range"
            defaultValue={sp.range ?? ""}
            className="border-border bg-surface text-body text-fg-primary h-9 rounded-[var(--radius-control)] border px-2"
            data-testid="platform-errors-range-filter"
          >
            <option value="">{t("platform.filterAllTime")}</option>
            <option value="24h">{t("platform.filterLast24h")}</option>
            <option value="7d">{t("platform.filterLast7d")}</option>
            <option value="30d">{t("platform.filterLast30d")}</option>
          </select>
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            {t("platform.searchSubmit")}
          </button>
          {query || sourceFilter || sp.range ? (
            <Link
              href="/app/platform/errors"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {t("platform.searchClear")}
            </Link>
          ) : null}
        </form>

        {view === "grouped" ? (
          groups.length === 0 ? (
            <div className="p-6" data-testid="platform-errors-empty">
              <EmptyState
                icon={<AlertOctagon className="h-8 w-8" />}
                title={query ? t("platform.emptyNoMatch") : t("platform.emptyNoErrors")}
                description={
                  query ? t("platform.emptyNoMatchBody") : t("platform.emptyNoErrorsBody")
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                getRowKey={(row) => row.id}
                getRowTestId={(row) => `platform-error-group-row-${row.fingerprint}`}
                rows={groups}
                columns={groupColumns}
              />
            </div>
          )
        ) : rows.length === 0 ? (
          <div className="p-6" data-testid="platform-errors-empty">
            <EmptyState
              icon={<AlertOctagon className="h-8 w-8" />}
              title={query ? t("platform.emptyNoMatch") : t("platform.emptyNoErrors")}
              description={query ? t("platform.emptyNoMatchBody") : t("platform.emptyNoErrorsBody")}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <DataTable
                getRowKey={(row) => row.id}
                getRowTestId={(row) =>
                  row.id === sp.focus
                    ? `platform-error-row-${row.id}-focused`
                    : `platform-error-row-${row.id}`
                }
                rows={rows}
                columns={errorColumns}
              />
            </div>
            <div className="border-border text-label text-fg-secondary flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
              <span data-testid="platform-errors-pagination-info">
                {query
                  ? t("platform.paginationMatching", {
                      from: showingFrom,
                      to: showingTo,
                      total: matched,
                    })
                  : t("platform.paginationAll", {
                      from: showingFrom,
                      to: showingTo,
                      total: matched,
                    })}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={buildHref(page - 1, query)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    data-testid="platform-errors-prev"
                  >
                    {t("platform.paginationPrev")}
                  </Link>
                ) : null}
                <span className="text-fg-muted font-mono">
                  {t("platform.paginationPage", { page, total: totalPages })}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildHref(page + 1, query)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    data-testid="platform-errors-next"
                  >
                    {t("platform.paginationNext")}
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card padding="lg" variant="subtle" data-testid="platform-errors-explainer">
        <CardTitle>{t("platform.explainerTitle")}</CardTitle>
        <CardDescription>{t("platform.explainerBody")}</CardDescription>
      </Card>
    </div>
  );
}
