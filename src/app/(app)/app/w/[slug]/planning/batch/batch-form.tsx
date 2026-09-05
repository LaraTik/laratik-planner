"use client";

import * as React from "react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Info,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { batchCreateAction } from "../actions";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { FormSummary } from "@/components/forms/form-summary";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import {
  formatBatchDateTimeForInput,
  parseBatchDateTime,
  parseBatchRows,
  parseSpreadsheetRows,
  type BatchIssueCode,
  type BatchRowDraft,
  type BatchRowIssue,
} from "@/lib/content/batch";
import { CONTENT_FORMAT_DEFINITIONS, formatDefinitionFor } from "@/lib/content/format-catalog";

export interface BatchChannel {
  id: string;
  platform: string;
  accountName: string;
}

const EMPTY_STATE: { error?: string; fieldErrors?: Record<string, string> } = {};

function newRow(id: string, channelIds: string[]): BatchRowDraft {
  return {
    id,
    title: "",
    format: "",
    plannedPublishAt: "",
    brief: "",
    channelIds: [...channelIds],
  };
}

function issueText(t: ReturnType<typeof useLocaleT>, issue: BatchRowIssue): string {
  const key = `batchAdd.form.validation.${issue.code}`;
  const fallback: Record<BatchIssueCode, string> = {
    title_required: "Add a title.",
    title_too_short: "Use at least 2 characters.",
    title_too_long: "Keep the title under 200 characters.",
    format_required: "Choose a format.",
    format_invalid: "Choose a supported format.",
    date_required: "Add a date and time.",
    date_invalid: "Use a valid date and time in the workspace timezone.",
    brief_too_long: "Keep the brief under 2,000 characters.",
    caption_too_long: "Keep the caption under 2,200 characters.",
    hashtags_invalid: "Check the hashtag values.",
    location_invalid: "Check the location value.",
    brief_empty: "A brief helps the team understand the idea.",
    duplicate_date: "Another row uses this date and time.",
    channel_unknown: "One or more channels could not be matched.",
  };
  const value = t(key, issue.params);
  return value === key ? fallback[issue.code] : value;
}

function channelsForNames(
  names: string[],
  channels: BatchChannel[],
): { ids: string[]; issues: BatchRowIssue[] } {
  if (names.length === 0) return { ids: channels.map((channel) => channel.id), issues: [] };
  const ids: string[] = [];
  const issues: BatchRowIssue[] = [];
  for (const name of names) {
    const needle = name.toLowerCase();
    const channel = channels.find(
      (candidate) =>
        `${candidate.platform}, ${candidate.accountName}`.toLowerCase() === needle ||
        candidate.accountName.toLowerCase() === needle ||
        candidate.platform.toLowerCase() === needle,
    );
    if (channel) ids.push(channel.id);
    else issues.push({ code: "channel_unknown", field: "channels", severity: "error" });
  }
  return { ids: [...new Set(ids)], issues };
}

