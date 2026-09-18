"use client";

import * as React from "react";
import { HardDrive, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Storage destination summary + details popover.
 *
 * Replaces the heavy `Card variant="subtle"` that used to sit between
 * the page header and the filter bar. That card ate ~200px of
 * first-paint real estate and read like a settings page.
 *
 * The new layout:
 *   - A single muted one-liner under the page title that names the
 *     active mode, bucket, and agency prefix.
 *   - An info-icon trigger next to the one-liner that opens a portal
 *     Popover with the full breakdown (mode / bucket / prefix rows)
 *     and the file-naming rule.
 *
 * Why a popover instead of a details/summary:
 *   - The old `<Card>` body always expanded, so users scrolling fast
 *     saw a wall of storage jargon on first paint. With the popover,
 *     it only appears on demand.
 *   - Popovers are portal-mounted so they escape any ancestor that
 *     uses `overflow:hidden` (e.g. the sidebar's own scroll container).
 *
 * Translations are pulled from `<LocaleProvider>` via `useLocaleT()`
 * rather than as a prop so this client component never crosses an
 * RSC boundary with a function-valued prop (see
 * `tests/unit/i18n/rsc-translator-boundary.test.ts`).
 */
export function MediaStorageSummary({
  mode,
  bucket,
  keyPrefix,
}: {
  mode: "managed" | "agency_owned";
  bucket: string | null;
  keyPrefix: string;
}) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);

  const modeLabel = mode === "agency_owned" ? t("storage.ownedMode") : t("storage.managedMode");
  const bucketLabel = bucket ?? t("storage.notConfiguredShort");

  const list = [modeLabel, bucketLabel, keyPrefix];

  const onOpenAutoFocus = (e: Event) => {
    // Keep focus on the trigger when the popover opens so keyboard
    // users can dismiss with Escape without first having to tab into
    // the dense `<dl>`. Mirrors the workspace-switcher pattern.
    e.preventDefault();
  };

  return (
    <div
      data-testid="media-storage-summary"
      className="text-label text-fg-secondary flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm"
    >
      <HardDrive className="text-fg-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-fg-muted shrink-0 font-semibold tracking-wide uppercase">
        {t("media.storageSummaryLabel")}
      </span>
      <span className="min-w-0 truncate font-semibold" dir="ltr">
        {list.join(" · ")}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("media.storageSummaryDetailsAria")}
            data-testid="media-storage-summary-info"
            className={cn(
              "text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2",
              "data-[state=open]:text-fg-primary",
            )}
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={8}
          onOpenAutoFocus={onOpenAutoFocus}
          className="w-80"
        >
          <div className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border">
            <div className="border-border border-b px-3 py-2">
              <h3 className="text-label text-fg-primary font-semibold tracking-wide uppercase">
                {t("media.storageSummaryDetailsTitle")}
              </h3>
              <p className="text-label text-fg-secondary mt-1 max-w-3xl text-pretty">
                {t("media.storageSummaryDetailsDescription")}
              </p>
            </div>
            <dl className="grid gap-3 px-3 py-3">
              <div className="min-w-0">
                <dt className="text-label text-fg-muted">{t("media.storageMode")}</dt>
                <dd className="text-body text-fg-primary mt-1 font-semibold">{modeLabel}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-fg-muted">{t("media.storageBucket")}</dt>
                <dd className="text-body text-fg-primary mt-1 font-semibold break-all" dir="ltr">
                  {bucketLabel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-label text-fg-muted">{t("media.storagePrefix")}</dt>
                <dd
                  className="text-body text-fg-primary mt-1 font-mono text-sm break-all"
                  dir="ltr"
                >
                  {keyPrefix}
                </dd>
              </div>
            </dl>
            <p className="text-label text-fg-muted border-border border-t px-3 py-2">
              {t("media.storageFileNameRule")}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
