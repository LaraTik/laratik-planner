"use client";

import * as React from "react";
import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  SlidersHorizontal,
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
import { BATCH_TEMPLATE_ROWS, buildBatchTemplateTsv } from "@/lib/content/batch-template";
import { BatchFormatPayloadFields } from "@/components/forms/batch-format-payload-fields";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import type { LocaleCode } from "@/lib/i18n/locales";

export interface BatchChannel {
  id: string;
  platform: string;
  accountName: string;
}

export interface BatchOption {
  id: string;
  name: string;
}

export interface BatchTemplateOption extends BatchOption {
  format: ContentFormat;
  briefTemplate: string;
  defaultChannelIds: string[];
  formatPayload: Record<string, unknown>;
}

export interface BatchDefaults {
  campaignId?: string;
  contentPillarId?: string;
  contentOwnerId?: string;
  defaultDesignerId?: string;
  templateId?: string;
  defaultChannelIds?: string[];
  contentLanguage?: LocaleCode;
}

const EMPTY_STATE: { error?: string; fieldErrors?: Record<string, string> } = {};

function newRow(
  id: string,
  channelIds: string[],
  seed: BatchDefaults & Partial<BatchRowDraft> = {},
): BatchRowDraft {
  const formatPayload = seed.formatPayload
    ? { ...seed.formatPayload }
    : seed.contentLanguage
      ? { schemaVersion: 1, contentLanguage: seed.contentLanguage }
      : undefined;
  if (formatPayload && seed.contentLanguage) formatPayload.contentLanguage = seed.contentLanguage;
  return {
    id,
    title: seed.title ?? "",
    format: seed.format ?? "",
    plannedPublishAt: "",
    brief: seed.brief ?? "",
    channelIds: [...(seed.defaultChannelIds ?? channelIds)],
    ...(seed.campaignId ? { campaignId: seed.campaignId } : {}),
    ...(seed.contentPillarId ? { contentPillarId: seed.contentPillarId } : {}),
    ...(seed.contentOwnerId ? { contentOwnerId: seed.contentOwnerId } : {}),
    ...(formatPayload ? { formatPayload } : {}),
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
    format_payload_invalid: "Check the format payload JSON and format-specific fields.",
    format_payload_conflict: "The convenience value conflicts with the format payload JSON.",
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

function DefaultSelect({
  id,
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: BatchOption[];
  emptyLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-label text-fg-secondary block font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-11 w-full min-w-0 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function BatchForm({
  slug,
  workspaceTimezone = "UTC",
  channels = [],
  campaigns = [],
  pillars = [],
  templates = [],
  defaults = {},
  ownerOptions = [],
}: {
  slug: string;
  workspaceTimezone?: string;
  channels?: BatchChannel[];
  campaigns?: BatchOption[];
  pillars?: BatchOption[];
  templates?: BatchTemplateOption[];
  defaults?: BatchDefaults;
  ownerOptions?: BatchOption[];
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const formId = React.useId().replace(/:/g, "");
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(batchCreateAction.bind(null, slug), EMPTY_STATE);
  const [globalDefaults, setGlobalDefaults] = useState<BatchDefaults>(defaults);
  const seedForNewRow = React.useCallback(
    (seed: BatchDefaults = globalDefaults): BatchDefaults & Partial<BatchRowDraft> => {
      const template = templates.find((candidate) => candidate.id === seed.templateId);
      return {
        ...seed,
        ...(template
          ? {
              format: template.format,
              brief: template.briefTemplate,
              formatPayload: template.formatPayload,
              defaultChannelIds:
                template.defaultChannelIds.length > 0
                  ? template.defaultChannelIds
                  : seed.defaultChannelIds,
            }
          : {}),
      };
    },
    [globalDefaults, templates],
  );
  const [rows, setRows] = useState<BatchRowDraft[]>(() => [
    newRow(
      `${formId}-row-1`,
      channels.map((channel) => channel.id),
      seedForNewRow(defaults),
    ),
  ]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [saved, setSaved] = useState(false);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [detailsRowId, setDetailsRowId] = useState<string | null>(null);
  const [planningMonth, setPlanningMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const templateChannelNames = useMemo(
    () => channels.map((channel) => channel.accountName || channel.platform),
    [channels],
  );
  const templateTsv = useMemo(
    () => buildBatchTemplateTsv(templateChannelNames),
    [templateChannelNames],
  );

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

  function applyDefaultsToEmptyRows() {
    const seed = seedForNewRow(globalDefaults);
    setRows((current) =>
      current.map((row) =>
        row.title.trim() || row.brief.trim() || row.format
          ? row
          : {
              ...row,
              ...(seed.format ? { format: seed.format } : {}),
              ...(seed.brief ? { brief: seed.brief } : {}),
              ...(seed.campaignId ? { campaignId: seed.campaignId } : {}),
              ...(seed.contentPillarId ? { contentPillarId: seed.contentPillarId } : {}),
              ...(seed.contentOwnerId ? { contentOwnerId: seed.contentOwnerId } : {}),
              ...(seed.formatPayload ? { formatPayload: seed.formatPayload } : {}),
              ...(seed.contentLanguage
                ? {
                    formatPayload: {
                      ...(seed.formatPayload ?? { schemaVersion: 1 }),
                      contentLanguage: seed.contentLanguage,
                    },
                  }
                : {}),
              channelIds: [...(seed.defaultChannelIds ?? row.channelIds)],
            },
      ),
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
        ...(item.formatPayload ? { formatPayload: item.formatPayload } : {}),
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
              seedForNewRow(globalDefaults),
            ),
          ],
    );
    setPasteOpen(false);
    setPaste("");
  }

  function downloadTemplate() {
    const blob = new Blob([templateTsv], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "batch-add-template.tsv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(templateTsv);
      setTemplateCopied(true);
      window.setTimeout(() => setTemplateCopied(false), 2200);
    } catch {
      setTemplateCopied(false);
    }
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

      <Card className="border-primary/20 bg-primary-subtle/30" data-testid="batch-planning-canvas">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-label text-primary font-semibold tracking-[0.08em] uppercase">
                {t("batchAdd.form.monthlyCanvasEyebrow")}
              </p>
              <CardTitle className="mt-1">{t("batchAdd.form.monthlyCanvasTitle")}</CardTitle>
              <p className="text-label text-fg-secondary mt-1 max-w-2xl">
                {t("batchAdd.form.monthlyCanvasDescription")}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="batch-planning-month" className="text-label font-semibold">
                  {t("batchAdd.form.month")}
                </label>
                <Input
                  id="batch-planning-month"
                  type="month"
                  value={planningMonth}
                  onChange={(event) => setPlanningMonth(event.target.value)}
                  className="bg-surface min-h-11 w-40"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={applyDefaultsToEmptyRows}
              >
                {t("batchAdd.form.applyDefaults")}
              </Button>
            </div>
          </div>
          <div className="border-border bg-surface grid gap-3 rounded-[var(--radius-control)] border p-3 sm:grid-cols-2 lg:grid-cols-5">
            <DefaultSelect
              id="batch-default-campaign"
              label={t("batchAdd.form.campaign")}
              value={globalDefaults.campaignId ?? ""}
              options={campaigns}
              emptyLabel={t("batchAdd.form.noCampaign")}
              onChange={(value) =>
                setGlobalDefaults((current) => {
                  const next = { ...current };
                  if (value) next.campaignId = value;
                  else delete next.campaignId;
                  return next;
                })
              }
            />
            <DefaultSelect
              id="batch-default-pillar"
              label={t("batchAdd.form.pillar")}
              value={globalDefaults.contentPillarId ?? ""}
              options={pillars}
              emptyLabel={t("batchAdd.form.noPillar")}
              onChange={(value) =>
                setGlobalDefaults((current) => {
                  const next = { ...current };
                  if (value) next.contentPillarId = value;
                  else delete next.contentPillarId;
                  return next;
                })
              }
            />
            <DefaultSelect
              id="batch-default-owner"
              label={t("batchAdd.form.owner")}
              value={globalDefaults.contentOwnerId ?? ""}
              options={ownerOptions}
              emptyLabel={t("batchAdd.form.noOwner")}
              onChange={(value) =>
                setGlobalDefaults((current) => {
                  const next = { ...current };
                  if (value) next.contentOwnerId = value;
                  else delete next.contentOwnerId;
                  return next;
                })
              }
            />
            <DefaultSelect
              id="batch-default-template"
              label={t("batchAdd.form.template")}
              value={globalDefaults.templateId ?? ""}
              options={templates}
              emptyLabel={t("batchAdd.form.noTemplate")}
              onChange={(value) =>
                setGlobalDefaults((current) => {
                  const next = { ...current };
                  if (value) next.templateId = value;
                  else delete next.templateId;
                  return next;
                })
              }
            />
            <DefaultSelect
              id="batch-default-content-language"
              label={t("batchAdd.form.contentLanguage")}
              value={globalDefaults.contentLanguage ?? ""}
              options={[
                { id: "en", name: t("batchAdd.form.contentLanguageEnglish") },
                { id: "ar", name: t("batchAdd.form.contentLanguageArabic") },
              ]}
              emptyLabel={t("batchAdd.form.contentLanguageWorkspaceDefault")}
              onChange={(value) =>
                setGlobalDefaults((current) => {
                  const next = { ...current };
                  if (value === "en" || value === "ar") next.contentLanguage = value;
                  else delete next.contentLanguage;
                  return next;
                })
              }
            />
            <DefaultSelect
              id="batch-default-channel"
              label={t("batchAdd.form.channels")}
              value={globalDefaults.defaultChannelIds?.[0] ?? ""}
              options={channels.map((channel) => ({
                id: channel.id,
                name: channel.accountName || channel.platform,
              }))}
              emptyLabel={t("batchAdd.form.allChannels")}
              onChange={(value) =>
                setGlobalDefaults((current) => {
                  const next = { ...current };
                  if (value) next.defaultChannelIds = [value];
                  else delete next.defaultChannelIds;
                  return next;
                })
              }
            />
          </div>
          {!campaigns.length && !pillars.length && !templates.length ? (
            <p className="text-label text-fg-muted">{t("batchAdd.form.defaultsEmptyHint")}</p>
          ) : null}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t("batchAdd.form.importTitle")}</CardTitle>
            <p className="text-label text-fg-secondary mt-1">
              {t("batchAdd.form.importDescription")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={downloadTemplate}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("batchAdd.form.downloadTemplate")}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
              {t("batchAdd.form.pasteSpreadsheet")}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card data-testid="batch-template-example">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="text-primary h-4 w-4" aria-hidden="true" />
            {t("batchAdd.form.templateTitle")}
          </CardTitle>
          <p className="text-label text-fg-secondary">{t("batchAdd.form.templateDescription")}</p>
        </CardHeader>
        <details className="border-border border-t">
          <summary className="hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-start text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none">
            <span>{t("batchAdd.form.templateExample")}</span>
            <span className="text-label text-fg-muted">
              {t("batchAdd.form.templateExampleHint")}
            </span>
          </summary>
          <div className="space-y-3 px-4 pb-4">
            <div
              className="border-border hidden overflow-x-auto rounded-[var(--radius-control)] border md:block"
              role="region"
              tabIndex={0}
              aria-label={t("batchAdd.form.templateTitle")}
            >
              <table className="text-label min-w-[1100px] border-collapse text-start">
                <caption className="sr-only">{t("batchAdd.form.templateTitle")}</caption>
                <thead className="bg-surface-subtle text-fg-secondary border-border border-b">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("batchAdd.form.title")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("batchAdd.form.format")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("batchAdd.form.dateTime")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("batchAdd.form.brief")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t("batchAdd.form.channels")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {BATCH_TEMPLATE_ROWS.map((row) => {
                    const definition = formatDefinitionFor(row.format);
                    return (
                      <tr
                        key={row.format}
                        className="hover:bg-surface-subtle align-top transition-colors"
                      >
                        <td className="text-body px-3 py-2 font-medium">{row.title}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {definition ? t(definition.labelKey) : row.format}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.plannedPublishAt}</td>
                        <td className="text-fg-secondary max-w-[34rem] px-3 py-2">{row.brief}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {templateChannelNames.length
                            ? templateChannelNames.join(", ")
                            : t("batchAdd.form.templateAllChannels")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden">
              {BATCH_TEMPLATE_ROWS.map((row) => {
                const definition = formatDefinitionFor(row.format);
                return (
                  <article
                    key={row.format}
                    className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-body font-semibold">{row.title}</p>
                      <span className="text-label text-primary shrink-0 font-semibold">
                        {definition ? t(definition.labelKey) : row.format}
                      </span>
                    </div>
                    <dl className="text-label mt-2 grid gap-1 text-start">
                      <div className="flex gap-2">
                        <dt className="text-fg-muted shrink-0">{t("batchAdd.form.dateTime")}:</dt>
                        <dd>{row.plannedPublishAt}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-fg-muted shrink-0">{t("batchAdd.form.brief")}:</dt>
                        <dd className="text-fg-secondary">{row.brief}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-fg-muted shrink-0">{t("batchAdd.form.channels")}:</dt>
                        <dd className="text-fg-secondary">
                          {templateChannelNames.length
                            ? templateChannelNames.join(", ")
                            : t("batchAdd.form.templateAllChannels")}
                        </dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-label text-fg-muted max-w-3xl">
                {t("batchAdd.form.templateDetailsNote")}
              </p>
              <Button type="button" variant="ghost" size="lg" onClick={copyTemplate}>
                {templateCopied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {templateCopied
                  ? t("batchAdd.form.templateCopied")
                  : t("batchAdd.form.copyTemplate")}
              </Button>
            </div>
          </div>
        </details>
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
        className="border-border bg-surface rounded-[var(--radius-card)] border"
        role="region"
        aria-label={t("batchAdd.form.gridCaption")}
      >
        <div className="border-border bg-surface-subtle flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div>
            <p className="text-body font-semibold">{t("batchAdd.form.rowsLabel")}</p>
            <p className="text-label text-fg-secondary">{t("batchAdd.form.gridHint")}</p>
          </div>
        </div>
        <div
          className="custom-scrollbar hidden max-h-[70vh] overflow-auto md:block"
          data-testid="batch-grid-scroll"
          role="region"
          tabIndex={0}
          aria-label={t("batchAdd.form.gridCaption")}
        >
          <div className="min-w-[1040px]">
            <div className="border-border bg-surface-subtle text-label text-fg-secondary sticky top-0 z-10 grid grid-cols-[2rem_minmax(10rem,1.2fr)_minmax(9rem,0.9fr)_minmax(10rem,1fr)_minmax(14rem,1.4fr)_minmax(9.5rem,1fr)_8rem_7rem] gap-2 border-b p-3 font-semibold">
              <span>#</span>
              <span>{t("batchAdd.form.title")}</span>
              <span>{t("batchAdd.form.format")}</span>
              <span>{t("batchAdd.form.dateTime")}</span>
              <span>{t("batchAdd.form.brief")}</span>
              <span>{t("batchAdd.form.channels")}</span>
              <span>{t("batchAdd.form.validationHeader")} </span>
              <span>{t("batchAdd.form.actions")}</span>
            </div>
            <div className="divide-border divide-y">
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
                  onDetails={() => setDetailsRowId(row.id)}
                  onRemove={() =>
                    setRows((current) =>
                      current.length === 1 ? current : current.filter((item) => item.id !== row.id),
                    )
                  }
                />
              ))}
            </div>
          </div>
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
              onDetails={() => setDetailsRowId(row.id)}
              onRemove={() =>
                setRows((current) =>
                  current.length === 1 ? current : current.filter((item) => item.id !== row.id),
                )
              }
            />
          ))}
        </div>
      </div>
      <Card>
        <details>
          <summary className="hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-[var(--radius-card)] px-5 py-4 text-start focus-visible:ring-2 focus-visible:outline-none">
            <Info className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="text-body block font-semibold">
                {t("batchAdd.form.formatGuideTitle")}
              </span>
              <span className="text-label text-fg-secondary mt-0.5 block">
                {t("batchAdd.form.formatGuideDescription")}
              </span>
            </span>
          </summary>
          <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4">
            {CONTENT_FORMAT_DEFINITIONS.map((definition) => (
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
        </details>
      </Card>
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
              seedForNewRow(globalDefaults),
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

      <Dialog open={detailsRowId !== null} onOpenChange={(open) => !open && setDetailsRowId(null)}>
        <DialogContent
          className="max-h-[90vh] max-w-3xl overflow-y-auto sm:max-w-3xl"
          closeAriaLabel={t("batchAdd.form.closeDialog")}
        >
          {(() => {
            const detailRow = rows.find((row) => row.id === detailsRowId);
            if (!detailRow || !formatDefinitionFor(detailRow.format)) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {t("batchAdd.form.detailsForRow", { row: rows.indexOf(detailRow) + 1 })}
                  </DialogTitle>
                  <DialogDescription dir="auto">
                    {detailRow.title || t("batchAdd.form.untitledRow")}
                  </DialogDescription>
                </DialogHeader>
                <BatchFormatPayloadFields
                  format={detailRow.format as ContentFormat}
                  value={detailRow.formatPayload ?? { schemaVersion: 1 }}
                  locale={locale}
                  t={t}
                  onChange={(formatPayload) => updateRow(detailRow.id, { formatPayload })}
                />
                <DialogFooter>
                  <Button type="button" onClick={() => setDetailsRowId(null)}>
                    {t("batchAdd.form.doneWithDetails")}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

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
  if (row.formatPayload) {
    try {
      if (definition) parseFormatPayload(row.format as ContentFormat, row.formatPayload);
      else throw new Error("unknown format");
    } catch {
      issues.push({ code: "format_invalid", field: "formatPayload", severity: "error" });
    }
  }
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
  onDetails: () => void;
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
      onChange={(event) =>
        onChange({
          format: event.target.value,
          formatPayload: { schemaVersion: 1 },
        })
      }
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

function DesktopRow({
  row,
  rowNumber,
  channels,
  issues,
  locale,
  t,
  onChange,
  onDetails,
  onRemove,
}: RowProps) {
  return (
    <div className="odd:bg-surface-subtle/30 grid min-w-0 grid-cols-[2rem_minmax(10rem,1.2fr)_minmax(9rem,0.9fr)_minmax(10rem,1fr)_minmax(14rem,1.4fr)_minmax(9.5rem,1fr)_8rem_7rem] items-start gap-2 p-3">
      <div className="text-label text-fg-muted pt-3">{rowNumber}</div>
      <div>
        <DirAwareInput
          id={`batch-title-${row.id}`}
          aria-label={t("batchAdd.form.titleForRow", { row: rowNumber })}
          value={row.title}
          onChange={(event) => onChange({ title: event.target.value })}
          locale={locale}
          className="hover:border-border hover:bg-surface-subtle focus-visible:border-border focus-visible:bg-surface border-transparent bg-transparent px-2"
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
          className="hover:border-border hover:bg-surface-subtle focus-visible:border-border focus-visible:bg-surface border-transparent bg-transparent px-2"
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
          className="hover:border-border hover:bg-surface-subtle focus-visible:border-border focus-visible:bg-surface min-h-11 resize-y border-transparent bg-transparent px-2"
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
      </div>
      <div className="flex min-h-11 items-center justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDetails}
          aria-label={t("batchAdd.form.detailsForRow", { row: rowNumber })}
          title={t("batchAdd.form.details")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline">{t("batchAdd.form.details")}</span>
        </Button>
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

function MobileRow({
  row,
  rowNumber,
  channels,
  issues,
  locale,
  t,
  onChange,
  onDetails,
  onRemove,
}: RowProps) {
  return (
    <article className="border-border bg-surface-subtle space-y-3 rounded-[var(--radius-control)] border p-3">
      <div className="flex items-center justify-between">
        <span className="text-label text-fg-muted font-semibold">
          {t("batchAdd.form.rowNumber", { row: rowNumber })}
        </span>
        <div className="flex items-center gap-2">
          <ValidationStatus issues={issues} t={t} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDetails}
            aria-label={t("batchAdd.form.detailsForRow", { row: rowNumber })}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            {t("batchAdd.form.details")}
          </Button>
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
