"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AdvertisingAdSetSummary,
  AdvertisingAdSummary,
  AdvertisingCampaignSummary,
} from "@/lib/advertising/reporting-view";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format-locale";

export type AdvertisingHierarchyExplorerLabels = {
  title: string;
  description: string;
  campaign: string;
  adSet: string;
  ad: string;
  spend: string;
  results: string;
  ctr: string;
  delivery: string;
  expand: string;
  collapse: string;
  noChildren: string;
  unavailable: string;
  tableLabel: string;
  active: string;
  columns: string;
  sort: string;
  sortName: string;
  sortSpend: string;
  sortResults: string;
  sortCtr: string;
};

type HierarchyColumn = "spend" | "results" | "ctr" | "delivery";
type HierarchySort = "name" | Exclude<HierarchyColumn, "delivery">;
const HIERARCHY_COLUMNS: readonly HierarchyColumn[] = ["spend", "results", "ctr", "delivery"];

export function AdvertisingHierarchyExplorer({
  campaigns,
  adSets,
  ads,
  currency,
  locale,
  labels,
  sort,
  visibleColumns: initialVisibleColumns,
}: {
  campaigns: readonly AdvertisingCampaignSummary[];
  adSets: readonly AdvertisingAdSetSummary[];
  ads: readonly AdvertisingAdSummary[];
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
  sort?: string | undefined;
  visibleColumns?: readonly string[] | undefined;
}) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<HierarchySort>(() => normalizeHierarchySort(sort));
  const [visibleColumns, setVisibleColumns] = useState<Set<HierarchyColumn>>(() =>
    normalizeVisibleColumns(initialVisibleColumns),
  );
  const sortedCampaigns = useMemo(
    () =>
      [...campaigns].sort((left, right) => {
        if (sortBy === "name") {
          return (left.name ?? left.campaignId).localeCompare(right.name ?? right.campaignId);
        }
        return hierarchySortValue(right, sortBy) - hierarchySortValue(left, sortBy);
      }),
    [campaigns, sortBy],
  );
  const toggle = (current: Set<string>, id: string, setValue: (value: Set<string>) => void) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setValue(next);
  };

  return (
    <Card
      id="advertising-reporting-campaigns"
      padding="none"
      className="overflow-hidden"
      data-testid="advertising-reporting-campaigns"
    >
      <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="text-primary h-4 w-4" aria-hidden="true" />
            {labels.title}
          </CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-label text-fg-muted font-semibold"
            htmlFor="advertising-hierarchy-sort"
          >
            {labels.sort}
          </label>
          <select
            id="advertising-hierarchy-sort"
            value={sortBy}
            onChange={(event) => {
              const nextSort = normalizeHierarchySort(event.target.value);
              setSortBy(nextSort);
              replaceViewParam("sort", nextSort);
            }}
            className="border-border bg-surface text-label text-fg-primary focus-visible:ring-focus-ring min-h-11 rounded-[var(--radius-control)] border px-2 font-semibold focus:outline-none focus-visible:ring-2"
          >
            <option value="spend">{labels.sortSpend}</option>
            <option value="results">{labels.sortResults}</option>
            <option value="ctr">{labels.sortCtr}</option>
            <option value="name">{labels.sortName}</option>
          </select>
          <details className="relative">
            <summary className="border-border text-label text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-11 cursor-pointer list-none items-center rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2">
              {labels.columns}
            </summary>
            <div className="border-border bg-surface absolute end-0 z-10 mt-1 grid min-w-44 gap-2 rounded-[var(--radius-control)] border p-3 shadow-md">
              {HIERARCHY_COLUMNS.map((column) => (
                <label
                  key={column}
                  className="text-label text-fg-primary flex min-h-11 items-center gap-2"
                >
                  <Checkbox
                    checked={visibleColumns.has(column)}
                    onCheckedChange={(checked) => {
                      const next = new Set(visibleColumns);
                      if (checked) next.add(column);
                      else if (next.size > 1) next.delete(column);
                      setVisibleColumns(next);
                      replaceViewParam("visibleColumns", [...next].join(","));
                    }}
                  />
                  {column === "spend"
                    ? labels.spend
                    : column === "results"
                      ? labels.results
                      : column === "ctr"
                        ? labels.ctr
                        : labels.delivery}
                </label>
              ))}
            </div>
          </details>
        </div>
      </CardHeader>
      <div aria-label={labels.tableLabel} className="overflow-x-auto" role="region" tabIndex={0}>
        <table className="text-body w-full min-w-[760px] text-start">
          <caption className="sr-only">{labels.tableLabel}</caption>
          <thead className="bg-surface-subtle text-label text-fg-muted">
            <tr>
              <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="col">
                {labels.campaign}
              </th>
              {visibleColumns.has("spend") ? (
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.spend}
                </th>
              ) : null}
              {visibleColumns.has("results") ? (
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.results}
                </th>
              ) : null}
              {visibleColumns.has("ctr") ? (
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.ctr}
                </th>
              ) : null}
              {visibleColumns.has("delivery") ? (
                <th className="px-4 py-3 text-start font-semibold" scope="col">
                  {labels.delivery}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {sortedCampaigns.map((campaign) => {
              const children = adSets.filter((adSet) => adSet.campaignId === campaign.campaignId);
              const expanded = expandedCampaigns.has(campaign.campaignId);
              return (
                <CampaignRows
                  key={campaign.campaignId}
                  campaign={campaign}
                  adSets={children}
                  ads={ads}
                  expanded={expanded}
                  expandedAdSets={expandedAdSets}
                  currency={currency}
                  locale={locale}
                  labels={labels}
                  visibleColumns={visibleColumns}
                  onToggle={() =>
                    toggle(expandedCampaigns, campaign.campaignId, setExpandedCampaigns)
                  }
                  onToggleAdSet={(id) => toggle(expandedAdSets, id, setExpandedAdSets)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {campaigns.length === 0 ? (
        <p className="text-label text-fg-secondary px-4 py-4 sm:px-5">{labels.unavailable}</p>
      ) : null}
    </Card>
  );
}

function CampaignRows({
  campaign,
  adSets,
  ads,
  expanded,
  expandedAdSets,
  currency,
  locale,
  labels,
  visibleColumns,
  onToggle,
  onToggleAdSet,
}: {
  campaign: AdvertisingCampaignSummary;
  adSets: readonly AdvertisingAdSetSummary[];
  ads: readonly AdvertisingAdSummary[];
  expanded: boolean;
  expandedAdSets: Set<string>;
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
  visibleColumns: ReadonlySet<HierarchyColumn>;
  onToggle: () => void;
  onToggleAdSet: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-surface">
        <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
          <EntityButton
            expanded={expanded}
            disabled={adSets.length === 0}
            label={campaign.name ?? campaign.campaignId}
            ariaLabel={`${expanded ? labels.collapse : labels.expand}: ${campaign.name ?? campaign.campaignId}`}
            onClick={onToggle}
          />
          <bdi className="text-label text-fg-muted block ps-7" dir="ltr">
            {campaign.campaignId}
          </bdi>
        </th>
        <MetricCells
          entity={campaign}
          currency={currency}
          locale={locale}
          labels={labels}
          visibleColumns={visibleColumns}
        />
      </tr>
      {expanded
        ? adSets.map((adSet) => {
            const adChildren = ads.filter((ad) => ad.adSetId === adSet.adSetId);
            const adSetExpanded = expandedAdSets.has(adSet.adSetId);
            return (
              <AdSetRows
                key={adSet.adSetId}
                adSet={adSet}
                ads={adChildren}
                expanded={adSetExpanded}
                currency={currency}
                locale={locale}
                labels={labels}
                visibleColumns={visibleColumns}
                onToggle={() => onToggleAdSet(adSet.adSetId)}
              />
            );
          })
        : null}
    </>
  );
}

function AdSetRows({
  adSet,
  ads,
  expanded,
  currency,
  locale,
  labels,
  visibleColumns,
  onToggle,
}: {
  adSet: AdvertisingAdSetSummary;
  ads: readonly AdvertisingAdSummary[];
  expanded: boolean;
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
  visibleColumns: ReadonlySet<HierarchyColumn>;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="bg-surface-subtle">
        <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
          <EntityButton
            expanded={expanded}
            disabled={ads.length === 0}
            label={adSet.name ?? adSet.adSetId}
            ariaLabel={`${expanded ? labels.collapse : labels.expand}: ${adSet.name ?? adSet.adSetId}`}
            onClick={onToggle}
            indent
          />
          <bdi className="text-label text-fg-muted block ps-12" dir="ltr">
            {adSet.adSetId}
          </bdi>
        </th>
        <MetricCells
          entity={adSet}
          currency={currency}
          locale={locale}
          labels={labels}
          visibleColumns={visibleColumns}
        />
      </tr>
      {expanded
        ? ads.map((ad) => (
            <tr key={ad.adId}>
              <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
                <span className="text-fg-primary block ps-16">{ad.name ?? ad.adId}</span>
                <bdi className="text-label text-fg-muted block ps-16" dir="ltr">
                  {ad.adId}
                </bdi>
              </th>
              <MetricCells
                entity={ad}
                currency={currency}
                locale={locale}
                labels={labels}
                visibleColumns={visibleColumns}
              />
            </tr>
          ))
        : null}
    </>
  );
}

function EntityButton({
  expanded,
  disabled,
  label,
  ariaLabel,
  onClick,
  indent = false,
}: {
  expanded: boolean;
  disabled: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      className={`text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-11 max-w-full items-center gap-1 text-start font-semibold focus:outline-none focus-visible:ring-2 ${indent ? "ps-5" : ""}`}
      aria-label={ariaLabel}
      aria-expanded={disabled ? undefined : expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {disabled ? (
        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : expanded ? (
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

function MetricCells({
  entity,
  currency,
  locale,
  labels,
  visibleColumns,
}: {
  entity: AdvertisingCampaignSummary | AdvertisingAdSetSummary | AdvertisingAdSummary;
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
  visibleColumns: ReadonlySet<HierarchyColumn>;
}) {
  return (
    <>
      {visibleColumns.has("spend") ? (
        <td className="px-4 py-3 text-end tabular-nums">
          {currency
            ? formatCurrency(entity.spend, currency, locale as "en" | "ar")
            : labels.unavailable}
        </td>
      ) : null}
      {visibleColumns.has("results") ? (
        <td className="px-4 py-3 text-end tabular-nums">
          {entity.results === null
            ? labels.unavailable
            : formatNumber(entity.results, locale as "en" | "ar")}
        </td>
      ) : null}
      {visibleColumns.has("ctr") ? (
        <td className="px-4 py-3 text-end tabular-nums">
          {entity.ctr === null
            ? labels.unavailable
            : formatPercent(entity.ctr, locale as "en" | "ar")}
        </td>
      ) : null}
      {visibleColumns.has("delivery") ? (
        <td className="px-4 py-3 text-start">
          {entity.status ? <Badge variant="outline">{entity.status}</Badge> : labels.unavailable}
        </td>
      ) : null}
    </>
  );
}

function hierarchySortValue(
  entity: AdvertisingCampaignSummary,
  sortBy: Exclude<HierarchySort, "name" | "delivery">,
): number {
  return sortBy === "spend"
    ? entity.spend
    : sortBy === "results"
      ? (entity.results ?? -1)
      : (entity.ctr ?? -1);
}

function normalizeHierarchySort(value: string | undefined): HierarchySort {
  return value === "name" || value === "results" || value === "ctr" ? value : "spend";
}

function normalizeVisibleColumns(values: readonly string[] | undefined): Set<HierarchyColumn> {
  const selected = new Set(
    (values ?? []).filter((value): value is HierarchyColumn =>
      HIERARCHY_COLUMNS.includes(value as HierarchyColumn),
    ),
  );
  return selected.size > 0 ? selected : new Set(HIERARCHY_COLUMNS);
}

function replaceViewParam(key: "sort" | "visibleColumns", value: string): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
}
