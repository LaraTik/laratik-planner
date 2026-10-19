"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/i18n/format-locale";

type AudienceRow = {
  reportDate: string;
  breakdown: string;
  dimensionValue: string;
  currency: string;
  spend: string;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
};

type AudienceBreakdown = "age" | "gender" | "country" | "placement";
type AudienceMetric = "spend" | "impressions" | "reach" | "clicks";

export type AdvertisingAudienceExplorerLabels = {
  title: string;
  description: string;
  empty: string;
  age: string;
  gender: string;
  country: string;
  placement: string;
  metric: string;
  spend: string;
  impressions: string;
  reach: string;
  clicks: string;
  shareOfSpend: string;
  showAll: string;
  showTop: string;
  rows: string;
  noBreakdown: string;
  limitations: string;
  attributionUnavailable: string;
  unavailable: string;
  tableLabel: string;
};

export function AdvertisingAudienceExplorer({
  rows,
  currency,
  locale,
  labels,
}: {
  rows: readonly AudienceRow[];
  currency: string | null;
  locale: string;
  labels: AdvertisingAudienceExplorerLabels;
}) {
  const availableBreakdowns = useMemo(
    () =>
      [
        ...new Set(rows.map((row) => normalizeBreakdown(row.breakdown)).filter(isBreakdown)),
      ] as AudienceBreakdown[],
    [rows],
  );
  const [breakdown, setBreakdown] = useState<AudienceBreakdown>(availableBreakdowns[0] ?? "age");
  const [metric, setMetric] = useState<AudienceMetric>("spend");
  const [showAll, setShowAll] = useState(false);
  const activeBreakdown = availableBreakdowns.includes(breakdown)
    ? breakdown
    : (availableBreakdowns[0] ?? "age");
  const activeRows = useMemo(() => {
    const filtered = rows.filter((row) => normalizeBreakdown(row.breakdown) === activeBreakdown);
    const grouped = new Map<string, AudienceRow>();
    for (const row of filtered) {
      const key = row.dimensionValue;
      const previous = grouped.get(key);
      if (!previous) {
        grouped.set(key, { ...row, reportDate: "aggregate" });
        continue;
      }
      grouped.set(key, {
        ...previous,
        spend: String(parseAmount(previous.spend) + parseAmount(row.spend)),
        impressions: sumNullable(previous.impressions, row.impressions),
        clicks: sumNullable(previous.clicks, row.clicks),
        // Audience reach is not additive across daily observations. Keep it
        // only when every observation agrees; otherwise make the limitation
        // visible instead of implying a unique-period reach total.
        reach: previous.reach === row.reach ? previous.reach : null,
      });
    }
    return [...grouped.values()].sort(
      (left, right) => (metricValue(right, metric) ?? -1) - (metricValue(left, metric) ?? -1),
    );
  }, [activeBreakdown, metric, rows]);
  const rowsToDisplay = showAll ? activeRows : activeRows.slice(0, 5);
  const totalSpend = activeRows.reduce((sum, row) => sum + parseAmount(row.spend), 0);

  return (
    <Card id="advertising-reporting-audience" data-testid="advertising-reporting-audience">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="text-primary h-4 w-4" aria-hidden="true" />
            {labels.title}
          </CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </div>
        {activeRows.length > 5 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setShowAll((value) => !value)}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            {showAll ? labels.showTop : labels.showAll}
          </Button>
        ) : null}
      </CardHeader>
      {rows.length === 0 ? (
        <p className="text-label text-fg-secondary px-4 pb-4 sm:px-5">{labels.empty}</p>
      ) : (
        <>
          <div className="space-y-3 px-4 pb-4 sm:px-5">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={labels.title}>
              {(
                [
                  ["age", labels.age],
                  ["gender", labels.gender],
                  ["country", labels.country],
                  ["placement", labels.placement],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={activeBreakdown === value}
                  disabled={!availableBreakdowns.includes(value)}
                  className="border-border text-label text-fg-primary focus-visible:ring-focus-ring data-[selected=true]:border-primary data-[selected=true]:bg-primary-subtle data-[selected=true]:text-primary inline-flex min-h-11 items-center rounded-full border px-3 font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                  data-selected={activeBreakdown === value}
                  onClick={() => {
                    setBreakdown(value);
                    setShowAll(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="advertising-audience-metric"
                className="text-label text-fg-muted font-semibold"
              >
                {labels.metric}
              </label>
              <select
                id="advertising-audience-metric"
                value={metric}
                onChange={(event) => setMetric(event.target.value as AudienceMetric)}
                className="border-border bg-surface text-label text-fg-primary focus-visible:ring-focus-ring min-h-11 rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
              >
                <option value="spend">{labels.spend}</option>
                <option value="impressions">{labels.impressions}</option>
                <option value="reach">{labels.reach}</option>
                <option value="clicks">{labels.clicks}</option>
              </select>
            </div>
            <div className="border-info/20 bg-info-subtle text-label text-info flex items-start gap-2 rounded-[var(--radius-control)] border p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{labels.limitations}</p>
            </div>
          </div>
          {activeRows.length === 0 ? (
            <p className="text-label text-fg-secondary px-4 pb-4 sm:px-5">{labels.noBreakdown}</p>
          ) : (
            <div
              aria-label={labels.tableLabel}
              className="overflow-x-auto"
              role="region"
              tabIndex={0}
            >
              <table className="text-body w-full min-w-[680px] text-start">
                <caption className="sr-only">{labels.tableLabel}</caption>
                <thead className="bg-surface-subtle text-label text-fg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold" scope="col">
                      {labels[activeBreakdown]}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {labels[metric]}
                    </th>
                    <th className="px-4 py-3 text-end font-semibold" scope="col">
                      {labels.shareOfSpend}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {rowsToDisplay.map((row) => {
                    const value = metricValue(row, metric);
                    const share = totalSpend > 0 ? parseAmount(row.spend) / totalSpend : null;
                    return (
                      <tr key={`${row.breakdown}-${row.dimensionValue}`}>
                        <th className="px-4 py-3 text-start font-semibold" scope="row">
                          {row.dimensionValue}
                        </th>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {formatMetric(value, metric, currency, locale, labels.unavailable)}
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">
                          {share === null ? labels.unavailable : formatPercent(share, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-label text-fg-muted flex items-start gap-2 px-4 pt-3 sm:px-5">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {labels.attributionUnavailable}
          </p>
        </>
      )}
    </Card>
  );
}

function normalizeBreakdown(value: string): AudienceBreakdown | null {
  const normalized = value.toLowerCase().replace(/[\s_-]/g, "");
  if (normalized === "age" || normalized === "agerange") return "age";
  if (normalized === "gender") return "gender";
  if (normalized === "country" || normalized === "countries" || normalized === "geolocation") {
    return "country";
  }
  if (
    normalized === "placement" ||
    normalized === "placements" ||
    normalized === "publisherplatform"
  ) {
    return "placement";
  }
  return null;
}

function isBreakdown(value: AudienceBreakdown | null): value is AudienceBreakdown {
  return value !== null;
}

function metricValue(row: AudienceRow, metric: AudienceMetric): number | null {
  if (metric === "spend") return parseAmount(row.spend);
  return row[metric];
}

function sumNullable(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function formatMetric(
  value: number | null,
  metric: AudienceMetric,
  currency: string | null,
  locale: string,
  unavailable: string,
) {
  if (value === null) return unavailable;
  if (metric === "spend") {
    return currency ? formatCurrency(value, currency, locale as "en" | "ar") : unavailable;
  }
  return formatNumber(value, locale as "en" | "ar");
}

function parseAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    numberingSystem: "latn",
  }).format(value);
}
