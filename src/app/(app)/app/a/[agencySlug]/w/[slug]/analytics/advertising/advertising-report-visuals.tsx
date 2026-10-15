import { BarChart3, CircleDollarSign, PieChart, TrendingUp } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/i18n/format-locale";
import type {
  AdvertisingCampaignSummary,
  AdvertisingDailySpend,
} from "@/lib/advertising/reporting-view";

export type AdvertisingReportVisualLabels = {
  spendTrendTitle: string;
  spendTrendDescription: string;
  spendTrendAccessible: string;
  performanceByObjectiveTitle: string;
  performanceByObjectiveDescription: string;
  noSpendData: string;
  noObjectiveData: string;
  unknownObjective: string;
  totalSpend: string;
  legendSpend: string;
};

export function AdvertisingReportVisuals({
  dailySpend,
  campaigns,
  currency,
  locale,
  labels,
}: {
  dailySpend: readonly AdvertisingDailySpend[];
  campaigns: readonly AdvertisingCampaignSummary[];
  currency: string | null;
  locale: string;
  labels: AdvertisingReportVisualLabels;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
      <SpendTrendCard dailySpend={dailySpend} currency={currency} locale={locale} labels={labels} />
      <ObjectiveBreakdownCard
        campaigns={campaigns}
        currency={currency}
        locale={locale}
        labels={labels}
      />
    </div>
  );
}

function SpendTrendCard({
  dailySpend,
  currency,
  locale,
  labels,
}: {
  dailySpend: readonly AdvertisingDailySpend[];
  currency: string | null;
  locale: string;
  labels: AdvertisingReportVisualLabels;
}) {
  const maxSpend = Math.max(...dailySpend.map((day) => day.spend), 0);
  const totalSpend = dailySpend.reduce((sum, day) => sum + day.spend, 0);
  const visibleDays = dailySpend.slice(-15);

  return (
    <Card data-testid="advertising-reporting-daily-spend" className="overflow-hidden">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="bg-primary-subtle text-primary flex h-9 w-9 items-center justify-center rounded-xl">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>{labels.spendTrendTitle}</CardTitle>
            <CardDescription>{labels.spendTrendDescription}</CardDescription>
          </div>
        </div>
        <span className="text-label text-fg-muted">{labels.legendSpend}</span>
      </CardHeader>
      {visibleDays.length === 0 ? (
        <p className="text-body text-fg-secondary">{labels.noSpendData}</p>
      ) : (
        <>
          <div className="relative mt-3 h-56" role="img" aria-label={labels.spendTrendAccessible}>
            <div className="border-border absolute inset-x-0 top-0 border-t" />
            <div className="border-border absolute inset-x-0 top-1/3 border-t" />
            <div className="border-border absolute inset-x-0 top-2/3 border-t" />
            <div className="border-border absolute inset-x-0 bottom-0 border-t" />
            <div className="absolute inset-x-0 top-2 bottom-5 flex items-end gap-1.5 sm:gap-2">
              {visibleDays.map((day) => (
                <div key={day.date} className="flex h-full min-w-0 flex-1 items-end">
                  <div
                    className="bg-primary/75 hover:bg-primary w-full rounded-t-md transition-colors"
                    style={{
                      height:
                        String(maxSpend > 0 ? Math.max((day.spend / maxSpend) * 100, 3) : 3) + "%",
                    }}
                    title={[day.date, ": ", formatMoney(day.spend, currency, locale)].join("")}
                  />
                </div>
              ))}
            </div>
            <div className="text-label text-fg-muted absolute inset-x-0 bottom-0 flex justify-between gap-2">
              <span dir="ltr">{visibleDays[0]?.date ?? "—"}</span>
              <span dir="ltr">{visibleDays.at(-1)?.date ?? "—"}</span>
            </div>
          </div>
          <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
            <span className="text-label text-fg-muted">{labels.totalSpend}</span>
            <span className="text-body text-fg-primary font-semibold tabular-nums">
              {formatMoney(totalSpend, currency, locale)}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function ObjectiveBreakdownCard({
  campaigns,
  currency,
  locale,
  labels,
}: {
  campaigns: readonly AdvertisingCampaignSummary[];
  currency: string | null;
  locale: string;
  labels: AdvertisingReportVisualLabels;
}) {
  const grouped = new Map<string, number>();
  for (const campaign of campaigns) {
    const key = campaign.objective ?? labels.unknownObjective;
    grouped.set(key, (grouped.get(key) ?? 0) + campaign.spend);
  }
  const entries = [...grouped.entries()].sort((left, right) => right[1] - left[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const colors = [
    "var(--chart-series-1)",
    "var(--chart-series-5)",
    "var(--chart-series-4)",
    "var(--chart-series-3)",
    "var(--chart-series-6)",
  ];
  const gradientStops = entries.slice(0, colors.length).map(([, value], index, visible) => {
    const before = visible.slice(0, index).reduce((sum, [, previous]) => sum + previous, 0);
    const start = total > 0 ? (before / total) * 100 : 0;
    const end = total > 0 ? ((before + value) / total) * 100 : 0;
    return colors[index] + " " + start + "% " + end + "%";
  });
  const gradient = gradientStops.length
    ? "conic-gradient(" + gradientStops.join(", ") + ")"
    : "var(--surface-subtle)";

  return (
    <Card data-testid="advertising-reporting-objectives">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="bg-info-subtle text-info flex h-9 w-9 items-center justify-center rounded-xl">
            <PieChart className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>{labels.performanceByObjectiveTitle}</CardTitle>
            <CardDescription>{labels.performanceByObjectiveDescription}</CardDescription>
          </div>
        </div>
        <BarChart3 className="text-fg-muted h-4 w-4" aria-hidden="true" />
      </CardHeader>
      {entries.length === 0 ? (
        <p className="text-body text-fg-secondary">{labels.noObjectiveData}</p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(150px,0.8fr)_minmax(0,1fr)] sm:items-center">
          <div
            className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full"
            style={{ background: gradient }}
            role="img"
            aria-label={
              labels.performanceByObjectiveTitle + ": " + formatMoney(total, currency, locale)
            }
          >
            <div className="bg-surface flex h-24 w-24 flex-col items-center justify-center rounded-full text-center">
              <CircleDollarSign className="text-primary mb-1 h-4 w-4" aria-hidden="true" />
              <span className="text-label text-fg-muted">{labels.totalSpend}</span>
              <span className="text-body text-fg-primary font-semibold tabular-nums">
                {formatMoney(total, currency, locale)}
              </span>
            </div>
          </div>
          <ul className="space-y-3">
            {entries.slice(0, colors.length).map(([objective, value], index) => (
              <li key={objective} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: colors[index] }}
                    aria-hidden="true"
                  />
                  <span className="text-label text-fg-primary truncate">{objective}</span>
                </span>
                <span className="text-label text-fg-muted shrink-0 tabular-nums">
                  {total > 0 ? Math.round((value / total) * 100) + "%" : "0%"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function formatMoney(value: number, currency: string | null, locale: string) {
  return currency
    ? formatCurrency(value, currency, locale as "en" | "ar")
    : formatNumber(value, locale as "en" | "ar");
}
