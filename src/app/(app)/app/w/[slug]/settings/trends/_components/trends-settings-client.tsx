"use client";

import * as React from "react";
import { Settings2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocaleT } from "@/components/i18n/locale-provider";

type Source = {
  key: string;
  displayName: string;
  optedOut: boolean;
  optoutReason: string | null;
};

/**
 * Workspace trend settings — per-source opt-out toggles.
 *
 * v1 stores opt-outs via `POST /api/trends/sources/{key}/optout`
 * (workspace-scoped, see `workspace_source_optout` table).
 * The toggle is two-staged: a confirm dialog with a required reason
 * (≥ 4 chars) so the audit log carries a human-readable motivation.
 */
export function TrendsSettingsClient({
  workspaceId: _workspaceId,
  workspaceSlug: _workspaceSlug,
  sources,
}: {
  workspaceId: string;
  workspaceSlug: string;
  sources: Source[];
}) {
  void _workspaceId;
  void _workspaceSlug;
  const t = useLocaleT();
  const [rows, setRows] = React.useState<Source[]>(sources);
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [confirmKey, setConfirmKey] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

  const toggle = async (source: Source) => {
    if (!source.optedOut) {
      // Enabling (removing opt-out) is silent; only opting out
      // needs a confirm dialog with a reason.
      setPending((p) => new Set(p).add(source.key));
      try {
        const res = await fetch(`/api/trends/sources/${source.key}/optout`, {
          method: "DELETE",
        });
        if (res.ok) {
          setRows((prev) =>
            prev.map((r) =>
              r.key === source.key ? { ...r, optedOut: false, optoutReason: null } : r,
            ),
          );
        }
      } finally {
        setPending((p) => {
          const next = new Set(p);
          next.delete(source.key);
          return next;
        });
      }
      return;
    }
    setConfirmKey(source.key);
  };

  const confirmOptout = async () => {
    if (!confirmKey) return;
    setPending((p) => new Set(p).add(confirmKey));
    try {
      const res = await fetch(`/api/trends/sources/${confirmKey}/optout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.key === confirmKey ? { ...r, optedOut: true, optoutReason: reason } : r,
          ),
        );
        setReason("");
        setConfirmKey(null);
      }
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(confirmKey);
        return next;
      });
    }
  };

  return (
    <section
      data-testid="trends-optout-section"
      className="border-border bg-surface-card rounded-[var(--radius-card)] border p-4"
    >
      <header className="mb-3 flex items-center gap-2">
        <Settings2 className="text-fg-muted h-5 w-5" aria-hidden="true" />
        <h2 className="text-title-card text-fg-primary font-semibold">
          {t("trends.settings.optoutTitle") || "Source opt-out"}
        </h2>
      </header>
      <p className="text-body text-fg-secondary mb-3 max-w-3xl">
        {t("trends.settings.optoutBody") ||
          "Opt out of specific sources for this workspace without affecting the rest of the agency."}
      </p>
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-label text-fg-muted">
            {t("trends.settings.noSources") || "No enabled sources to manage."}
          </li>
        ) : (
          rows.map((source) => (
            <li
              key={source.key}
              className="border-border bg-surface-subtle flex flex-col gap-3 rounded border p-3 transition-colors duration-200 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`optout-row-${source.key}`}
            >
              <div>
                <p className="text-body text-fg-primary font-medium">{source.displayName}</p>
                <p className="text-label text-fg-muted text-xs">{source.key}</p>
                {source.optedOut ? (
                  <p className="text-label text-fg-muted mt-1 text-xs">
                    {t("trends.settings.optoutReason", {
                      reason: source.optoutReason ?? "",
                    }) || `Reason: ${source.optoutReason}`}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {source.optedOut ? (
                  <span
                    data-testid={`optout-badge-${source.key}`}
                    className="border-border bg-surface-card text-fg-secondary rounded-full border px-2 py-0.5 text-xs"
                  >
                    {t("trends.settings.optedOut") || "Opted out"}
                  </span>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={source.optedOut ? "outline" : "secondary"}
                  onClick={() => toggle(source)}
                  disabled={pending.has(source.key)}
                  data-testid={`optout-toggle-${source.key}`}
                >
                  <ShieldOff className="h-4 w-4" aria-hidden="true" />
                  {source.optedOut
                    ? t("trends.settings.reEnable") || "Re-enable"
                    : t("trends.settings.optOut") || "Opt out"}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>

      <Dialog
        open={Boolean(confirmKey)}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmKey(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("trends.settings.optoutConfirmTitle") || "Opt out of this source?"}
            </DialogTitle>
            <DialogDescription>
              {t("trends.settings.optoutConfirmBody") ||
                "Add a short reason. It will be saved to the audit log."}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="optout-reason">
              {t("trends.settings.optoutReasonLabel") || "Reason"}
            </Label>
            <Input
              id="optout-reason"
              data-testid="optout-reason-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("trends.settings.optoutReasonPlaceholder") || "e.g. brand-safety"}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirmKey(null);
                setReason("");
              }}
            >
              {t("common.cancel") || "Cancel"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmOptout}
              disabled={reason.trim().length < 4 || !confirmKey}
              data-testid="optout-confirm"
            >
              {t("trends.settings.optoutConfirmSubmit") || "Opt out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
