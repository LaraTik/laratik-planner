"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
  Loader2,
  RotateCw,
  ShieldAlert,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useLocaleT } from "@/components/i18n/locale-provider";
import {
  MAX_FOLDER_BATCH_IMPORT,
  type MediaFolderItem,
  type MediaFolderListing,
} from "@/lib/media/folder-sources/types";
import type { FolderImportItemReport, FolderImportReport } from "@/lib/media/folder-import";

export type { FolderImportReport };

type Visibility = "workspace" | "agency";

type Row = MediaFolderItem & {
  /** User-supplied override (debounced). */
  titleOverride?: string | null;
};

type CommonState = {
  folder: MediaFolderListing;
  rows: Row[];
  selectedIds: Set<string>;
  visibility: Visibility;
};

type BrowseState = CommonState & { step: "browse" };
type ImportState = CommonState & { step: "import"; report: FolderImportReport };
type DoneState = CommonState & { step: "done"; report: FolderImportReport };

type WizardState = BrowseState | ImportState | DoneState;

const kindFor = (mimeType: string): "image" | "video" | "document" => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
};

const formatBytes = (bytes: number | null | undefined): string => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const defaultSelected = (rows: Row[]): Set<string> =>
  new Set(rows.filter((r) => r.status === "importable").map((r) => r.id));

