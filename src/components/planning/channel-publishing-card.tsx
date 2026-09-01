"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2, Send, AlertTriangle } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { recordPublicationAction } from "@/app/(app)/app/w/[slug]/planning/actions";
import { PlatformIcon } from "@/components/workspace/platform-icon";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * ChannelPublishingCard — per-channel publishing card. Shows the
 * current publication state for a single channel and the
 * record-outcome form inline (no separate "edit" form to
 * discover). Channels without a configured destination hide
 * entirely; channels with a destination show the card even
 * when no action has been taken yet.
 *
 * Why a card per channel instead of a list row:
 *  - The list-row UX in the old PublishingSection forced the
 *    user to click "Record" to see a per-channel form. A card
 *    always shows the form, so the action is one click
 *    shorter and the form is a discoverable affordance.
 *  - Each card can hold its own "configure publish package"
 *    affordance (caption / disclosures / first-comment) as
 *    the package grows, without the user navigating away.
 *
 * Bilingual copy:
 *   The status badge, setup badge, note / failure prefixes,
 *   button labels, and inline form labels are all routed
 *   through `contentDetail.publishingCard.*` keys. The card
 *   reads its translator from the active `LocaleProvider`
 *   via `useLocaleT()`; isolated previews and unit tests
 *   that render the card outside a provider fall back to
 *   the English catalog (the provider's documented
 *   "no-context" default).
 */

export interface ChannelPublishingCardProps {
  workspaceSlug: string;
  channel: {
    id: string;
    platform: string;
    accountName: string;
    /**
     * The per-channel publish configuration. When the user
     * hasn't configured a caption / disclosures yet, this is
     * null and the card shows an "In setup" badge.
     */
    configured: boolean;
  };
  publication: {
    status: "pending" | "published" | "failed" | "skipped";
    publishedUrl: string | null;
    note: string | null;
    failureReason: string | null;
  } | null;
  isPublisher: boolean;
  /** Optional link to the publish-package form, shown in the
   *  card's footer when the channel is in setup. */
  publishPackageHref?: string;
}

const STATUS_VARIANT: Record<
  NonNullable<ChannelPublishingCardProps["publication"]>["status"],
  "default" | "info" | "success" | "warning" | "danger"
> = {
  pending: "info",
  published: "success",
  failed: "danger",
  skipped: "default",
};

