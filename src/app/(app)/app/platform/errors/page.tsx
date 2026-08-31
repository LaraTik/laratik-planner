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
import { listAppErrors, type AppErrorRow } from "@/lib/observability/app-errors";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
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
export const metadata = { title: "Platform · App errors" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SEARCH_PARAM = "q";

type SearchParams = {
  page?: string;
  q?: string;
  focus?: string;
};

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

const SOURCE_LABEL: Record<string, string> = {
  "app.error": "App error boundary",
  "global.error": "Global error boundary",
  server_action: "Server action",
  "client.unhandled": "Client (unhandled)",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

export default async function PlatformErrorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const actor = await currentActor();
  if (!actor) {
    return (
      <PermissionNotice
        title="Sign in required"
        description="Sign in to view platform app errors."
      />
    );
  }
  try {
    await requirePlatformPermission(actor, "platform.console.read");
  } catch {
    return (
      <PermissionNotice
        title="Platform errors unavailable"
        description="Your platform role does not include the console.read permission."
      />
    );
  }

  const sp = await searchParams;
  const page = parsePage(sp.page);
  const query = (sp.q ?? "").trim();
  const { rows, total, matched } = await listAppErrors({
    page,
    pageSize: PAGE_SIZE,
    ...(query ? { query } : {}),
  });
  const totalPages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const showingFrom = matched === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(matched, page * PAGE_SIZE);

  // Capture the request-time clock once at the top of the server
  // component. `new Date().getTime()` is the same pattern used by
  // `/app/w/[slug]/page.tsx`; the strict react-hooks/purity rule
  // complains about the bare `Date.now()` call but accepts this
  // form (the value is only read once during render, never
  // mutated).
  const last7Cutoff = new Date().getTime() - 7 * 86_400_000;
  const last7Count = rows.filter((r) => r.createdAt.getTime() >= last7Cutoff).length;

  const buildHref = (nextPage: number, nextQuery: string) => {
    const params = new URLSearchParams();
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextQuery) params.set(SEARCH_PARAM, nextQuery);
    const qs = params.toString();
    return qs ? `/app/platform/errors?${qs}` : "/app/platform/errors";
  };

  const errorColumns: DataTableColumnDef<AppErrorRow>[] = [
    {
      key: "time",
      header: "When",
      cell: (row) => (
        <div className="text-body text-fg-secondary">
          <p>{formatRelativeDate(row.createdAt)}</p>
          <p className="text-label text-fg-muted font-mono">
            {row.createdAt.toISOString().replace("T", " ").slice(0, 19)}Z
          </p>
        </div>
      ),
    },
    {
      key: "route",
      header: "Route",
      cell: (row) => (
        <code className="text-label text-fg-primary bg-surface-subtle rounded px-1.5 py-0.5 font-mono">
          {row.method ? `${row.method} ` : ""}
          {row.route}
        </code>
      ),
    },
    {
      key: "source",
      header: "Source",
      hideOn: "md",
      cell: (row) => <Badge variant="outline">{sourceLabel(row.source)}</Badge>,
    },
    {
      key: "digest",
      header: "Digest",
      cell: (row) =>
        row.digest ? (
          <code className="text-label text-fg-secondary font-mono">{row.digest}</code>
        ) : (
          <span className="text-fg-muted text-label">—</span>
        ),
    },
    {
      key: "message",
      header: "Message",
      cell: (row) => (
        <p className="text-body text-fg-primary max-w-md truncate" title={row.message}>
          {row.message}
        </p>
      ),
    },
    {
      key: "context",
      header: "Context",
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

  return (
    <div className="space-y-6" data-testid="platform-errors">
      <PageHeader
        eyebrow="Platform"
        title="App errors"
        description="Recent render failures captured by the app-router error boundaries. Sentry remains the long-term archive; this is the in-app mirror."
        action={
          <Link
            href="/app/platform/overview"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <DirAwareArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to overview
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="platform-errors-kpis">
        <KpiTile label="Total captured" value={total} icon={<AlertOctagon className="h-4 w-4" />} />
        <KpiTile
          label={query ? "Matching" : "On this page"}
          value={query ? matched : showingTo}
          tone={query ? "warning" : "default"}
          icon={<Search className="h-4 w-4" />}
        />
        <KpiTile
          label="Last 7 days"
          value={last7Count}
          icon={<ExternalLink className="h-4 w-4" />}
        />
      </div>

      <Card padding="none" className="overflow-hidden" data-testid="platform-errors-card">
        <form
          method="GET"
          action="/app/platform/errors"
          className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-3"
          data-testid="platform-errors-search"
        >
          <label htmlFor="platform-errors-search-input" className="sr-only">
            Search app errors
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
              placeholder="Search by route or message…"
              className="border-border bg-surface text-body text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring h-9 w-full rounded-[var(--radius-control)] border ps-8 pe-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            />
          </div>
          {page > 1 ? <input type="hidden" name="page" value="1" /> : null}
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
          >
            Search
          </button>
          {query ? (
            <Link
              href="/app/platform/errors"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Clear
            </Link>
          ) : null}
        </form>

        {rows.length === 0 ? (
          <div className="p-6" data-testid="platform-errors-empty">
            <EmptyState
              icon={<AlertOctagon className="h-8 w-8" />}
              title={query ? "No errors match that search" : "No app errors captured yet"}
              description={
                query
                  ? "Try a different route or message substring. The search is case-insensitive."
                  : "Render failures captured by the app-router error boundaries will appear here. The mirror is in-app; Sentry is the long-term archive."
              }
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
                  ? `Showing ${showingFrom}–${showingTo} of ${matched} matching`
                  : `Showing ${showingFrom}–${showingTo} of ${matched}`}
              </span>
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    href={buildHref(page - 1, query)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    data-testid="platform-errors-prev"
                  >
                    ← Previous
                  </Link>
                ) : null}
                <span className="text-fg-muted font-mono">
                  Page {page} / {totalPages}
                </span>
                {page < totalPages ? (
                  <Link
                    href={buildHref(page + 1, query)}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    data-testid="platform-errors-next"
                  >
                    Next →
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        )}
      </Card>

      <Card padding="lg" variant="subtle" data-testid="platform-errors-explainer">
        <CardTitle>What this shows</CardTitle>
        <CardDescription>
          Every row was captured by an app-router error boundary. The
          <code className="text-label bg-surface mx-1 rounded px-1.5 py-0.5 font-mono">digest</code>
          is the Next.js error digest (stable across retries). The
          <code className="text-label bg-surface mx-1 rounded px-1.5 py-0.5 font-mono">
            request id
          </code>
          links to the structured log line for the same request. The
          <code className="text-label bg-surface mx-1 rounded px-1.5 py-0.5 font-mono">build</code>
          is the commit SHA at the time of capture. For the full payload (sourcemaps, breadcrumbs,
          full stack) open the matching event in Sentry.
        </CardDescription>
      </Card>
    </div>
  );
}
