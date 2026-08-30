"use client";

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import {
  type AspectRatioDiagnostic,
  type AspectRatioSpec,
  type DiagnosticSeverity,
} from "@/lib/preview/instagram-aspect-ratios";

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

export function AspectRatioDiagnosticView({
  diagnostic,
  slideLabel,
}: AspectRatioDiagnosticViewProps) {
  const Icon = SEVERITY_ICON[diagnostic.severity];
  const tone = SEVERITY_TONE[diagnostic.severity];
  return (
    <div
      className={`text-label mt-2 flex flex-col gap-1 rounded-[var(--radius-control)] border px-2 py-1.5 ${tone}`}
      data-testid={SEVERITY_TESTID[diagnostic.severity]}
      role={diagnostic.severity === "error" ? "alert" : "status"}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {slideLabel ? <span>{slideLabel} · </span> : null}
        <span>{diagnostic.summary}</span>
      </p>
      {diagnostic.recommendation ? (
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{diagnostic.recommendation}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Render a one-line "aspect check" header above a list of
 *  diagnostics. */
export function AspectRatioListHeader({
  title,
  candidates,
}: {
  title: string;
  candidates: ReadonlyArray<AspectRatioSpec>;
}) {
  return (
    <header className="mb-1">
      <h4 className="text-label text-fg-secondary font-semibold uppercase">{title}</h4>
      <p className="text-label text-fg-muted">
        {candidates.length === 1
          ? `Target: ${candidates[0]!.label}`
          : `Accepts: ${candidates.map((c) => c.label).join(", ")}`}
      </p>
    </header>
  );
}
