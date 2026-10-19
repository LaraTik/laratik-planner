import type { AdvertisingMetricKey, AdvertisingMetricSnapshot } from "./reporting-metrics";

export type ComparisonMode = "previous" | "previous_year" | "custom";
export type ComparisonSummary = {
  readonly mode: ComparisonMode;
  readonly since: string;
  readonly until: string;
  readonly comparable: boolean;
  readonly deltas: Partial<
    Record<
      AdvertisingMetricKey,
      { readonly absolute: number; readonly percent: number; readonly favorable: boolean | null }
    >
  >;
};

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function comparisonRange(args: {
  since: string;
  until: string;
  mode: ComparisonMode;
  customSince?: string | undefined;
  customUntil?: string | undefined;
}): { since: string; until: string } | null {
  if (args.mode === "custom") {
    if (!args.customSince || !args.customUntil || args.customSince > args.customUntil) return null;
    return { since: args.customSince, until: args.customUntil };
  }
  const days =
    Math.round((dateOnly(args.until).getTime() - dateOnly(args.since).getTime()) / 86_400_000) + 1;
  const offset = args.mode === "previous_year" ? 365 : days;
  return {
    since: iso(new Date(dateOnly(args.since).getTime() - offset * 86_400_000)),
    until: iso(new Date(dateOnly(args.until).getTime() - offset * 86_400_000)),
  };
}

export function buildComparisonSummary(args: {
  mode: ComparisonMode;
  since: string;
  until: string;
  primary: AdvertisingMetricSnapshot;
  comparison: AdvertisingMetricSnapshot;
  comparable?: boolean;
}): ComparisonSummary {
  const deltas: ComparisonSummary["deltas"] = {};
  const keys: readonly AdvertisingMetricKey[] = [
    "spend",
    "impressions",
    "allClicks",
    "linkClicks",
    "outboundClicks",
    "landingPageViews",
    "results",
    "costPerResult",
    "ctrAll",
    "ctrLink",
    "cpcAll",
    "cpcLink",
    "cpm",
    "reach",
    "frequency",
  ];
  for (const key of keys) {
    const current = args.primary[key];
    const previous = args.comparison[key];
    if (current === null || previous === null || previous === 0) continue;
    const absolute = current - previous;
    const percent = absolute / Math.abs(previous);
    const favorable =
      key === "costPerResult" || key === "cpcAll" || key === "cpcLink" || key === "cpm"
        ? percent <= 0
        : percent >= 0;
    deltas[key] = { absolute, percent, favorable };
  }
  return {
    mode: args.mode,
    since: args.since,
    until: args.until,
    comparable: args.comparable ?? true,
    deltas,
  };
}
