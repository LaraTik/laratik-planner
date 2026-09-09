"use client";

import * as React from "react";
import { Compass, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { TREND_SOURCE_CATALOG, type SourceDefinition } from "@/lib/trends/source-catalog";
import { MIN_TREND_SOURCES } from "@/lib/trends/presentation";

/**
 * First-run onboarding wizard. Lets the operator pick at least 4 sources
 * to enable. Grey-area sources route through the ToS acknowledgement
 * modal before being added to the selection. Once the operator
 * confirms, we POST `/api/trends/sources/bulk-enable` and reload.
 */
export function OnboardingWizard({
  workspaceSlug,
  isAdmin,
  onClose,
  onAcknowledgeTos,
}: {
  workspaceSlug: string;
  isAdmin: boolean;
  onClose: () => void;
  onAcknowledgeTos: (source: SourceDefinition) => void;
}) {
  const t = useLocaleT();

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const availableSources = TREND_SOURCE_CATALOG.filter((s) => s.tier !== "experimental");

  const toggle = (source: SourceDefinition) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(source.key)) next.delete(source.key);
      else next.add(source.key);
      return next;
    });
  };

  const canConfirm = selected.size >= MIN_TREND_SOURCES && !submitting;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/trends/sources/bulk-enable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceSlug,
          keys: Array.from(selected),
        }),
      });
      if (!res.ok) {
        setError(t("trends.onboarding.error") || "Could not save your selection. Try again.");
        setSubmitting(false);
        return;
      }
      // Reload so the page re-renders with the live feed.
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch {
      setError(t("trends.onboarding.error") || "Could not save your selection. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent
        data-testid="trends-onboarding-wizard"
        closeAriaLabel={t("common.close") || "Close"}
        aria-busy={submitting}
        className="bg-surface-card h-dvh max-h-dvh max-w-4xl overflow-y-auto rounded-none p-4 sm:h-auto sm:max-h-[90dvh] sm:rounded-[var(--radius-card)] sm:p-6"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-accent h-5 w-5" aria-hidden="true" />
              {t("trends.onboarding.title") || "Pick your sources"}
            </DialogTitle>
            <DialogDescription>
              {t("trends.onboarding.subtitle") ||
                "Choose 4 or more sources to start. You can change these any time from the source settings page."}
            </DialogDescription>
          </DialogHeader>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {availableSources.map((source) => {
              const isSelected = selected.has(source.key);
              return (
                <li
                  key={source.key}
                  data-testid={`source-card-${source.key}`}
                  className={`border-border bg-surface-subtle hover:border-accent/40 flex flex-col gap-2 rounded-[var(--radius-card)] border p-3 transition-colors duration-200 ${
                    isSelected ? "ring-accent/60 ring-2" : ""
                  }`}
                >
                  <header className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-title-card text-fg-primary font-semibold">
                        {t(`trends.sources.${source.key}`) || source.displayName}
                      </p>
                      <p className="text-label text-fg-muted tracking-wide uppercase">
                        {source.tier} · {source.cadence}
                      </p>
                    </div>
                    {source.tosClass === "grey" ? (
                      <ShieldAlert
                        className="text-warning h-4 w-4 shrink-0"
                        aria-hidden="true"
                        data-testid="source-tos-warning"
                      />
                    ) : null}
                  </header>
                  <p className="text-body text-fg-secondary text-sm">{source.blurb}</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-label text-fg-muted text-xs">
                      {source.requiresApiKey
                        ? t("trends.onboarding.requiresKey") || "Requires API key"
                        : t("trends.onboarding.noKey") || "No key needed"}
                    </span>
                    <Button
                      type="button"
                      variant={isSelected ? "outline" : "default"}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (source.tosClass === "grey" && !isSelected) {
                          onAcknowledgeTos(source);
                          return;
                        }
                        toggle(source);
                      }}
                      disabled={submitting}
                      data-testid={`source-toggle-${source.key}`}
                    >
                      {isSelected ? t("common.remove") || "Remove" : t("common.enable") || "Enable"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {error ? (
            <p role="alert" data-testid="onboarding-error" className="text-body text-danger">
              {error}
            </p>
          ) : null}

          <footer className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-label text-fg-muted text-sm" aria-live="polite">
                {t("trends.onboarding.selected", { count: selected.size }) ||
                  `${selected.size} selected`}
              </p>
              {selected.size < MIN_TREND_SOURCES ? (
                <p className="text-label text-warning text-sm">
                  {t("trends.onboarding.minimum") || "Select at least 4 sources to continue."}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                {t("common.skip") || "Skip for now"}
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleConfirm}
                disabled={!canConfirm}
                data-testid="onboarding-confirm"
                aria-busy={submitting}
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                {submitting
                  ? t("trends.onboarding.submitting") || "Saving…"
                  : t("trends.onboarding.confirm") || "Start exploring"}
              </Button>
            </div>
          </footer>
          {isAdmin ? null : (
            <p className="text-label text-fg-muted text-xs">
              {t("trends.onboarding.adminOnly") ||
                "Only agency admins can change the global source list. Contact them to add more."}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
