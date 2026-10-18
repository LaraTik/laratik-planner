"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CheckCircle2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  advertisingReportViewConfigToSearchParams,
  type AdvertisingReportViewConfig,
} from "@/lib/advertising/reporting-view-config";

type Labels = {
  saveView: string;
  saveViewTitle: string;
  saveViewDescription: string;
  viewName: string;
  viewNamePlaceholder: string;
  shareScope: string;
  private: string;
  workspace: string;
  cancel: string;
  save: string;
  saving: string;
  saveSuccess: string;
  saveError: string;
  savedViews: string;
  noSavedViews: string;
  loadView: string;
};

type SavedView = {
  id: string;
  name: string;
  shareScope: string;
  viewConfig: AdvertisingReportViewConfig;
};

export function AdvertisingSaveViewDialog({
  workspaceSlug,
  viewConfig,
  labels,
}: {
  workspaceSlug: string;
  viewConfig: AdvertisingReportViewConfig;
  labels: Labels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shareScope, setShareScope] = useState<"me" | "workspace">("me");
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [views, setViews] = useState<SavedView[]>([]);
  const [loadingViews, setLoadingViews] = useState(false);

  const loadViews = async () => {
    setLoadingViews(true);
    try {
      const response = await fetch(
        `/api/advertising/saved-views?workspace=${encodeURIComponent(workspaceSlug)}`,
        { headers: { Accept: "application/json" } },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as { views?: SavedView[] };
      setViews(payload.views ?? []);
    } finally {
      setLoadingViews(false);
    }
  };

  const save = async () => {
    if (!name.trim() || state === "saving") return;
    setState("saving");
    try {
      const response = await fetch("/api/advertising/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          shareScope,
          workspaceSlug,
          viewConfig,
        }),
      });
      if (!response.ok) throw new Error("save_failed");
      setState("success");
      setName("");
      await loadViews();
    } catch {
      setState("error");
    }
  };

  const handleOpenSavedView = (config: AdvertisingReportViewConfig) => {
    const params = advertisingReportViewConfigToSearchParams(config);
    router.push(`${window.location.pathname}?${params.toString()}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadViews();
        if (!next) setState("idle");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Bookmark className="h-4 w-4" aria-hidden="true" />
          {labels.saveView}
        </Button>
      </DialogTrigger>
      <DialogContent closeAriaLabel={labels.cancel} data-testid="advertising-save-view-dialog">
        <DialogHeader>
          <DialogTitle>{labels.saveViewTitle}</DialogTitle>
          <DialogDescription>{labels.saveViewDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label
              className="text-label text-fg-primary font-semibold"
              htmlFor="advertising-view-name"
            >
              {labels.viewName}
            </label>
            <Input
              id="advertising-view-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={labels.viewNamePlaceholder}
              autoFocus
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <label
              className="text-label text-fg-primary font-semibold"
              htmlFor="advertising-view-share"
            >
              {labels.shareScope}
            </label>
            <select
              id="advertising-view-share"
              value={shareScope}
              onChange={(event) => setShareScope(event.target.value as "me" | "workspace")}
              className="border-border bg-surface text-body text-fg-primary min-h-11 w-full rounded-[var(--radius-control)] border px-3"
            >
              <option value="me">{labels.private}</option>
              <option value="workspace">{labels.workspace}</option>
            </select>
          </div>
          {state === "success" ? (
            <p className="text-label text-success flex items-center gap-2" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {labels.saveSuccess}
            </p>
          ) : null}
          {state === "error" ? (
            <p className="text-label text-danger" role="alert">
              {labels.saveError}
            </p>
          ) : null}
          <div className="border-border-subtle border-t pt-4">
            <p className="text-label text-fg-primary mb-2 font-semibold">{labels.savedViews}</p>
            {loadingViews ? (
              <p className="text-label text-fg-muted">{labels.saving}</p>
            ) : views.length === 0 ? (
              <p className="text-label text-fg-muted">{labels.noSavedViews}</p>
            ) : (
              <ul className="space-y-2" aria-label={labels.savedViews}>
                {views.map((view) => (
                  <li
                    key={view.id}
                    className="border-border-subtle bg-surface-subtle flex items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 py-2"
                  >
                    <span className="text-label text-fg-primary min-w-0 truncate">{view.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenSavedView(view.viewConfig)}
                    >
                      {labels.loadView}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button type="button" onClick={save} disabled={!name.trim() || state === "saving"}>
            {state === "saving" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {state === "saving" ? labels.saving : labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
