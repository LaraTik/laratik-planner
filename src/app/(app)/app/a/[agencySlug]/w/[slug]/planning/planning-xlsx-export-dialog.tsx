"use client";

import * as React from "react";
import { Download, LoaderCircle } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type RangePreset = "view_month" | "current_month" | "next_month" | "custom";

export function PlanningXlsxExportDialog({
  agencySlug,
  workspaceSlug,
  month,
  timezone,
  activeFilters,
  currentFilters,
}: {
  agencySlug: string;
  workspaceSlug: string;
  month: string;
  timezone: string;
  activeFilters: string[];
  currentFilters: readonly { name: string; value: string }[];
}) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const [preset, setPreset] = React.useState<RangePreset>("view_month");
  const [startDate, setStartDate] = React.useState(`${month}-01`);
  const [endDate, setEndDate] = React.useState(lastDayOfMonth(month));
  const [pending, setPending] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const isCustom = preset === "custom";
  const rangeIsValid = !isCustom || Boolean(startDate && endDate && startDate <= endDate);

  async function downloadWorkbook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !rangeIsValid) return;

    const form = event.currentTarget;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form).entries()) {
      if (typeof value === "string") params.append(name, value);
    }

    setPending(true);
    setDownloadError(null);
    try {
      const response = await fetch(`${form.action}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
      if (!response.ok) {
        setDownloadError(
          response.status === 413
            ? t("planning.exportTooManyItems")
            : t("planning.exportDownloadFailed"),
        );
        return;
      }

      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (contentType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
        setDownloadError(t("planning.exportDownloadFailed"));
        return;
      }

      const blob = await response.blob();
      if (blob.size === 0) {
        setDownloadError(t("planning.exportDownloadFailed"));
        return;
      }

      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const safeFilename = filename?.replace(/[^a-zA-Z0-9._-]/g, "") || "planning-export.xlsx";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = safeFilename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      setOpen(false);
    } catch {
      setDownloadError(t("planning.exportDownloadFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="planning-export-xlsx-trigger">
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("planning.exportXlsx")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        closeAriaLabel={t("common.close")}
        data-testid="planning-export-xlsx-dialog"
      >
        <DialogHeader>
          <DialogTitle>{t("planning.exportDialogTitle")}</DialogTitle>
          <DialogDescription>{t("planning.exportDialogDescription")}</DialogDescription>
        </DialogHeader>

        <form
          action="/api/export/planning-xlsx"
          className="space-y-5"
          onSubmit={downloadWorkbook}
          data-testid="planning-export-xlsx-form"
        >
          <input type="hidden" name="agency" value={agencySlug} />
          <input type="hidden" name="slug" value={workspaceSlug} />
          <input type="hidden" name="month" value={month} />
          {currentFilters.map((filter) => (
            <input key={filter.name} type="hidden" name={filter.name} value={filter.value} />
          ))}

          <div className="space-y-2">
            <Label htmlFor="planning-export-range">{t("planning.exportDateRange")}</Label>
            <select
              id="planning-export-range"
              name="range"
              value={preset}
              onChange={(event) => setPreset(event.target.value as RangePreset)}
              className="border-border bg-surface text-body focus-visible:ring-focus-ring h-11 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
              data-testid="planning-export-range"
            >
              <option value="view_month">{t("planning.exportDisplayedMonth")}</option>
              <option value="current_month">{t("planning.exportCurrentMonth")}</option>
              <option value="next_month">{t("planning.exportNextMonth")}</option>
              <option value="custom">{t("planning.exportCustomRange")}</option>
            </select>
            <p className="text-label text-fg-muted">
              {t("planning.exportTimezoneHint", { timezone })}
            </p>
          </div>

          {isCustom ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="planning-export-start">{t("planning.exportStartDate")}</Label>
                <input
                  id="planning-export-start"
                  name="start"
                  type="date"
                  required
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-invalid={!rangeIsValid}
                  aria-describedby={!rangeIsValid ? "planning-export-date-error" : undefined}
                  className="border-border bg-surface text-body focus-visible:ring-focus-ring h-11 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
                  data-testid="planning-export-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planning-export-end">{t("planning.exportEndDate")}</Label>
                <input
                  id="planning-export-end"
                  name="end"
                  type="date"
                  required
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-invalid={!rangeIsValid}
                  aria-describedby={!rangeIsValid ? "planning-export-date-error" : undefined}
                  className="border-border bg-surface text-body focus-visible:ring-focus-ring h-11 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
                  data-testid="planning-export-end-date"
                />
              </div>
              {!rangeIsValid ? (
                <p
                  id="planning-export-date-error"
                  className="text-label text-danger sm:col-span-2"
                  role="alert"
                >
                  {t("planning.exportDateRangeError")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="planning-export-scope">{t("planning.exportItemsScope")}</Label>
            <select
              id="planning-export-scope"
              name="scope"
              defaultValue="current_filters"
              className="border-border bg-surface text-body focus-visible:ring-focus-ring h-11 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
              data-testid="planning-export-scope"
            >
              <option value="current_filters">{t("planning.exportUseCurrentFilters")}</option>
              <option value="all">{t("planning.exportAllItems")}</option>
            </select>
            {activeFilters.length ? (
              <div className="space-y-1.5">
                <p className="text-label text-fg-secondary">{t("planning.exportActiveFilters")}</p>
                <ul
                  className="flex flex-wrap gap-1.5"
                  aria-label={t("planning.exportActiveFilters")}
                >
                  {activeFilters.map((filter) => (
                    <li
                      key={filter}
                      className="border-border bg-surface-subtle text-label text-fg-primary rounded-full border px-2.5 py-1"
                    >
                      {filter}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-label text-fg-muted">{t("planning.exportNoActiveFilters")}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={!rangeIsValid || pending}
              data-testid="planning-export-xlsx-submit"
            >
              {pending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {pending ? t("planning.exportDownloading") : t("planning.exportDownloadXlsx")}
            </Button>
          </DialogFooter>
          {downloadError ? (
            <p
              className="text-label text-danger"
              role="alert"
              data-testid="planning-export-xlsx-error"
            >
              {downloadError}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function lastDayOfMonth(month: string): string {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return "";
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}
