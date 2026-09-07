"use client";

import * as React from "react";
import { Loader2, RotateCcw, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocaleT } from "@/components/i18n/locale-provider";

export function MediaAssetActions({
  assetId,
  title,
  trashed,
  canManage,
}: {
  assetId: string;
  title: string;
  trashed: boolean;
  canManage: boolean;
}) {
  const t = useLocaleT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(false);
  if (!canManage) return null;

  async function request(input: RequestInit) {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`/api/media/assets/${encodeURIComponent(assetId)}`, input);
      if (!response.ok) throw new Error("media action failed");
      window.location.reload();
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="border-border mt-2 grid gap-2 border-t pt-2">
      <form
        className="flex min-w-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const nextTitle = String(data.get("title") ?? "").trim();
          if (nextTitle)
            void request({
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: nextTitle }),
            });
        }}
      >
        <Input
          name="title"
          defaultValue={title}
          aria-label={t("media.titleLabel")}
          className="mt-0 h-9 min-w-0"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            t("common.save")
          )}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {!trashed ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void request({
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ visibility: "agency" }),
                })
              }
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {t("media.share")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("media.trashConfirm"))) {
                  void request({ method: "DELETE" });
                }
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("media.trash")}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void request({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "restore" }),
              })
            }
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("media.restore")}
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-label text-danger" role="alert">
          {t("media.manageError")}
        </p>
      ) : null}
    </div>
  );
}
