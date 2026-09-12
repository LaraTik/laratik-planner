import { ExternalLink, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import {
  CLOUDFLARE_R2_STANDARD_PRICING,
  type CloudflareR2PricingMetric,
} from "@/lib/storage/r2-pricing";

type PricingCopy = {
  title: string;
  description: string;
  standard: string;
  notConnected: string;
  metric: string;
  included: string;
  price: string;
  storage: string;
  classA: string;
  classB: string;
  gbMonth: string;
  requests: string;
  millionRequests: string;
  note: string;
  source: string;
};

const METRICS: readonly CloudflareR2PricingMetric[] = ["storage", "classA", "classB"];

function formatNumber(value: number, locale: "en" | "ar") {
  return new Intl.NumberFormat(locale, {
    numberingSystem: "latn",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPrice(value: number, decimals: number) {
  return `$${value.toFixed(decimals)}`;
}

function metricLabel(metric: CloudflareR2PricingMetric, copy: PricingCopy) {
  return copy[metric];
}

function unitLabel(unit: "gb_month" | "requests" | "million_requests", copy: PricingCopy) {
  return copy[
    unit === "gb_month" ? "gbMonth" : unit === "requests" ? "requests" : "millionRequests"
  ];
}

export function CloudflareR2PricingCard({
  copy,
  locale,
}: {
  copy: PricingCopy;
  locale: "en" | "ar";
}) {
  return (
    <Card padding="lg" data-testid="cloudflare-r2-pricing">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <Info className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </div>
        </div>
        <Badge variant="outline">{copy.standard}</Badge>
      </div>

      <div className="border-border mt-6 overflow-hidden rounded-[var(--radius-control)] border">
        <div className="bg-surface-subtle text-label text-fg-muted hidden grid-cols-[minmax(0,1.4fr)_minmax(10rem,1fr)_minmax(12rem,1fr)] gap-4 px-4 py-3 font-semibold sm:grid">
          <span>{copy.metric}</span>
          <span>{copy.included}</span>
          <span>{copy.price}</span>
        </div>
        <div className="divide-border divide-y">
          {METRICS.map((metric) => {
            const item = CLOUDFLARE_R2_STANDARD_PRICING[metric];
            return (
              <div
                className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(10rem,1fr)_minmax(12rem,1fr)] sm:items-center sm:gap-4"
                key={metric}
              >
                <div>
                  <p className="text-body text-fg-primary font-semibold">
                    {metricLabel(metric, copy)}
                  </p>
                  <p className="text-label text-fg-muted mt-1 sm:hidden">{copy.included}</p>
                </div>
                <p className="text-body text-fg-primary" dir="ltr">
                  {formatNumber(item.freeAmount, locale)} {unitLabel(item.freeUnit, copy)}
                </p>
                <p className="text-body text-fg-primary sm:text-fg-secondary" dir="ltr">
                  <span className="sm:hidden">{copy.price}: </span>
                  {formatPrice(item.price, item.priceDecimals)} / {unitLabel(item.priceUnit, copy)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-border bg-surface-subtle mt-5 flex items-start gap-2 rounded-[var(--radius-control)] border p-3">
        <Info className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-label text-fg-secondary">
          <span className="font-semibold">{copy.notConnected}</span> {copy.note}
        </p>
      </div>

      <a
        href="https://developers.cloudflare.com/r2/pricing/"
        target="_blank"
        rel="noreferrer"
        className="text-primary focus-visible:ring-focus-ring mt-4 inline-flex min-h-[var(--control-touch)] items-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-sm font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        {copy.source}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </Card>
  );
}
