"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyApprovalTemplateAction,
  applyLeadTimeTemplateAction,
  applyMonthlyTargetTemplateAction,
} from "../templates-actions";

/**
 * SettingsTemplateCard — one-click "Apply preset" affordance
 * for the settings templates page. Mirrors the brand-kit
 * TemplateCard but tailored to settings presets (the underlying
 * actions live next to the card so a single click writes
 * through the existing typed service wrappers).
 */
type Kind = "lead-times" | "approvals" | "monthly-target";

export interface SettingsTemplateCardProps {
  kind: Kind;
  templateId: string;
  slug: string;
  title: string;
  blurb: string;
  /** Optional preview row (timeline bar, day chips, etc.). */
  preview?: React.ReactNode;
  meta?: string;
  /** Optional small footer hint (e.g. "Flips approval mode to internal_then_client"). */
  hint?: string;
  /** Optional "current vs preset" delta badge (Phase D). */
  delta?: React.ReactNode;
  testId?: string;
  t: (key: string) => string;
}

type Status = "idle" | "loading" | "added" | "error";

export function SettingsTemplateCard({
  kind,
  templateId,
  slug,
  title,
  blurb,
  preview,
  meta,
  hint,
  delta,
  testId,
  t,
}: SettingsTemplateCardProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);

  async function onApply() {
    setStatus("loading");
    setError(null);
    let res;
    switch (kind) {
      case "lead-times":
        res = await applyLeadTimeTemplateAction(slug, templateId);
        break;
      case "approvals":
        res = await applyApprovalTemplateAction(slug, templateId);
        break;
      case "monthly-target":
        res = await applyMonthlyTargetTemplateAction(slug, templateId);
        break;
    }
    if (!res?.ok) {
      setStatus("error");
      setError(res?.error ?? t("settings.templates.applyError"));
      return;
    }
    setStatus("added");
  }

  const test = testId ?? templateId;

  return (
    <div
      className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4"
      data-testid={`settings-template-card-${test}`}
    >
      <div className="flex flex-col gap-1">
        <h4 className="text-section-title text-fg-primary font-semibold">{title}</h4>
        <p className="text-body text-fg-secondary">{blurb}</p>
      </div>
      {preview ? <div className="flex flex-wrap items-center gap-2">{preview}</div> : null}
      {meta || delta ? (
        <div className="flex flex-wrap items-center gap-2">
          {meta ? <p className="text-label text-fg-muted">{meta}</p> : null}
          {delta ? (
            <span data-testid={`settings-template-card-${testId ?? templateId}-delta`}>
              {delta}
            </span>
          ) : null}
        </div>
      ) : null}
      {hint ? (
        <p className={cn("text-label", kind === "lead-times" ? "text-warning" : "text-fg-muted")}>
          {hint}
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {status === "added" ? (
          <span
            className="text-label text-success inline-flex items-center gap-1 font-semibold"
            data-testid={`settings-template-card-${test}-added`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {t("settings.templates.applied")}
          </span>
        ) : status === "error" ? (
          <span
            className="text-label text-danger font-semibold"
            role="alert"
            data-testid={`settings-template-card-${test}-error`}
          >
            {error}
          </span>
        ) : (
          <span className="text-label text-fg-muted" />
        )}
        <Button
          type="button"
          size="sm"
          variant={status === "added" ? "outline" : "default"}
          onClick={onApply}
          disabled={status === "loading" || status === "added"}
          data-testid={`settings-template-card-${test}-apply`}
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : status === "added" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {status === "added" ? t("settings.templates.applied") : t("settings.templates.apply")}
        </Button>
      </div>
    </div>
  );
}