export function MediaLinkFolderBrowse({
  folder,
  workspaceId,
  onClose,
  onAssetReady,
}: {
  folder: MediaFolderListing;
  workspaceId: string;
  onClose?: () => void;
  onAssetReady?: () => void;
}) {
  const t = useLocaleT();
  const router = useRouter();
  const initialRows = React.useMemo(() => folder.items.slice(), [folder]);
  const initialSelection = React.useMemo(() => defaultSelected(initialRows), [initialRows]);
  const [state, setState] = React.useState<WizardState>(() => ({
    step: "browse",
    folder,
    rows: initialRows,
    selectedIds: initialSelection,
    visibility: "workspace",
  }));

  const importableCount = state.rows.filter((r) => r.status === "importable").length;
  const skippedCount = state.rows.length - importableCount;
  const selectedCount = state.selectedIds.size;
  const overflow = selectedCount - MAX_FOLDER_BATCH_IMPORT;

  const setRowTitle = (id: string, title: string) =>
    setState((prev) => ({
      ...prev,
      rows: prev.rows.map((r) => (r.id === id ? { ...r, titleOverride: title.trim() || null } : r)),
    }));

  const toggleSelection = (id: string) =>
    setState((prev) => {
      const next = new Set(prev.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });

  const selectAll = () =>
    setState((prev) => ({
      ...prev,
      selectedIds: new Set(prev.rows.filter((r) => r.status === "importable").map((r) => r.id)),
    }));

  const clearSelection = () => setState((prev) => ({ ...prev, selectedIds: new Set() }));

  const startImport = async () => {
    if (state.step !== "browse") return;
    const items = state.rows
      .filter((r) => state.selectedIds.has(r.id))
      .map((r) => ({ id: r.id, title: r.titleOverride ?? r.name }));
    // The folder endpoint returns synchronously (server fans out the
    // batch and reports per-item status). We render a brief "import"
    // step while the request is in flight, then transition to "done"
    // with the report.
    setState((prev) =>
      prev.step === "browse"
        ? {
            ...prev,
            step: "import",
            report: {
              items: items.map((item) => ({
                id: item.id,
                title: item.title,
                status: "skipped" as const,
              })),
              imported: 0,
              skipped: items.length,
              failed: 0,
              canceled: 0,
            },
          }
        : prev,
    );
    const report = await postFolderImport({
      folderId: state.folder.folderId,
      workspaceId,
      items,
      visibility: state.visibility,
    });
    if (!report) {
      // Bail back to browse; the inline copy above the wizard handles
      // the user-visible error in production.
      setState((prev) => (prev.step === "import" ? { ...prev, step: "browse" } : prev));
      return;
    }
    setState((prev) => (prev.step === "import" ? { ...prev, step: "done", report } : prev));
  };

  const retryOne = async (rowReport: FolderImportItemReport) => {
    if (state.step !== "done" && state.step !== "import") return;
    const original = state.rows.find((r) => r.id === rowReport.id);
    if (!original) return;
    const report = await postFolderImport({
      folderId: state.folder.folderId,
      workspaceId,
      items: [{ id: original.id, title: rowReport.titleOverride ?? original.name }],
      visibility: state.visibility,
    });
    if (!report) return;
    setState((prev) => {
      if (prev.step !== "done" && prev.step !== "import") return prev;
      const merged = prev.report.items.map((it) =>
        it.id === rowReport.id ? report.items[0]! : it,
      );
      return {
        ...prev,
        step: "done",
        report: {
          ...report,
          items: merged,
          imported: merged.filter((i) => i.status === "imported").length,
          failed: merged.filter((i) => i.status === "failed").length,
          canceled: merged.filter((i) => i.status === "canceled").length,
          skipped: merged.filter((i) => i.status === "skipped").length,
        },
      };
    });
  };

  const finish = () => {
    onAssetReady?.();
    router.refresh();
    onClose?.();
  };

  return (
    <section
      role="region"
      aria-labelledby="media-folder-card-heading"
      aria-label={t("media.folderAccessibilityCardLabel")}
      data-testid="media-folder-browse"
    >
      <Card padding="lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
              <FolderOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle id="media-folder-card-heading">{t("media.folderImportTitle")}</CardTitle>
              <CardDescription>
                {importableCount === 1
                  ? t("media.folderImportSubtitleOne", {
                      count: importableCount,
                      skipped: skippedCount,
                    })
                  : t("media.folderImportSubtitle", {
                      count: importableCount,
                      skipped: skippedCount,
                    })}
              </CardDescription>
              <p className="text-label text-fg-secondary mt-1">
                {t("media.folderImportPublicHint")}
              </p>
            </div>
          </div>
        </div>

        {state.step === "browse" ? (
          <BrowseStep
            rows={state.rows}
            selectedIds={state.selectedIds}
            visibility={state.visibility}
            overflow={overflow}
            onToggle={toggleSelection}
            onSelectAll={selectAll}
            onClear={clearSelection}
            onTitle={setRowTitle}
            onVisibility={(v) => setState((prev) => ({ ...prev, visibility: v }))}
            onImport={startImport}
            onClose={onClose}
          />
        ) : null}

        {state.step === "import" ? (
          <ImportStep folder={state.folder} report={state.report} rows={state.rows} />
        ) : null}

        {state.step === "done" ? (
          <DoneStep
            report={state.report}
            rows={state.rows}
            onRetry={retryOne}
            onClose={finish}
            onRefresh={finish}
          />
        ) : null}
      </Card>
    </section>
  );
}

async function postFolderImport(payload: {
  folderId: string;
  workspaceId: string;
  items: Array<{ id: string; title: string }>;
  visibility: Visibility;
}): Promise<FolderImportReport | null> {
  try {
    const response = await fetch("/api/media/import/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "import",
        folderId: payload.folderId,
        workspaceId: payload.workspaceId,
        items: payload.items,
        visibility: payload.visibility,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { report: FolderImportReport };
    return data.report;
  } catch {
    return null;
  }
}

function BrowseStep(props: {
  rows: Row[];
  selectedIds: Set<string>;
  visibility: Visibility;
  overflow: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onTitle: (id: string, title: string) => void;
  onVisibility: (v: Visibility) => void;
  onImport: () => void;
  onClose: (() => void) | undefined;
}) {
  const t = useLocaleT();
  const {
    rows,
    selectedIds,
    visibility,
    overflow,
    onToggle,
    onSelectAll,
    onClear,
    onTitle,
    onVisibility,
    onImport,
    onClose,
  } = props;
  const total = rows.length;
  const selected = selectedIds.size;
  const disabled = selected === 0 || overflow > 0;
  const subtitle =
    overflow > 0
      ? t("media.folderTooManyHint", {
          count: selected,
          max: MAX_FOLDER_BATCH_IMPORT,
          overflow,
        })
      : null;

  return (
    <div className="mt-4 grid gap-3" data-testid="folder-browse-list">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>
            {t("media.folderSelectAll")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            {t("media.folderClearSelection")}
          </Button>
        </div>
        <label className="text-label text-fg-primary inline-flex items-center gap-2">
          <span className="sr-only">{t("media.folderImportVisibilityLabel")}</span>
          <select
            value={visibility}
            onChange={(event) => onVisibility(event.target.value as Visibility)}
            className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring min-h-9 rounded-[var(--radius-control)] border px-2 font-normal focus-visible:ring-2"
            aria-label={t("media.folderImportVisibilityLabel")}
          >
            <option value="workspace">{t("media.workspaceOnly")}</option>
            <option value="agency">{t("media.agencyShared")}</option>
          </select>
        </label>
      </div>

      <ul
        role="list"
        className="border-border bg-surface-subtle divide-border max-h-96 divide-y overflow-y-auto rounded-[var(--radius-control)] border"
      >
        {rows.map((row) => (
          <FolderRow
            key={row.id}
            row={row}
            selected={selectedIds.has(row.id)}
            onToggle={() => onToggle(row.id)}
            onTitle={(title) => onTitle(row.id, title)}
          />
        ))}
      </ul>

      <div className="bg-surface border-border sticky bottom-0 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-3 shadow-sm">
        <span className="text-label text-fg-secondary" data-testid="folder-import-count">
          {t("media.folderImportSelected", { count: selected, total })}
        </span>
        <div className="flex items-center gap-2">
          {onClose ? (
            <Button type="button" variant="ghost" size="lg" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t("media.folderButtonBack")}
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            disabled={disabled}
            onClick={onImport}
            data-testid="folder-import-submit"
          >
            {t("media.folderImportSelected", { count: selected, total })}
          </Button>
        </div>
      </div>
      {subtitle ? (
        <p className="text-label text-warning" role="status">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function FolderRow(props: {
  row: Row;
  selected: boolean;
  onToggle: () => void;
  onTitle: (title: string) => void;
}) {
  const t = useLocaleT();
  const { row, selected, onToggle, onTitle } = props;
  const disabled = row.status !== "importable";
  const kind = kindFor(row.mimeType);
  const Icon = kind === "image" ? FileImage : kind === "video" ? FileVideo : FileText;

  return (
    <li
      className={`bg-surface flex items-center gap-3 px-3 py-2 ${disabled ? "opacity-60" : ""}`}
      data-testid="folder-row"
      data-status={row.status}
    >
      <div className="bg-surface-subtle relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-control)]">
        {row.thumbnailUrl && kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.thumbnailUrl}
            alt={t("media.folderThumbnailAlt", { name: row.name })}
            width={48}
            height={48}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="text-fg-secondary flex h-full w-full items-center justify-center">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Input
          value={row.titleOverride ?? row.name}
          onChange={(event) => onTitle(event.target.value)}
          aria-label={t("media.titleLabel") + ": " + row.name}
          className="mt-0 min-h-9"
          disabled={disabled}
        />
        <div className="text-label text-fg-secondary mt-1 flex flex-wrap items-center gap-2">
          <span className="bg-surface-subtle text-fg-primary rounded-full px-2 py-0.5 text-[11px] uppercase">
            {kind}
          </span>
          <span>{row.mimeType}</span>
          <span aria-hidden="true">·</span>
          <span>{row.sizeBytes ? formatBytes(row.sizeBytes) : t("media.folderSizeUnknown")}</span>
          {disabled && row.status === "provider_connection_required" ? (
            <span
              className="bg-warning-subtle text-warning inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
              data-testid="folder-row-needs-connection"
            >
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
              {t("media.folderItemNeedsConnection")}
            </span>
          ) : null}
          {disabled && row.status === "unsupported" ? (
            <span className="bg-danger-subtle text-danger inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]">
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              {t("media.folderItemUnsupported")}
            </span>
          ) : null}
        </div>
      </div>
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label={t("media.selectAsset", { name: row.name })}
      />
    </li>
  );
}

function ImportStep(props: {
  folder: MediaFolderListing;
  rows: Row[];
  report: FolderImportReport;
}) {
  const t = useLocaleT();
  const rowsById = new Map(props.rows.map((r) => [r.id, r]));
  const live = props.report.items;
  const total = live.length;
  const done = live.filter((i) => i.status === "imported").length;
  const failed = live.filter((i) => i.status === "failed").length;
  const active = live.filter(
    (i) => i.status !== "imported" && i.status !== "failed" && i.status !== "canceled",
  ).length;

  return (
    <div className="mt-4 grid gap-3" data-testid="folder-import-step">
      <div
        className="text-label text-fg-primary"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="folder-import-progress"
      >
        {t("media.folderImportProgress", { done, total, failed, active })}
      </div>
      <ul
        role="list"
        className="border-border bg-surface-subtle divide-border max-h-96 divide-y overflow-y-auto rounded-[var(--radius-control)] border"
      >
        {live.map((item) => {
          const row = rowsById.get(item.id);
          return (
            <li
              key={item.id}
              className="bg-surface flex items-center gap-3 px-3 py-2"
              data-testid="folder-import-row"
              data-status={item.status}
            >
              <StatusIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <p className="text-body truncate" title={item.title ?? undefined}>
                  {item.title}
                </p>
                {item.code && item.status !== "imported" ? (
                  <p className="text-label text-fg-secondary">{item.code}</p>
                ) : null}
              </div>
              <span className="text-label text-fg-secondary">
                {row && row.sizeBytes ? formatBytes(row.sizeBytes) : ""}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-label text-fg-secondary">{t("media.folderImportPublicHint")}</p>
    </div>
  );
}

function StatusIcon({ status }: { status: FolderImportItemReport["status"] }) {
  if (status === "imported")
    return <CheckCircle2 className="text-success h-5 w-5" aria-hidden="true" />;
  if (status === "failed")
    return <AlertCircle className="text-danger h-5 w-5" aria-hidden="true" />;
  if (status === "canceled") return <X className="text-fg-secondary h-5 w-5" aria-hidden="true" />;
  return (
    <Loader2
      className="text-fg-secondary h-5 w-5 animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}

function DoneStep(props: {
  report: FolderImportReport;
  rows: Row[];
  onRetry: (row: FolderImportItemReport) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const t = useLocaleT();
  const failed = props.report.items.filter((i) => i.status === "failed" || i.status === "canceled");

  return (
    <div className="mt-4 grid gap-3" data-testid="folder-done-step">
      <p className="text-body text-fg-primary" role="status" aria-live="polite" aria-atomic="true">
        {t("media.folderImportDone", {
          imported: props.report.imported,
          skipped: props.report.skipped,
          failed: props.report.failed,
        })}
      </p>
      {failed.length > 0 ? (
        <ul
          role="list"
          className="border-border bg-surface-subtle divide-border divide-y rounded-[var(--radius-control)] border"
        >
          {failed.map((item) => (
            <li key={item.id} className="bg-surface flex items-center gap-3 px-3 py-2">
              <AlertCircle className="text-danger h-5 w-5" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-body truncate">{item.title}</p>
                <p className="text-label text-fg-secondary">{item.code ?? "unknown"}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => props.onRetry(item)}>
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                {t("media.folderRetry")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="lg" onClick={props.onRefresh}>
          {t("media.folderButtonDone")}
        </Button>
      </div>
    </div>
  );
}
