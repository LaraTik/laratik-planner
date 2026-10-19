import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Minus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReportingKpiCard({
  label,
  value,
  icon,
  delta,
  deltaState = "neutral",
  deltaLabel,
  status,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  delta?: string | undefined;
  deltaState?: "positive" | "negative" | "neutral";
  deltaLabel?: string | undefined;
  status?:
    | {
        label: string;
        tone: "available" | "partial" | "unavailable" | "delayed" | "estimated";
      }
    | undefined;
}) {
  const DeltaIcon =
    deltaState === "positive" ? ArrowUpRight : deltaState === "negative" ? ArrowDownRight : Minus;
  const StatusIcon =
    status?.tone === "available"
      ? CheckCircle2
      : status?.tone === "delayed"
        ? Clock3
        : status?.tone === "unavailable"
          ? AlertTriangle
          : AlertTriangle;

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
        {status ? (
          <p
            className={cn(
              "text-label mt-2 inline-flex items-center gap-1 font-medium",
              status.tone === "available"
                ? "text-success"
                : status.tone === "unavailable"
                  ? "text-danger"
                  : status.tone === "delayed"
                    ? "text-warning"
                    : "text-fg-muted",
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {status.label}
          </p>
        ) : null}
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
