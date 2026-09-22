"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listMetaPublicationCandidatesAction,
  linkMetaPublicationAction,
} from "@/app/(app)/app/w/[slug]/planning/actions";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

export type MetaPublicationCandidateDto = {
  id: string;
  platform: "facebook" | "instagram";
  status: "scheduled" | "published";
  caption: string | null;
  mediaType: "image" | "video" | "carousel" | "reel" | "unknown";
  permalink: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
};

function dateLabel(value: string | null, locale: "en" | "ar", timeZone: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
        date,
      );
}

export function MetaPublicationLinkDialog({
  open,
  onOpenChange,
  workspaceSlug,
  contentItemChannelId,
  platform,
  targetDate,
  searchText,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceSlug: string;
  contentItemChannelId: string;
  platform: "facebook" | "instagram";
  targetDate?: string | null;
  searchText?: string | null;
  timeZone: string;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [candidates, setCandidates] = React.useState<MetaPublicationCandidateDto[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (after?: string) => {
      setLoading(true);
      setErrorCode(null);
      try {
        const result = await listMetaPublicationCandidatesAction({
          workspaceSlug,
          contentItemChannelId,
          ...(after ? { after } : {}),
          ...(!after && targetDate ? { targetDate } : {}),
          ...(!after && searchText ? { searchText } : {}),
        });
        if (result.ok) {
          setCandidates((current) => {
            const merged = after ? [...current, ...result.candidates] : result.candidates;
            return [...new Map(merged.map((candidate) => [candidate.id, candidate])).values()];
          });
          setNextCursor(result.nextCursor);
          if (!after) setSelectedId(result.candidates[0]?.id ?? null);
        } else {
          setErrorCode(result.errorCode);
        }
      } catch {
        setErrorCode("provider_unavailable");
      } finally {
        setLoading(false);
      }
    },
    [contentItemChannelId, searchText, targetDate, workspaceSlug],
  );

  React.useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, open]);

  async function linkSelected() {
    if (!selectedId) return;
    setSaving(true);
    setErrorCode(null);
    try {
      const result = await linkMetaPublicationAction({
        workspaceSlug,
        contentItemChannelId,
        externalPostId: selectedId,
      });
      if (result.ok) onOpenChange(false);
      else setErrorCode(result.errorCode);
    } catch {
      setErrorCode("provider_unavailable");
    } finally {
      setSaving(false);
    }
  }

  const errorText = errorCode ? t(`contentDetail.publishingCard.meta.errors.${errorCode}`) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] max-w-2xl overflow-y-auto"
        closeAriaLabel={t("contentDetail.publishingCard.meta.close")}
      >
        <DialogHeader>
          <DialogTitle>{t("contentDetail.publishingCard.meta.title")}</DialogTitle>
          <DialogDescription>
            {t("contentDetail.publishingCard.meta.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <p className="text-label text-fg-muted">
            {t(`contentDetail.publishingCard.meta.platform.${platform}`)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void load()}
            disabled={loading || saving}
          >
            <RefreshCw
              className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              aria-hidden="true"
            />
            {t("contentDetail.publishingCard.meta.refresh")}
          </Button>
        </div>

        {errorText ? (
          <p role="alert" className="text-label text-danger">
            {errorText}
          </p>
        ) : null}
        {loading && candidates.length === 0 ? (
          <div className="text-body text-fg-muted flex items-center gap-2 py-8" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("contentDetail.publishingCard.meta.loading")}
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-body text-fg-muted rounded-[var(--radius-control)] border border-dashed p-6 text-center">
            {t("contentDetail.publishingCard.meta.empty")}
          </p>
        ) : (
          <div
            className="space-y-2"
            role="radiogroup"
            aria-label={t("contentDetail.publishingCard.meta.candidatesLabel")}
          >
            {candidates.map((candidate) => {
              const date =
                candidate.status === "scheduled"
                  ? candidate.scheduledAt
                  : (candidate.publishedAt ?? candidate.createdAt);
              return (
                <label
                  key={candidate.id}
                  className="border-border hover:bg-surface-subtle flex cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3"
                >
                  <input
                    type="radio"
                    name="meta-publication-candidate"
                    value={candidate.id}
                    checked={selectedId === candidate.id}
                    onChange={() => setSelectedId(candidate.id)}
                    className="mt-1"
                  />
                  {candidate.thumbnailUrl ? (
                    <div
                      className="h-14 w-14 shrink-0 rounded bg-cover bg-center"
                      aria-hidden="true"
                      style={{ backgroundImage: `url(${candidate.thumbnailUrl})` }}
                    />
                  ) : (
                    <div
                      className="bg-surface-subtle h-14 w-14 shrink-0 rounded"
                      aria-hidden="true"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={candidate.status === "published" ? "success" : "info"}>
                        {t(`contentDetail.publishingCard.meta.status.${candidate.status}`)}
                      </Badge>
                      <span className="text-label text-fg-muted">
                        {t(`contentDetail.publishingCard.meta.mediaType.${candidate.mediaType}`)}
                      </span>
                      {date ? (
                        <span className="text-label text-fg-muted">
                          {dateLabel(date, locale, timeZone)}
                        </span>
                      ) : null}
                    </span>
                    <span
                      dir="auto"
                      className="text-body text-fg-primary mt-1 line-clamp-2 block break-words"
                    >
                      {candidate.caption || t("contentDetail.publishingCard.meta.noCaption")}
                    </span>
                    {candidate.permalink ? (
                      <a
                        href={candidate.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-label text-primary mt-1 inline-flex items-center gap-1"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        {t("contentDetail.publishingCard.meta.previewLink")}
                      </a>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {nextCursor ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void load(nextCursor)}
            disabled={loading}
          >
            {t("contentDetail.publishingCard.meta.loadMore")}
          </Button>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("contentDetail.publishingCard.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void linkSelected()}
            disabled={!selectedId || loading || saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {t("contentDetail.publishingCard.meta.confirmLink")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
