"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import {
  type AspectRatioDiagnostic,
  type DiagnosticSeverity,
} from "@/lib/preview/instagram-aspect-ratios";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * AspectRatioDiagnosticView — the visual block rendered
 * under the Instagram preview. The component is pure
 * presentational: it takes a precomputed diagnostic and
 * shows severity, dimensions, and a one-line recommendation.
 *
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30).
 */
export interface AspectRatioDiagnosticViewProps {
  diagnostic: AspectRatioDiagnostic;
  /** When true, the diagnostic is part of a multi-asset
   *  check (e.g. a carousel). The header shows "Slide N". */
  slideLabel?: string;
}

const SEVERITY_ICON: Record<DiagnosticSeverity, React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const SEVERITY_TONE: Record<DiagnosticSeverity, string> = {
  ok: "text-success border-success/30 bg-success-subtle",
  warning: "text-warning border-warning/30 bg-warning-subtle",
  error: "text-danger border-danger/30 bg-danger-subtle",
};

const SEVERITY_TESTID: Record<DiagnosticSeverity, string> = {
  ok: "aspect-diagnostic-ok",
  warning: "aspect-diagnostic-warning",
  error: "aspect-diagnostic-error",
};

/**
 * Resolve a diagnostic's structured `message` into localized copy.
 *
 * The verdict used to be assembled as an English sentence inside
 * `diagnoseAspectRatio`, so this row stayed English on an Arabic
 * workspace — the one line that tells the planner whether the creative
 * will survive the crop. The lib stays pure and returns data; the words
 * are resolved here, through the same catalog as the rest of the preview.
 *
 * Exported for tests: the mapping is the contract, and it is easier to
 * assert directly than through the rendered markup.
 */
export function diagnosticCopy(
  diagnostic: AspectRatioDiagnostic,
  t: (key: string, params?: Record<string, string | number>) => string,
): { summary: string; recommendation: string } {
  const base = "contentDetail.preview.diagnostic.";
  const m = diagnostic.message;
  switch (m.kind) {
    case "unknown":
      return {
        summary: t(`${base}unknownSummary`),
        recommendation: t(`${base}unknownRecommendation`),
      };
    case "match":
      return {
        summary: t(`${base}matchSummary`, {
          width: m.width,
          height: m.height,
          ratio: m.ratio,
          label: m.label,
        }),
        recommendation: m.description,
      };
    case "belowMinimum":
      return {
        summary: t(`${base}belowMinimumSummary`, {
          width: m.width,
          height: m.height,
          ratio: m.ratio,
          label: m.label,
        }),
        recommendation: t(`${base}belowMinimumRecommendation`, {
          recommendedWidth: m.recommendedWidth,
          recommendedHeight: m.recommendedHeight,
          label: m.label,
        }),
      };
    case "noMatch":
      return {
        summary: t(`${base}noMatchSummary`, {
          width: m.width,
          height: m.height,
          ratio: m.ratio,
        }),
        recommendation: t(`${base}noMatchRecommendation`, {
          recommendedWidth: m.recommendedWidth,
          recommendedHeight: m.recommendedHeight,
          label: m.label,
        }),
      };
    case "noTarget":
      return {
        summary: t(`${base}noTargetSummary`, {
          width: m.width,
          height: m.height,
          ratio: m.ratio,
        }),
        recommendation: t(`${base}noTargetRecommendation`),
      };
  }
}

export function AspectRatioDiagnosticView({
  diagnostic,
  slideLabel,
}: AspectRatioDiagnosticViewProps) {
  const t = useLocaleT();
  const Icon = SEVERITY_ICON[diagnostic.severity];
  const tone = SEVERITY_TONE[diagnostic.severity];
  const copy = diagnosticCopy(diagnostic, t);
  return (
    <div
      className={`text-label mt-2 flex flex-col gap-1 rounded-[var(--radius-control)] border px-2 py-1.5 ${tone}`}
      data-testid={SEVERITY_TESTID[diagnostic.severity]}
      role={diagnostic.severity === "error" ? "alert" : "status"}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {slideLabel ? <span>{slideLabel} · </span> : null}
        <span>{copy.summary}</span>
        {diagnostic.belowMinimum ? (
          <span className="bg-warning/15 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            {t("contentDetail.preview.lowResolution")}
          </span>
        ) : null}
      </p>
      {copy.recommendation ? (
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{copy.recommendation}</span>
        </p>
      ) : null}
    </div>
  );
}
