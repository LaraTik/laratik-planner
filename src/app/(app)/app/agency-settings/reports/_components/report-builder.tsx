"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocaleT } from "@/components/i18n/locale-provider";
import type { GenerateReportState } from "@/app/(app)/app/agency-settings/reports/actions";

export interface ReportBuilderWorkspace {
  id: string;
  name: string;
}

export interface ReportBuilderChannel {
  id: string;
  name: string;
  channelType: string;
  workspaceId: string;
}

export interface ReportBuilderTemplate {
  id: string;
  /** i18n key for the label. */
  labelKey: string;
  /** Fallback English label when the i18n key is missing. */
  labelFallback: string;
  /** i18n key for the blurb. */
  blurbKey: string;
  blurbFallback: string;
  available: boolean;
}

export interface ReportBuilderProps {
  templates: ReportBuilderTemplate[];
  workspaces: ReportBuilderWorkspace[];
  channels: ReportBuilderChannel[];
  /** Server action used by the form. */
  generate: (prev: GenerateReportState, formData: FormData) => Promise<GenerateReportState>;
}

const PRESETS: Array<{ value: "7d" | "30d" | "90d" | "custom"; labelKey: string }> = [
  { value: "7d", labelKey: "reports.preset7d" },
  { value: "30d", labelKey: "reports.preset30d" },
  { value: "90d", labelKey: "reports.preset90d" },
  { value: "custom", labelKey: "reports.presetCustom" },
];

/**
 * Builder state lives in two pieces:
 *  - `templateId` — single-select radio.
 *  - `selection`  — every workspace + per-workspace channel choice in
 *                   one immutable Map. Re-selecting a workspace the
 *                   user previously deselected restores the prior
 *                   per-channel choice (no effect, no setState dance).
 */
interface BuilderSelection {
  workspaces: Set<string>;
  channelsByWorkspace: Map<string, Set<string>>;
}

function buildInitialSelection(
  workspaces: ReportBuilderWorkspace[],
  channels: ReportBuilderChannel[],
): BuilderSelection {
  const ws = new Set(workspaces.map((w) => w.id));
  const channelsByWorkspace = new Map<string, Set<string>>();
  for (const c of channels) {
    const bucket = channelsByWorkspace.get(c.workspaceId) ?? new Set<string>();
    bucket.add(c.id);
    channelsByWorkspace.set(c.workspaceId, bucket);
  }
  return { workspaces: ws, channelsByWorkspace };
}

