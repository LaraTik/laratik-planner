"use client";

import { useState } from "react";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { AdvertisingReportViewConfig } from "@/lib/advertising/reporting-view-config";

type Labels = {
  share: string;
  title: string;
  description: string;
  expires: string;
  sevenDays: string;
  thirtyDays: string;
  cancel: string;
  create: string;
  creating: string;
  copy: string;
  copied: string;
  error: string;
  authenticated: string;
};

export function AdvertisingShareDialog({
  workspaceSlug,
  viewConfig,
  labels,
}: {
  workspaceSlug: string;
  viewConfig: AdvertisingReportViewConfig;
  labels: Labels;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<7 | 30>(7);
  const [state, setState] = useState<"idle" | "creating" | "success" | "error">("idle");
  const [path, setPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = async () => {
    if (state === "creating") return;
    setState("creating");
    try {
      const response = await fetch("/api/advertising/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSlug, viewConfig, expiresInDays: days }),
      });
      if (!response.ok) throw new Error("share_failed");
      const payload = (await response.json()) as { path?: string };
      if (!payload.path) throw new Error("share_failed");
      setPath(payload.path);
      setState("success");
    } catch {
      setState("error");
    }
  };
  const copy = async () => {
    if (!path) return;
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopied(true);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setState("idle");
          setPath(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {labels.share}
        </Button>
      </DialogTrigger>
      <DialogContent closeAriaLabel={labels.cancel} data-testid="advertising-share-dialog">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-border-subtle bg-surface-subtle text-label text-fg-secondary rounded-[var(--radius-control)] border p-3">
            {labels.authenticated}
          </div>
          <div className="space-y-2">
            <label
              className="text-label text-fg-primary font-semibold"
              htmlFor="advertising-share-expiry"
            >
              {labels.expires}
            </label>
            <select
              id="advertising-share-expiry"
              value={days}
              onChange={(event) => setDays(Number(event.target.value) as 7 | 30)}
              className="border-border bg-surface text-body text-fg-primary min-h-11 w-full rounded-[var(--radius-control)] border px-3"
            >
              <option value="7">{labels.sevenDays}</option>
              <option value="30">{labels.thirtyDays}</option>
            </select>
          </div>
          {path ? (
            <div
              className="border-border bg-surface flex items-center gap-2 rounded-[var(--radius-control)] border p-2"
              role="status"
            >
              <code className="text-label min-w-0 flex-1 truncate">
                {window.location.origin}
                {path}
              </code>
              <Button type="button" size="sm" variant="ghost" onClick={copy}>
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? labels.copied : labels.copy}
              </Button>
            </div>
          ) : null}
          {state === "error" ? (
            <p className="text-label text-danger" role="alert">
              {labels.error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button
            type="button"
            onClick={create}
            disabled={state === "creating" || state === "success"}
          >
            {state === "creating" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {state === "creating" ? labels.creating : labels.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
