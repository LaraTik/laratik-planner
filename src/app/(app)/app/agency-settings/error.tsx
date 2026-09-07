"use client";

import { AlertTriangle } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";

export default function AgencySettingsError({ reset }: { reset: () => void }) {
  const t = useLocaleT();
  return (
    <div
      className="border-border bg-surface flex max-w-2xl flex-col items-start gap-4 rounded-[var(--radius-card)] border p-6"
      role="alert"
      data-testid="agency-settings-error"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-danger mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div>
          <h1 className="text-title-card text-fg-primary font-semibold">
            {t("common.error.title")}
          </h1>
          <p className="text-body text-fg-secondary mt-1">{t("common.error.body")}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground text-button focus-visible:ring-focus-ring inline-flex min-h-[var(--control-touch)] items-center justify-center rounded-[var(--radius-control)] px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {t("common.error.retry")}
      </button>
    </div>
  );
}