export function ReportBuilder({ templates, workspaces, channels, generate }: ReportBuilderProps) {
  const t = useLocaleT();
  const initialTemplateId = templates.find((tpl) => tpl.available)?.id ?? templates[0]?.id ?? "";
  const [templateId, setTemplateId] = React.useState(initialTemplateId);
  const [selection, setSelection] = React.useState<BuilderSelection>(() =>
    buildInitialSelection(workspaces, channels),
  );

  const channelsByWorkspaceId = React.useMemo(() => {
    const map = new Map<string, ReportBuilderChannel[]>();
    for (const c of channels) {
      const list = map.get(c.workspaceId) ?? [];
      list.push(c);
      map.set(c.workspaceId, list);
    }
    return map;
  }, [channels]);

  const visibleChannels = React.useMemo(() => {
    const out: ReportBuilderChannel[] = [];
    for (const wid of selection.workspaces) {
      const picked = selection.channelsByWorkspace.get(wid);
      if (!picked) continue;
      for (const c of channelsByWorkspaceId.get(wid) ?? []) {
        if (picked.has(c.id)) out.push(c);
      }
    }
    return out;
  }, [selection.workspaces, selection.channelsByWorkspace, channelsByWorkspaceId]);

  const toggleWorkspace = React.useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev.workspaces);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, workspaces: next };
    });
  }, []);

  const toggleChannel = React.useCallback((workspaceId: string, channelId: string) => {
    setSelection((prev) => {
      const map = new Map(prev.channelsByWorkspace);
      const bucket = new Set(map.get(workspaceId) ?? []);
      if (bucket.has(channelId)) bucket.delete(channelId);
      else bucket.add(channelId);
      map.set(workspaceId, bucket);
      return { ...prev, channelsByWorkspace: map };
    });
  }, []);

  const [state, formAction] = useActionState<GenerateReportState, FormData>(generate, {});

  const totalSelectedChannels = visibleChannels.length;

  return (
    <form action={formAction} className="space-y-6" data-testid="report-builder-form">
      {/* Template picker */}
      <fieldset className="space-y-3">
        <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
          {t("reports.templateLegend")}
        </legend>
        <input type="hidden" name="templateId" value={templateId} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => {
            const checked = templateId === template.id;
            const labelText = t(template.labelKey);
            const blurbText = t(template.blurbKey);
            return (
              <label
                key={template.id}
                data-testid={`report-template-${template.id}`}
                className={`border-border relative rounded-[var(--radius-control)] border p-4 transition-colors ${
                  template.available ? "hover:bg-surface-subtle cursor-pointer" : "opacity-60"
                } ${checked ? "border-primary bg-primary-subtle" : ""}`}
              >
                <input
                  type="radio"
                  name="templateIdDisplay"
                  value={template.id}
                  checked={checked}
                  disabled={!template.available}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="sr-only"
                />
                <div className="flex items-start gap-2">
                  <FileText className="text-primary h-5 w-5 shrink-0" aria-hidden={true} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-body text-fg-primary font-semibold">{labelText}</span>
                      {!template.available ? (
                        <Badge variant="outline">{t("reports.comingSoon")}</Badge>
                      ) : null}
                    </div>
                    <p className="text-label text-fg-secondary mt-1 leading-snug">{blurbText}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Workspaces */}
      <fieldset className="space-y-3">
        <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
          {t("reports.workspacesLegend")}
        </legend>
        {workspaces.length === 0 ? (
          <p className="text-body text-fg-muted">{t("reports.noWorkspaces")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {workspaces.map((w) => {
              const checked = selection.workspaces.has(w.id);
              return (
                <label
                  key={w.id}
                  className="border-border hover:bg-surface-subtle flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border p-3"
                  data-testid={`report-workspace-${w.id}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleWorkspace(w.id)}
                    className="h-4 w-4 rounded-[var(--radius-control)]"
                  />
                  <span className="text-body text-fg-primary font-medium">{w.name}</span>
                  <span className="text-label text-fg-muted ms-auto">
                    {t("reports.workspaceChannelsCount", {
                      count: channelsByWorkspaceId.get(w.id)?.length ?? 0,
                    })}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* Channels (visible per selected workspace) */}
      <fieldset className="space-y-3">
        <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
          {t("reports.channelsLegend")}
        </legend>
        {visibleChannels.length === 0 ? (
          <p className="text-body text-fg-muted">{t("reports.noChannels")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visibleChannels.map((c) => {
              const bucket = selection.channelsByWorkspace.get(c.workspaceId) ?? new Set<string>();
              const checked = bucket.has(c.id);
              return (
                <label
                  key={c.id}
                  className="border-border hover:bg-surface-subtle flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border p-3"
                  data-testid={`report-channel-${c.id}`}
                >
                  <input type="hidden" name="channelIds" value={c.id} />
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChannel(c.workspaceId, c.id)}
                    className="h-4 w-4 rounded-[var(--radius-control)]"
                  />
                  <span className="text-body text-fg-primary font-medium">{c.name}</span>
                  <Badge variant="outline" className="ms-auto">
                    {c.channelType}
                  </Badge>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      {/* Period */}
      <fieldset className="space-y-3">
        <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
          {t("reports.periodLegend")}
        </legend>
        <div className="flex flex-wrap items-center gap-3">
          {PRESETS.map((p) => (
            <label
              key={p.value}
              className="border-border text-body text-fg-primary flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border p-2 ps-3"
            >
              <input
                type="radio"
                name="preset"
                value={p.value}
                defaultChecked={p.value === "30d"}
                className="h-4 w-4"
              />
              <Calendar className="text-fg-muted h-4 w-4" aria-hidden={true} />
              <span>{t(p.labelKey)}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="reports-from">{t("reports.fromLabel")}</Label>
            <Input id="reports-from" type="date" name="from" required={false} />
          </div>
          <div>
            <Label htmlFor="reports-to">{t("reports.toLabel")}</Label>
            <Input id="reports-to" type="date" name="to" required={false} />
          </div>
        </div>
        <p className="text-label text-fg-muted">{t("reports.customPeriodHint")}</p>
      </fieldset>

      {/* Prepared for */}
      <div>
        <Label htmlFor="reports-prepared-for">{t("reports.preparedForLabel")}</Label>
        <Input
          id="reports-prepared-for"
          name="preparedFor"
          placeholder={t("reports.preparedForPlaceholder")}
          maxLength={120}
        />
      </div>

      {state.error ? (
        <div
          className="border-danger/40 bg-danger-subtle text-body text-danger rounded-[var(--radius-control)] border p-3"
          data-testid="reports-form-error"
        >
          {state.error}
        </div>
      ) : null}

      {state.ok && state.reportId ? (
        <div
          className="border-success/40 bg-success-subtle text-body text-success rounded-[var(--radius-control)] border p-3"
          data-testid="reports-form-success"
        >
          {t("reports.successReady", { id: state.reportId })}
          {" · "}
          <Link
            href={`/api/reports/${state.reportId}/pdf`}
            className="underline"
            data-testid="reports-download-link"
          >
            {t("reports.downloadCta")}
          </Link>
        </div>
      ) : null}

      <div className="flex justify-end gap-3">
        <Button asChild variant="ghost">
          <Link href="/app/agency-settings">{t("common.cancel")}</Link>
        </Button>
        <Button
          type="submit"
          data-testid="reports-generate-submit"
          disabled={selection.workspaces.size === 0 || totalSelectedChannels === 0}
        >
          <FileText className="h-4 w-4" aria-hidden={true} />
          {t("reports.generateCta")}
        </Button>
      </div>
    </form>
  );
}