function SaveButton({
  disabled,
  label,
  pendingLabel,
}: {
  disabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={disabled || pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function BatchForm({
  slug,
  workspaceTimezone = "UTC",
  channels = [],
}: {
  slug: string;
  workspaceTimezone?: string;
  channels?: BatchChannel[];
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const formId = React.useId().replace(/:/g, "");
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(batchCreateAction.bind(null, slug), EMPTY_STATE);
  const [rows, setRows] = useState<BatchRowDraft[]>(() => [
    newRow(
      `${formId}-row-1`,
      channels.map((channel) => channel.id),
    ),
  ]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [saved, setSaved] = useState(false);

  const rowIssues = useMemo(() => {
    const map = new Map<string, BatchRowIssue[]>();
    for (const row of rows) {
      const issues = [...(row.sourceIssues ?? []), ...validateRow(row, workspaceTimezone)];
      map.set(row.id, issues);
    }
    const dates = new Map<string, string[]>();
    for (const row of rows) {
      const date = parseBatchDateTime(row.plannedPublishAt, workspaceTimezone)?.toISOString();
      if (date) dates.set(date, [...(dates.get(date) ?? []), row.id]);
    }
    for (const ids of dates.values())
      if (ids.length > 1)
        for (const id of ids) {
          const issues = map.get(id) ?? [];
          if (!issues.some((issue) => issue.code === "duplicate_date"))
            issues.push({ code: "duplicate_date", field: "plannedPublishAt", severity: "warning" });
        }
    return map;
  }, [rows, workspaceTimezone]);
  const batchOverflow = rows.length > 50;
  const errorCount =
    rows.reduce(
      (count, row) =>
        count + (rowIssues.get(row.id) ?? []).filter((issue) => issue.severity === "error").length,
      0,
    ) + (batchOverflow ? 1 : 0);
  const warningCount = rows.reduce(
    (count, row) =>
      count + (rowIssues.get(row.id) ?? []).filter((issue) => issue.severity === "warning").length,
    0,
  );
  const validCount = rows.filter(
    (row) => !(rowIssues.get(row.id) ?? []).some((issue) => issue.severity === "error"),
  ).length;
  const isClean = saved;

  useBeforeunloadDirtyGuard(formRef, isClean);
  React.useEffect(() => {
    if (state?.fieldErrors) window.setTimeout(() => focusFirstInvalid(formRef.current), 0);
  }, [state?.fieldErrors]);

  function updateRow(id: string, patch: Partial<BatchRowDraft>) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const cleanRow = { ...row };
        if ("channelIds" in patch) {
          if (cleanRow.sourceIssues) {
            cleanRow.sourceIssues = cleanRow.sourceIssues.filter(
              (issue) => issue.code !== "channel_unknown",
            );
          }
        }
        return { ...cleanRow, ...patch };
      }),
    );
    setSaved(false);
  }

  function importRows() {
    const parsed = paste.includes("\t") ? parseSpreadsheetRows(paste) : parseBatchRows(paste);
    const imported = parsed.map((item) => {
      const matched = channelsForNames(item.channelNames, channels);
      return {
        id: crypto.randomUUID(),
        title: item.title,
        format: item.format,
        plannedPublishAt: parseBatchDateTime(item.plannedPublishAt, workspaceTimezone)
          ? formatBatchDateTimeForInput(
              parseBatchDateTime(item.plannedPublishAt, workspaceTimezone)!,
              workspaceTimezone,
            )
          : item.plannedPublishAt,
        brief: item.brief,
        channelIds: matched.ids,
        ...(Object.keys(item.extensions).length ? { extensions: item.extensions } : {}),
        ...(matched.issues.length ? { sourceIssues: matched.issues } : {}),
        ...(item.lineNumber ? { sourceLine: item.lineNumber } : {}),
      } satisfies BatchRowDraft;
    });
    setRows(
      imported.length
        ? imported
        : [
            newRow(
              `${formId}-row-1`,
              channels.map((channel) => channel.id),
            ),
          ],
    );
    setPasteOpen(false);
    setPaste("");
  }

  return (
    <form ref={formRef} action={action} className="space-y-5" onSubmit={() => setSaved(false)}>
      <FormSummary
        {...(state?.error ? { error: state.error } : {})}
        {...(state?.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
        fieldLabels={{ rows: t("batchAdd.form.gridCaption") }}
        fieldIdPrefix="batch"
      />
      <input
        type="hidden"
        name="rows"
        value={JSON.stringify(
          rows.map((row) => {
            const { id, sourceLine, sourceIssues, ...cleanRow } = row;
            void id;
            void sourceLine;
            void sourceIssues;
            return cleanRow;
          }),
        )}
        readOnly
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("batchAdd.form.importTitle")}</CardTitle>
            <p className="text-label text-fg-secondary mt-1">
              {t("batchAdd.form.importDescription")}
            </p>
          </div>
          <Button type="button" variant="secondary" size="lg" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            {t("batchAdd.form.pasteSpreadsheet")}
          </Button>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="text-primary h-4 w-4" aria-hidden="true" />
            {t("batchAdd.form.formatGuideTitle")}
          </CardTitle>
          <p className="text-label text-fg-secondary">
            {t("batchAdd.form.formatGuideDescription")}
          </p>
        </CardHeader>
        <div className="grid gap-3 md:grid-cols-3">
          {CONTENT_FORMAT_DEFINITIONS.slice(0, 3).map((definition) => (
            <div
              key={definition.value}
              className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-body font-semibold">{t(definition.labelKey)}</p>
              <p className="text-label text-fg-secondary mt-1">{t(definition.descriptionKey)}</p>
              <p className="text-label text-primary mt-2">
                {definition.guidance.ratio ?? ""}
                {definition.guidance.ratio && definition.guidance.duration ? " · " : ""}
                {definition.guidance.duration ?? ""}
              </p>
              <p className="text-label text-fg-muted mt-1">{t(definition.guidance.detailKey)}</p>
            </div>
          ))}
        </div>
      </Card>

      <div
        className="flex flex-wrap items-center gap-2"
        aria-live="polite"
        data-testid="batch-validation-summary"
      >
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          {t("batchAdd.form.validCount", { count: validCount })}
        </Badge>
        <Badge variant="warning">
          <TriangleAlert className="h-3 w-3" aria-hidden="true" />
          {t("batchAdd.form.warningCount", { count: warningCount })}
        </Badge>
        <Badge variant="danger">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {t("batchAdd.form.errorCount", { count: errorCount })}
        </Badge>
        <span className="text-label text-fg-muted ms-auto">
          {t("batchAdd.form.timezone", { timezone: workspaceTimezone })}
        </span>
      </div>
      {batchOverflow ? (
        <p role="alert" className="text-label text-danger font-semibold">
          {t("batchAdd.form.batchTooLarge", { max: 50 })}
        </p>
      ) : null}

      <div
        className="border-border bg-surface overflow-hidden rounded-[var(--radius-card)] border"
        aria-label={t("batchAdd.form.gridCaption")}
      >
        <div className="border-border bg-surface-subtle text-label text-fg-secondary hidden min-w-0 grid-cols-[2.5rem_minmax(9rem,1.2fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(12rem,1.5fr)_minmax(9rem,1fr)_2rem] gap-2 border-b p-3 font-semibold md:grid">
          <span>#</span>
          <span>{t("batchAdd.form.title")}</span>
          <span>{t("batchAdd.form.format")}</span>
          <span>{t("batchAdd.form.dateTime")}</span>
          <span>{t("batchAdd.form.brief")}</span>
          <span>{t("batchAdd.form.channels")}</span>
          <span>{t("batchAdd.form.validationHeader")} </span>
        </div>
        <div className="divide-border hidden divide-y md:block">
          {rows.map((row, index) => (
            <DesktopRow
              key={row.id}
              row={row}
              rowNumber={index + 1}
              channels={channels}
              issues={rowIssues.get(row.id) ?? []}
              locale={locale}
              t={t}
              onChange={(patch) => updateRow(row.id, patch)}
              onRemove={() =>
                setRows((current) =>
                  current.length === 1 ? current : current.filter((item) => item.id !== row.id),
                )
              }
            />
          ))}
        </div>
        <div className="space-y-3 p-3 md:hidden">
          {rows.map((row, index) => (
            <MobileRow
              key={row.id}
              row={row}
              rowNumber={index + 1}
              channels={channels}
              issues={rowIssues.get(row.id) ?? []}
              locale={locale}
              t={t}
              onChange={(patch) => updateRow(row.id, patch)}
              onRemove={() =>
                setRows((current) =>
                  current.length === 1 ? current : current.filter((item) => item.id !== row.id),
                )
              }
            />
          ))}
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={() =>
          setRows((current) => [
            ...current,
            newRow(
              `${formId}-row-${current.length + 1}`,
              channels.map((channel) => channel.id),
            ),
          ])
        }
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t("batchAdd.form.addRow")}
      </Button>

      {errorCount > 0 ? (
        <p id="batch-rows" role="alert" className="text-label text-danger font-semibold">
          {t("batchAdd.form.fixErrors")}
        </p>
      ) : null}
      <div className="border-border flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" asChild>
          <Link href={`/app/w/${slug}/planning`}>{t("batchAdd.form.cancel")}</Link>
        </Button>
        <SaveButton
          disabled={rows.length === 0 || errorCount > 0 || batchOverflow}
          label={t("batchAdd.form.createDrafts")}
          pendingLabel={t("batchAdd.form.creating")}
        />
      </div>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent
          className="max-w-2xl sm:max-w-2xl"
          closeAriaLabel={t("batchAdd.form.closeDialog")}
        >
          <DialogHeader>
            <DialogTitle>{t("batchAdd.form.pasteTitle")}</DialogTitle>
            <DialogDescription>{t("batchAdd.form.pasteDescription")}</DialogDescription>
          </DialogHeader>
          <label htmlFor="batch-paste" className="text-body font-semibold">
            {t("batchAdd.form.rawPasteLabel")}
          </label>
          <DirAwareTextarea
            id="batch-paste"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            locale={locale}
            rows={10}
            placeholder={t("batchAdd.form.placeholder")}
            aria-describedby="batch-paste-help"
          />
          <p id="batch-paste-help" className="text-label text-fg-muted">
            {t("batchAdd.form.pasteHint", { timezone: workspaceTimezone })}
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPasteOpen(false)}>
              {t("batchAdd.form.cancel")}
            </Button>
            <Button type="button" onClick={importRows} disabled={!paste.trim()}>
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
              {t("batchAdd.form.importRows")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function validateRow(row: BatchRowDraft, timeZone: string): BatchRowIssue[] {
  const issues: BatchRowIssue[] = [];
  const title = row.title.trim();
  if (!title) issues.push({ code: "title_required", field: "title", severity: "error" });
  else if (title.length < 2)
    issues.push({ code: "title_too_short", field: "title", severity: "error", params: { min: 2 } });
  else if (title.length > 200)
    issues.push({
      code: "title_too_long",
      field: "title",
      severity: "error",
      params: { max: 200 },
    });
  const definition = formatDefinitionFor(row.format);
  if (!row.format.trim())
    issues.push({ code: "format_required", field: "format", severity: "error" });
  else if (!definition) issues.push({ code: "format_invalid", field: "format", severity: "error" });
  if (!row.plannedPublishAt.trim())
    issues.push({ code: "date_required", field: "plannedPublishAt", severity: "error" });
  else if (!parseBatchDateTime(row.plannedPublishAt, timeZone))
    issues.push({ code: "date_invalid", field: "plannedPublishAt", severity: "error" });
  if (row.brief.length > 2000)
    issues.push({
      code: "brief_too_long",
      field: "brief",
      severity: "error",
      params: { max: 2000 },
    });
  else if (!row.brief.trim())
    issues.push({ code: "brief_empty", field: "brief", severity: "warning" });
  if (row.extensions?.caption && row.extensions.caption.length > 2200)
    issues.push({
      code: "caption_too_long",
      field: "extensions",
      severity: "error",
      params: { max: 2200 },
    });
  if (
    row.extensions?.hashtags &&
    (row.extensions.hashtags.length > 30 || row.extensions.hashtags.some((tag) => tag.length > 60))
  )
    issues.push({ code: "hashtags_invalid", field: "extensions", severity: "error" });
  if (
    row.extensions?.location &&
    (!row.extensions.location.name || row.extensions.location.name.length > 120)
  )
    issues.push({ code: "location_invalid", field: "extensions", severity: "error" });
  return issues;
}

type RowProps = {
  row: BatchRowDraft;
  rowNumber: number;
  channels: BatchChannel[];
  issues: BatchRowIssue[];
  locale: string;
  t: ReturnType<typeof useLocaleT>;
  onChange: (patch: Partial<BatchRowDraft>) => void;
  onRemove: () => void;
};

function FormatSelect({
  row,
  rowNumber,
  t,
  onChange,
}: Pick<RowProps, "row" | "rowNumber" | "t" | "onChange">) {
  return (
    <select
      id={`batch-format-${row.id}`}
      aria-label={t("batchAdd.form.formatForRow", { row: rowNumber })}
      value={row.format}
      onChange={(event) => onChange({ format: event.target.value })}
      className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-11 w-full rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
      aria-invalid={!row.format ? true : undefined}
    >
      <option value="">{t("batchAdd.form.selectFormat")}</option>
      {CONTENT_FORMAT_DEFINITIONS.map((definition) => (
        <option key={definition.value} value={definition.value}>
          {t(definition.labelKey)}
        </option>
      ))}
    </select>
  );
}

function ChannelPicker({
  row,
  rowNumber,
  channels,
  t,
  onChange,
}: Pick<RowProps, "row" | "rowNumber" | "channels" | "t" | "onChange">) {
  const label =
    row.channelIds.length === channels.length
      ? t("batchAdd.form.channelsSelected", { count: channels.length })
      : t("batchAdd.form.channelsSelected", { count: row.channelIds.length });
  return (
    <details className="relative min-w-0">
      <summary className="border-border bg-surface text-body flex min-h-11 cursor-pointer list-none items-center justify-between gap-1 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none">
        <span className="truncate">
          {channels.length ? label : t("batchAdd.form.noActiveChannels")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div
        className="border-border bg-surface absolute start-0 z-20 mt-1 max-h-64 w-64 max-w-[calc(100vw-2rem)] overflow-auto rounded-[var(--radius-control)] border p-2 shadow-lg"
        role="group"
        aria-label={t("batchAdd.form.channelsForRow", { row: rowNumber })}
      >
        {channels.length ? (
          channels.map((channel) => (
            <label
              key={channel.id}
              className="hover:bg-surface-subtle flex min-h-11 cursor-pointer items-center gap-2 rounded px-2"
            >
              <Checkbox
                checked={row.channelIds.includes(channel.id)}
                onCheckedChange={(checked) =>
                  onChange({
                    channelIds: checked
                      ? [...row.channelIds, channel.id]
                      : row.channelIds.filter((id) => id !== channel.id),
                  })
                }
              />
              <span className="text-label">
                <bdi>{channel.platform}</bdi> · <bdi>{channel.accountName}</bdi>
              </span>
            </label>
          ))
        ) : (
          <p className="text-label text-fg-muted p-2">{t("batchAdd.form.noChannels")}</p>
        )}
      </div>
    </details>
  );
}

function ValidationStatus({
  issues,
  t,
}: {
  issues: BatchRowIssue[];
  t: ReturnType<typeof useLocaleT>;
}) {
  const first = issues[0];
  if (!first)
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        {t("batchAdd.form.validation.valid")}
      </Badge>
    );
  const blocking = issues.some((issue) => issue.severity === "error");
  return (
    <Badge variant={blocking ? "danger" : "warning"}>
      {blocking ? (
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
      ) : (
        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
      )}
      {t(blocking ? "batchAdd.form.validation.error" : "batchAdd.form.validation.attention")}
      <span className="sr-only">: {issueText(t, first)}</span>
    </Badge>
  );
}

function FieldErrors({
  issues,
  field,
  t,
}: {
  issues: BatchRowIssue[];
  field: BatchRowIssue["field"];
  t: ReturnType<typeof useLocaleT>;
}) {
  const values = issues.filter((issue) => issue.field === field);
  return values.length ? (
    <ul className="text-label text-danger mt-1 space-y-0.5" aria-live="polite">
      {values.map((issue, index) => (
        <li key={`${issue.code}-${index}`}>{issueText(t, issue)}</li>
      ))}
    </ul>
  ) : null;
}

function DesktopRow({ row, rowNumber, channels, issues, locale, t, onChange, onRemove }: RowProps) {
  return (
    <div className="grid min-w-0 grid-cols-[2.5rem_minmax(9rem,1.2fr)_minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(12rem,1.5fr)_minmax(9rem,1fr)_2rem] items-start gap-2 p-3">
      <div className="text-label text-fg-muted pt-3">{rowNumber}</div>
      <div>
        <DirAwareInput
          id={`batch-title-${row.id}`}
          aria-label={t("batchAdd.form.titleForRow", { row: rowNumber })}
          value={row.title}
          onChange={(event) => onChange({ title: event.target.value })}
          locale={locale}
          aria-invalid={issues.some(
            (issue) => issue.field === "title" && issue.severity === "error",
          )}
        />
        <FieldErrors issues={issues} field="title" t={t} />
      </div>
      <div>
        <FormatSelect row={row} rowNumber={rowNumber} t={t} onChange={onChange} />
        <FieldErrors issues={issues} field="format" t={t} />
      </div>
      <div>
        <Input
          id={`batch-date-${row.id}`}
          type="datetime-local"
          aria-label={t("batchAdd.form.dateForRow", { row: rowNumber })}
          value={localDate(row.plannedPublishAt)}
          onChange={(event) => onChange({ plannedPublishAt: event.target.value })}
          aria-invalid={issues.some(
            (issue) => issue.field === "plannedPublishAt" && issue.severity === "error",
          )}
        />
        <FieldErrors issues={issues} field="plannedPublishAt" t={t} />
      </div>
      <div>
        <DirAwareTextarea
          id={`batch-brief-${row.id}`}
          aria-label={t("batchAdd.form.briefForRow", { row: rowNumber })}
          value={row.brief}
          onChange={(event) => onChange({ brief: event.target.value })}
          locale={locale}
          rows={2}
          className="min-h-11 resize-y"
        />
        <FieldErrors issues={issues} field="brief" t={t} />
      </div>
      <ChannelPicker
        row={row}
        rowNumber={rowNumber}
        channels={channels}
        t={t}
        onChange={onChange}
      />
      <div className="flex min-h-11 items-center justify-center">
        <ValidationStatus issues={issues} t={t} />
        <button
          type="button"
          className="focus-visible:ring-focus-ring ms-1 flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
          aria-label={t("batchAdd.form.removeRow", { row: rowNumber })}
          onClick={onRemove}
        >
          <Trash2 className="text-fg-muted h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function MobileRow({ row, rowNumber, channels, issues, locale, t, onChange, onRemove }: RowProps) {
  return (
    <article className="border-border bg-surface-subtle space-y-3 rounded-[var(--radius-control)] border p-3">
      <div className="flex items-center justify-between">
        <span className="text-label text-fg-muted font-semibold">
          {t("batchAdd.form.rowNumber", { row: rowNumber })}
        </span>
        <div className="flex items-center gap-2">
          <ValidationStatus issues={issues} t={t} />
          <button
            type="button"
            className="focus-visible:ring-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
            aria-label={t("batchAdd.form.removeRow", { row: rowNumber })}
            onClick={onRemove}
          >
            <Trash2 className="text-fg-muted h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <label htmlFor={`batch-title-${row.id}`} className="text-label font-semibold">
        {t("batchAdd.form.title")}
      </label>
      <DirAwareInput
        id={`batch-title-${row.id}`}
        aria-label={t("batchAdd.form.titleForRow", { row: rowNumber })}
        value={row.title}
        onChange={(event) => onChange({ title: event.target.value })}
        locale={locale}
        aria-invalid={issues.some((issue) => issue.field === "title" && issue.severity === "error")}
      />
      <FieldErrors issues={issues} field="title" t={t} />
      <label htmlFor={`batch-format-${row.id}`} className="text-label font-semibold">
        {t("batchAdd.form.format")}
      </label>
      <FormatSelect row={row} rowNumber={rowNumber} t={t} onChange={onChange} />
      <FieldErrors issues={issues} field="format" t={t} />
      <label htmlFor={`batch-date-${row.id}`} className="text-label font-semibold">
        {t("batchAdd.form.dateTime")}
      </label>
      <Input
        id={`batch-date-${row.id}`}
        type="datetime-local"
        aria-label={t("batchAdd.form.dateForRow", { row: rowNumber })}
        value={localDate(row.plannedPublishAt)}
        onChange={(event) => onChange({ plannedPublishAt: event.target.value })}
        aria-invalid={issues.some(
          (issue) => issue.field === "plannedPublishAt" && issue.severity === "error",
        )}
      />
      <FieldErrors issues={issues} field="plannedPublishAt" t={t} />
      <label htmlFor={`batch-brief-${row.id}`} className="text-label font-semibold">
        {t("batchAdd.form.brief")}
      </label>
      <DirAwareTextarea
        id={`batch-brief-${row.id}`}
        aria-label={t("batchAdd.form.briefForRow", { row: rowNumber })}
        value={row.brief}
        onChange={(event) => onChange({ brief: event.target.value })}
        locale={locale}
        rows={3}
      />
      <FieldErrors issues={issues} field="brief" t={t} />
      <span className="text-label font-semibold">{t("batchAdd.form.channels")}</span>
      <ChannelPicker
        row={row}
        rowNumber={rowNumber}
        channels={channels}
        t={t}
        onChange={onChange}
      />
    </article>
  );
}

function localDate(value: string): string {
  if (!value) return "";
  // Grid values are kept as workspace-local `datetime-local` strings.
  // An explicit offset/ISO value is converted only for imported rows.
  return value.length >= 16 ? value.slice(0, 16) : value;
}
