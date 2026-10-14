import { Gauge, Sparkles, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/i18n/format-locale";
import type {
  BudgetPacingInsight,
  CampaignPerformanceInsight,
  CreativeFatigueInsight,
} from "@/lib/advertising/intelligence";

export type AdvertisingIntelligenceLabels = {
  title: string;
  description: string;
  campaignSignal: string;
  campaignSignalDescription: string;
  effective: string;
  underperforming: string;
  monitor: string;
  insufficient: string;
  budgetPacing: string;
  budgetPacingDescription: string;
  over: string;
  onTrack: string;
  under: string;
  unavailable: string;
  creativeHealth: string;
  creativeHealthDescription: string;
  fatiguing: string;
  stable: string;
  needsData: string;
  noComparison: string;
  noBudgetData: string;
  noFatigueData: string;
  sample: string;
  actual: string;
  expected: string;
  change: string;
  cpc: string;
};

export function AdvertisingIntelligencePanel({
  campaigns,
  pacing,
  fatigue,
  currency,
  locale,
  labels,
}: {
  campaigns: readonly CampaignPerformanceInsight[];
  pacing: readonly BudgetPacingInsight[];
  fatigue: readonly CreativeFatigueInsight[];
  currency: string | null;
  locale: string;
  labels: AdvertisingIntelligenceLabels;
}) {
  const effective = campaigns.filter((item) => item.status === "effective");
  const underperforming = campaigns.filter((item) => item.status === "underperforming");
  const over = pacing.filter((item) => item.status === "over");
  const onTrack = pacing.filter((item) => item.status === "on_track");
  const under = pacing.filter((item) => item.status === "under");
  const fatiguing = fatigue.filter((item) => item.status === "fatiguing");
  const stable = fatigue.filter((item) => item.status === "stable");

  return (
    <section
      aria-labelledby="advertising-intelligence-title"
      className="space-y-3"
      data-testid="advertising-intelligence"
    >
      <div>
        <h2
          id="advertising-intelligence-title"
          className="text-title-card text-fg-primary font-semibold"
        >
          {labels.title}
        </h2>
        <p className="text-label text-fg-muted mt-1">{labels.description}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card padding="md" data-testid="advertising-campaign-signals">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-body text-fg-primary font-semibold">{labels.campaignSignal}</h3>
              <p className="text-label text-fg-muted mt-1">{labels.campaignSignalDescription}</p>
            </div>
            <Sparkles className="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SignalCount label={labels.effective} value={effective.length} variant="success" />
            <SignalCount
              label={labels.underperforming}
              value={underperforming.length}
              variant="warning"
            />
          </div>
          <div className="mt-4 space-y-2">
            {effective.slice(0, 2).map((item) => (
              <SignalRow
                key={item.campaignId}
                label={item.name ?? item.campaignId}
                badge={labels.effective}
                variant="success"
              />
            ))}
            {underperforming.slice(0, 2).map((item) => (
              <SignalRow
                key={item.campaignId}
                label={item.name ?? item.campaignId}
                badge={labels.underperforming}
                variant="warning"
              />
            ))}
            {effective.length === 0 && underperforming.length === 0 ? (
              <p className="text-label text-fg-muted">{labels.noComparison}</p>
            ) : null}
          </div>
        </Card>

        <Card padding="md" data-testid="advertising-budget-pacing">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-body text-fg-primary font-semibold">{labels.budgetPacing}</h3>
              <p className="text-label text-fg-muted mt-1">{labels.budgetPacingDescription}</p>
            </div>
            <Gauge className="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <SignalCount label={labels.over} value={over.length} variant="warning" />
            <SignalCount label={labels.onTrack} value={onTrack.length} variant="success" />
            <SignalCount label={labels.under} value={under.length} variant="outline" />
          </div>
          <div className="mt-4 space-y-2">
            {pacing
              .filter((item) => item.status !== "unavailable")
              .slice(0, 3)
              .map((item) => (
                <div
                  key={item.campaignId}
                  className="text-label flex items-center justify-between gap-2"
                >
                  <span className="text-fg-primary min-w-0 truncate">
                    {item.name ?? item.campaignId}
                  </span>
                  <span className="text-fg-muted shrink-0 tabular-nums">
                    {item.paceRatio === null
                      ? labels.unavailable
                      : `${Math.round(item.paceRatio * 100)}%`}
                  </span>
                </div>
              ))}
            {pacing.every((item) => item.status === "unavailable") ? (
              <p className="text-label text-fg-muted">{labels.noBudgetData}</p>
            ) : null}
          </div>
        </Card>

        <Card padding="md" data-testid="advertising-creative-health">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-body text-fg-primary font-semibold">{labels.creativeHealth}</h3>
              <p className="text-label text-fg-muted mt-1">{labels.creativeHealthDescription}</p>
            </div>
            <TriangleAlert className="text-primary h-5 w-5 shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SignalCount label={labels.fatiguing} value={fatiguing.length} variant="warning" />
            <SignalCount label={labels.stable} value={stable.length} variant="success" />
          </div>
          <div className="mt-4 space-y-2">
            {fatiguing.slice(0, 2).map((item) => (
              <div key={item.adId} className="text-label flex items-center justify-between gap-2">
                <span className="text-fg-primary min-w-0 truncate">{item.name ?? item.adId}</span>
                <Badge variant="warning">{labels.fatiguing}</Badge>
              </div>
            ))}
            {fatiguing.length === 0 &&
            fatigue.every((item) => item.status === "insufficient_data") ? (
              <p className="text-label text-fg-muted">{labels.noFatigueData}</p>
            ) : null}
          </div>
        </Card>
      </div>

      {underperforming.length > 0 || over.length > 0 || fatiguing.length > 0 ? (
        <Card padding="md" data-testid="advertising-intelligence-details">
          <div className="grid gap-5 lg:grid-cols-3">
            <InsightList
              title={labels.underperforming}
              items={underperforming.slice(0, 3).map((item) => ({
                key: item.campaignId,
                label: item.name ?? item.campaignId,
                detail: item.score === null ? labels.monitor : `${item.score.toFixed(2)}×`,
              }))}
              empty={labels.noComparison}
            />
            <InsightList
              title={labels.over}
              items={over.slice(0, 3).map((item) => ({
                key: item.campaignId,
                label: item.name ?? item.campaignId,
                detail:
                  item.expectedSpend === null
                    ? labels.unavailable
                    : `${formatMoney(item.actualSpend, currency, locale, labels.unavailable)} / ${formatMoney(item.expectedSpend, currency, locale, labels.unavailable)}`,
              }))}
              empty={labels.noBudgetData}
            />
            <InsightList
              title={labels.fatiguing}
              items={fatiguing.slice(0, 3).map((item) => ({
                key: item.adId,
                label: item.name ?? item.adId,
                detail: fatigueDetail(item.ctrChange, item.cpcChange, locale, labels),
              }))}
              empty={labels.noFatigueData}
            />
          </div>
        </Card>
      ) : null}
    </section>
  );
}

function SignalCount({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "success" | "warning" | "outline";
}) {
  return (
    <div className="bg-surface-subtle rounded-[var(--radius-control)] p-2">
      <Badge variant={variant}>{value}</Badge>
      <p className="text-label text-fg-muted mt-1 truncate">{label}</p>
    </div>
  );
}

function SignalRow({
  label,
  badge,
  variant,
}: {
  label: string;
  badge: string;
  variant: "success" | "warning";
}) {
  return (
    <div className="text-label flex items-center justify-between gap-2">
      <span className="text-fg-primary min-w-0 truncate">{label}</span>
      <Badge variant={variant}>{badge}</Badge>
    </div>
  );
}

function InsightList({
  title,
  items,
  empty,
}: {
  title: string;
  items: readonly { key: string; label: string; detail: string }[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="text-body text-fg-primary font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="text-label flex items-center justify-between gap-3">
            <span className="text-fg-primary min-w-0 truncate">{item.label}</span>
            <span className="text-fg-muted shrink-0 tabular-nums">{item.detail}</span>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="text-label text-fg-muted mt-2">{empty}</p> : null}
    </div>
  );
}

function fatigueDetail(
  ctrChange: number | null,
  cpcChange: number | null,
  locale: string,
  labels: AdvertisingIntelligenceLabels,
): string {
  const changes = [
    ctrChange === null
      ? null
      : `${labels.change} ${formatPercent(ctrChange, locale as "en" | "ar")}`,
    cpcChange === null ? null : `${labels.cpc} ${formatPercent(cpcChange, locale as "en" | "ar")}`,
  ].filter((value): value is string => value !== null);
  return changes.join(" · ") || labels.needsData;
}

function formatMoney(value: number, currency: string | null, locale: string, unavailable: string) {
  return currency ? formatCurrency(value, currency, locale as "en" | "ar") : unavailable;
}
