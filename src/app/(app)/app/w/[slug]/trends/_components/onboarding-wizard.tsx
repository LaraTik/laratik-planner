"use client";

import * as React from "react";
import { Compass, ShieldAlert, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { TREND_SOURCE_CATALOG, type SourceDefinition } from "@/lib/trends/source-catalog";

/**
 * First-run onboarding wizard. Lets the operator pick 4+ free sources
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

  // Pre-select the 4 canonical free sources so the e2e test has
  // something to click without scripting the whole flow. Use the
  // lazy initializer to avoid a setState in an effect (which
  // triggers a cascading render and breaks React 19's strict-mode
  // invariants).
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(["reddit", "youtube", "tiktok_tamnd", "google_trends"].slice(0, 4)),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const freeSources = TREND_SOURCE_CATALOG.filter((s) => s.tier === "free" || s.tier === "paid");

  const toggle = (source: SourceDefinition) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(source.key)) next.delete(source.key);
      else next.add(source.key);
      return next;
    });
  };

  const canConfirm = selected.size >= 1 && !submitting;

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
    <>
      {/* Backdrop — sits behind the wizard, captures stray clicks and
          dims the workspace behind. The dialog itself scrolls
          independently. */}
      <div
        aria-hidden="true"
        className="bg-fg/40 fixed inset-0 z-40 backdrop-blur-sm"
        onClick={onClose}
        data-testid="onboarding-backdrop"
      />
      <div
        data-testid="trends-onboarding-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trends-onboarding-title"
        aria-busy={submitting}
        className="bg-surface-card border-border fixed inset-0 z-50 overflow-y-auto border p-4 sm:p-6"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="trends-onboarding-title"
                className="text-title-section text-fg-primary flex items-center gap-2 font-semibold"
              >
                <Sparkles className="text-accent h-5 w-5" aria-hidden="true" />
                {t("trends.onboarding.title") || "Pick your sources"}
              </h2>
              <p className="text-body text-fg-secondary mt-1">
                {t("trends.onboarding.subtitle") ||
                  "Choose 4 or more sources to start. You can change these any time from the source settings page."}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
              data-testid="onboarding-close"
              aria-label={t("common.close") || "Close"}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </header>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {freeSources.map((source) => {
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
                        {source.displayName}
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
            <p className="text-label text-fg-muted text-sm">
              {t("trends.onboarding.selected", { count: selected.size }) ||
                `${selected.size} selected`}
            </p>
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
      </div>
    </>
  );
}