export function ChannelPublishingCard({
  workspaceSlug,
  channel,
  publication,
  isPublisher,
  publishPackageHref,
}: ChannelPublishingCardProps) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const status = publication?.status ?? "pending";

  return (
    <Card padding="md" data-testid="channel-publishing-card" data-channel-id={channel.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PlatformIcon platform={channel.platform} className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <CardTitle className="text-body text-fg-primary truncate font-semibold">
              {channel.accountName}
            </CardTitle>
            <CardDescription className="truncate">{channel.platform}</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!channel.configured ? (
            <Badge variant="warning" data-testid="channel-card-setup">
              <AlertTriangle className="me-1 h-3 w-3" aria-hidden="true" />
              {t("contentDetail.publishingCard.inSetup")}
            </Badge>
          ) : null}
          <Badge variant={STATUS_VARIANT[status]} data-testid="channel-card-status">
            {t(`contentDetail.publishingCard.status.${status}`)}
          </Badge>
        </div>
      </div>

      {/* Outcome details */}
      {publication?.publishedUrl ? (
        <p className="text-label text-fg-muted mt-2 break-all">
          <a
            href={publication.publishedUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("contentDetail.publishingCard.publishedUrlAria")}
            className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="channel-card-published-url"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {publication.publishedUrl}
          </a>
        </p>
      ) : null}
      {publication?.note ? (
        <p className="text-label text-fg-muted mt-1">
          {t("contentDetail.publishingCard.notePrefix", { note: publication.note })}
        </p>
      ) : null}
      {publication?.failureReason ? (
        <p className="text-label text-danger mt-1" data-testid="channel-card-failure">
          {t("contentDetail.publishingCard.failurePrefix", { reason: publication.failureReason })}
        </p>
      ) : null}

      {/* Inline outcome form — only for users with the publisher
          (or manager) role. The form opens inline instead of
          requiring a modal or a second click. */}
      {isPublisher ? (
        open ? (
          <form
            action={(fd) => {
              const publishedUrl = (fd.get("publishedUrl") as string) || undefined;
              const note = (fd.get("note") as string) || undefined;
              const failureReason = (fd.get("failureReason") as string) || undefined;
              start(async () => {
                setError(null);
                const result = await recordPublicationAction({
                  workspaceSlug,
                  contentItemChannelId: channel.id,
                  status: fd.get("status") as "published" | "skipped" | "failed",
                  ...(publishedUrl ? { publishedUrl } : {}),
                  ...(note ? { note } : {}),
                  ...(failureReason ? { failureReason } : {}),
                });
                if (result?.error) {
                  setError(result.error);
                } else {
                  setOpen(false);
                }
              });
            }}
            className="border-border bg-canvas mt-3 space-y-2 rounded-[var(--radius-control)] border p-3"
          >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div>
                <label
                  htmlFor={`publication-status-${channel.id}`}
                  className="text-label mb-1 block font-medium"
                >
                  {t("contentDetail.publishingCard.outcomeLabel")}
                </label>
                <select
                  id={`publication-status-${channel.id}`}
                  name="status"
                  defaultValue="published"
                  className="border-border bg-surface text-body min-h-9 w-full rounded-[var(--radius-control)] border px-2 py-1"
                  data-testid="channel-card-outcome-select"
                >
                  <option value="published">
                    {t("contentDetail.publishingCard.outcomePublished")}
                  </option>
                  <option value="skipped">
                    {t("contentDetail.publishingCard.outcomeSkipped")}
                  </option>
                  <option value="failed">{t("contentDetail.publishingCard.outcomeFailed")}</option>
                </select>
              </div>
              <div className="md:col-span-3">
                <label
                  htmlFor={`published-url-${channel.id}`}
                  className="text-label mb-1 block font-medium"
                >
                  {t("contentDetail.publishingCard.publishedUrlLabel")}
                </label>
                <input
                  id={`published-url-${channel.id}`}
                  type="url"
                  name="publishedUrl"
                  placeholder="https://…"
                  className="border-border bg-surface text-body min-h-9 w-full rounded-[var(--radius-control)] border px-2 py-1"
                  data-testid="channel-card-published-url-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <label
                  htmlFor={`publication-note-${channel.id}`}
                  className="text-label mb-1 block font-medium"
                >
                  {t("contentDetail.publishingCard.noteLabel")}
                </label>
                <input
                  id={`publication-note-${channel.id}`}
                  type="text"
                  name="note"
                  className="border-border bg-surface text-body min-h-9 w-full rounded-[var(--radius-control)] border px-2 py-1"
                />
              </div>
              <div>
                <label
                  htmlFor={`publication-failure-${channel.id}`}
                  className="text-label mb-1 block font-medium"
                >
                  {t("contentDetail.publishingCard.failureReasonLabel")}
                </label>
                <input
                  id={`publication-failure-${channel.id}`}
                  type="text"
                  name="failureReason"
                  className="border-border bg-surface text-body min-h-9 w-full rounded-[var(--radius-control)] border px-2 py-1"
                />
              </div>
            </div>
            {error ? (
              <p role="alert" className="text-label text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {pending
                  ? t("contentDetail.publishingCard.savingOutcome")
                  : t("contentDetail.publishingCard.saveOutcome")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                {t("contentDetail.publishingCard.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpen(true)}
              data-testid="channel-card-record-outcome"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {publication
                ? t("contentDetail.publishingCard.updateOutcome")
                : t("contentDetail.publishingCard.recordOutcome")}
            </Button>
            {!channel.configured && publishPackageHref ? (
              <Button size="sm" variant="ghost" asChild>
                <a href={publishPackageHref} data-testid="channel-card-configure">
                  {t("contentDetail.publishingCard.configurePublishPackage")}
                </a>
              </Button>
            ) : null}
          </div>
        )
      ) : null}
    </Card>
  );
}
