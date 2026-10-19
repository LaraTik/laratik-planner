import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReportingKpiCard({
  label,
  value,
  icon,
  delta,
  deltaState = "neutral",
  deltaLabel,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  delta?: string | undefined;
  deltaState?: "positive" | "negative" | "neutral";
  deltaLabel?: string | undefined;
}) {
  const DeltaIcon =
    deltaState === "positive" ? ArrowUpRight : deltaState === "negative" ? ArrowDownRight : Minus;

  return (
    <Card className="reporting-card reporting-kpi">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-label text-fg-muted min-h-8 leading-4">{label}</p>
          {icon ? (
            <span className="bg-primary-subtle text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
              {icon}
            </span>
          ) : null}
        </div>
        <p className="text-title-card text-fg-primary mt-2 font-semibold tabular-nums">{value}</p>
        {delta ? (
          <p
            className={cn(
              "text-label mt-2 inline-flex items-center gap-1 font-semibold",
              deltaState === "positive"
                ? "text-success"
                : deltaState === "negative"
                  ? "text-danger"
                  : "text-fg-muted",
            )}
            aria-label={deltaLabel ? `${delta} ${deltaLabel}` : delta}
          >
            <DeltaIcon className="h-4 w-4" aria-hidden="true" />
            {delta}
            {deltaLabel ? <span className="sr-only">{deltaLabel}</span> : null}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
