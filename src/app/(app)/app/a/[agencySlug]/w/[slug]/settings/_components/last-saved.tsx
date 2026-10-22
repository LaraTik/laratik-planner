"use client";

import { Clock } from "lucide-react";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

/**
 * LastSaved — a compact "saved X ago" indicator rendered at the
 * bottom of every per-section settings form. The page server
 * component reads `workspace_settings.updatedAt` and passes the
 * Date through; the indicator renders nothing when the date is
 * missing (the row was never written — defaults applied).
 */
export function LastSaved({ at, now }: { at: Date | null | undefined; now: Date }) {
  const t = useLocaleT();
  const locale = useLocaleCode();

  if (!at) {
    return (
      <p
        className="text-label text-fg-muted inline-flex items-center gap-1"
        data-testid="settings-last-saved"
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        {t("settings.lastSaved.never")}
      </p>
    );
  }
  return (
    <p
      className="text-label text-fg-muted inline-flex items-center gap-1"
      data-testid="settings-last-saved"
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      <span>
        {t("settings.lastSaved.label")}{" "}
        <span className="text-fg-secondary font-semibold">
          {t("settings.lastSaved.relative", {
            // The server passes the page's render-time clock so a minute
            // boundary cannot produce different server and client labels.
            date: formatRelativeDate(at, now, locale),
          })}
        </span>
      </span>
    </p>
  );
}
