"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Search, X, Filter as FilterIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_FORMATS, ALL_STATUSES, humanFormat, humanStatus } from "@/lib/content/status";
import { ATTENTION_HEALTHS, type HealthSnapshot } from "@/lib/dashboard/health";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * PlanningFiltersBar — instant-update filter bar for the planning
 * list. Replaces the old form-submit-then-Apply pattern: every
 * control updates the URL on `change`, and the page re-renders
 * server-side with the new query.
 *
 * Why a client component: the search input debounces (300ms), the
 * select controls fire on `change` (not on submit), and the active
 * filter count chip is reactive. The component is a thin shell —
 * the server-rendered `<option>` lists and the URL are the
 * source of truth, so this client only mirrors the state, it does
 * not own it.
 *
 * Per Goal 33 #17: filters update immediately. The Apply button is
 * gone. A "Filters (N)" pill is rendered when any filter is active,
 * with a Clear-all action right next to it.
 */
export interface PlanningFiltersBarProps {
  basePath: string;
  monthParam: string;
  members: { id: string; label: string }[];
  /** Channels for the channel filter (sourced server-side). */
  channels?: { id: string; platform: string; accountName: string }[];
  /**
   * Optional translator. When provided, the 7 filter aria-labels +
   * the search placeholder render from `planningFilters.*`; when
   * omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

const HEALTH_LABEL: Record<HealthSnapshot, string> = {
  at_risk: "At risk",
  overdue: "Overdue",
  blocked: "Blocked",
  needs_review: "Needs review",
  not_started: "Not started",
  ready: "Ready",
  in_progress: "In progress",
  published: "Published",
  cancelled: "Cancelled",
  scheduled: "Scheduled",
};

const WORKFLOW_STAGES: { value: string; label: string }[] = [
  { value: "draft", label: "Planning" },
  { value: "content_review", label: "Review" },
  { value: "approved_for_design", label: "Design" },
  { value: "creative_review", label: "Creative Review" },
  { value: "ready_to_publish", label: "Ready to publish" },
  { value: "published", label: "Published" },
];

const selectClass =
  "border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1";

export function PlanningFiltersBar({
  basePath,
  monthParam,
  members,
  channels = [],
  t: tProp,
}: PlanningFiltersBarProps) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Helper to push a new URL with one param changed.
  const pushParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      // Reset to page 1 when any filter changes.
      next.delete("page");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounced search. The URL is the source of truth, so the input
  // is uncontrolled — typed value lives in `defaultValue` keyed by
  // the URL's current search param. When the URL changes, the
  // `key` prop changes, the input remounts, and the new URL value
  // becomes the default. The debounce effect pushes typed value
  // back to the URL.
  //
  // This is the React-idiomatic way to handle "controlled-feeling
  // input backed by URL state" without violating the setState-in-
  // effect rule. The trade-off: typing across an external URL
  // change is wiped — which is exactly what the user expects (the
  // URL IS the state, and the server has already re-rendered).
  const urlSearch = searchParams.get("search") ?? "";
  const [searchValue, setSearchValue] = React.useState(urlSearch);
  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (searchValue !== urlSearch) {
        pushParam("search", searchValue || null);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchValue, pushParam, urlSearch]);
  // When the URL changes (e.g. user clicks a deep link), resync
  // the input — but only if the user is not actively typing.
  const isFocusedRef = React.useRef(false);
  React.useEffect(() => {
    if (!isFocusedRef.current) setSearchValue(urlSearch);
  }, [urlSearch]);

  const activeCount = countActive(searchParams);
  const healthFilter = (searchParams.get("health") ?? "")
    .split(",")
    .filter(Boolean) as HealthSnapshot[];

  return (
    <div className="space-y-2" data-testid="planning-filters-bar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="text-fg-muted pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            name="search"
            aria-label={tr("planningFilters.searchAria", "Search by title or brief")}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onFocus={() => {
              isFocusedRef.current = true;
            }}
            onBlur={() => {
              isFocusedRef.current = false;
            }}
            placeholder={tr("planningFilters.searchPlaceholder", "Search title or brief")}
            maxLength={80}
            className={cn(selectClass, "w-48 ps-7")}
            data-testid="planning-search-input"
          />
        </div>

        <select
          aria-label={tr("planningFilters.statusAria", "Filter by status")}
          value={searchParams.get("status") ?? ""}
          onChange={(e) => pushParam("status", e.target.value || null)}
          className={selectClass}
          data-testid="planning-status-filter"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanStatus(s)}
            </option>
          ))}
        </select>

        <select
          aria-label={tr("planningFilters.formatAria", "Filter by format")}
          value={searchParams.get("format") ?? ""}
          onChange={(e) => pushParam("format", e.target.value || null)}
          className={selectClass}
          data-testid="planning-format-filter"
        >
          <option value="">All formats</option>
          {ALL_FORMATS.map((f) => (
            <option key={f} value={f}>
              {humanFormat(f)}
            </option>
          ))}
        </select>

        <select
          aria-label={tr("planningFilters.stageAria", "Filter by workflow stage")}
          value={searchParams.get("stage") ?? ""}
          onChange={(e) => pushParam("stage", e.target.value || null)}
          className={selectClass}
          data-testid="planning-stage-filter"
        >
          <option value="">All workflow stages</option>
          {WORKFLOW_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          aria-label={tr("planningFilters.channelAria", "Filter by channel")}
          value={searchParams.get("channel") ?? ""}
          onChange={(e) => pushParam("channel", e.target.value || null)}
          className={selectClass}
          data-testid="planning-channel-filter"
        >
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.accountName}
            </option>
          ))}
        </select>

        <select
          aria-label={tr("planningFilters.ownerAria", "Filter by owner")}
          value={searchParams.get("owner") ?? ""}
          onChange={(e) => pushParam("owner", e.target.value || null)}
          className={selectClass}
          data-testid="planning-owner-filter"
        >
          <option value="">All owners</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          aria-label={tr("planningFilters.healthAria", "Filter by health")}
          value={healthFilter[0] ?? ""}
          onChange={(e) => pushParam("health", e.target.value || null)}
          className={selectClass}
          data-testid="planning-health-filter"
        >
          <option value="">All health</option>
          {ATTENTION_HEALTHS.map((h) => (
            <option key={h} value={h}>
              {HEALTH_LABEL[h]}
            </option>
          ))}
          <option value="ready">Ready</option>
          <option value="not_started">Not started</option>
          <option value="scheduled">Scheduled</option>
        </select>

        <select
          aria-label={tr("planningFilters.densityAria", "List density")}
          value={searchParams.get("density") ?? "comfortable"}
          onChange={(e) =>
            pushParam("density", e.target.value === "comfortable" ? null : e.target.value)
          }
          className={selectClass}
          data-testid="planning-density-filter"
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </div>
      <div className="text-label text-fg-secondary flex flex-wrap items-center gap-2">
        {activeCount > 0 ? (
          <>
            <span
              className="border-border bg-surface-subtle text-fg-primary inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold"
              data-testid="planning-filters-active-count"
            >
              <FilterIcon className="h-3 w-3" aria-hidden="true" />
              {activeCount} active filter{activeCount === 1 ? "" : "s"}
            </span>
            <Link
              href={`${basePath}?month=${monthParam}`}
              className="text-fg-muted hover:text-fg-primary inline-flex items-center gap-1 underline-offset-2 hover:underline"
              data-testid="planning-clear-filters"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              Clear all
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}

function countActive(searchParams: URLSearchParams): number {
  const keys = ["search", "status", "format", "stage", "channel", "owner", "health", "risk"];
  let n = 0;
  for (const k of keys) {
    if (searchParams.get(k)) n += 1;
  }
  return n;
}
