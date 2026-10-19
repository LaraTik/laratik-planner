"use client";

/* eslint-disable @next/next/no-img-element -- provider-returned HTTPS URLs are not configured for Next's image loader. */

import { useMemo, useState } from "react";
import { ExternalLink, ImageOff, Info, PlaySquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/i18n/format-locale";
import type { CreativeFatigueInsight } from "@/lib/advertising/intelligence";
import type { AdvertisingAdSummary } from "@/lib/advertising/reporting-view";
import {
  AdvertisingTaxonomyEditor,
  type AdvertisingLocalTagView,
} from "./advertising-taxonomy-editor";

export type AdvertisingCreativeExplorerLabels = {
  title: string;
  description: string;
  empty: string;
  unavailablePreview: string;
  openDetails: string;
  detailsTitle: string;
  detailsDescription: string;
  format: string;
  headline: string;
  body: string;
  link: string;
  campaign: string;
  status: string;
  spend: string;
  results: string;
  costPerResult: string;
  healthSignal: string;
  stable: string;
  fatiguing: string;
  insufficientData: string;
  unavailable: string;
  image: string;
  video: string;
  reel: string;
  carousel: string;
  noHeadline: string;
  noBody: string;
  close: string;
  taxonomyTitle: string;
  taxonomyAdd: string;
  taxonomyRemove: string;
  taxonomyPlaceholder: string;
  taxonomyTopic: string;
  taxonomyBrand: string;
  taxonomyPlatform: string;
  taxonomyObjective: string;
  taxonomyLanguage: string;
  taxonomyMonth: string;
  taxonomyError: string;
};

export function AdvertisingCreativeExplorer({
  ads,
  fatigue,
  currency,
  locale,
  labels,
  workspaceSlug,
  accountId,
  localTagsByEntity,
}: {
  ads: readonly AdvertisingAdSummary[];
  fatigue: readonly CreativeFatigueInsight[];
  currency: string | null;
  locale: string;
  labels: AdvertisingCreativeExplorerLabels;
  workspaceSlug: string;
  accountId: string;
  localTagsByEntity: Readonly<Record<string, readonly AdvertisingLocalTagView[]>>;
}) {
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const fatigueByAdId = useMemo(
    () => new Map(fatigue.map((item) => [item.adId, item] as const)),
    [fatigue],
  );
  const selectedAd = ads.find((ad) => ad.adId === selectedAdId) ?? null;
  const selectedFatigue = selectedAd ? fatigueByAdId.get(selectedAd.adId) : undefined;

  return (
    <>
      <Card data-testid="advertising-reporting-creative-explorer">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlaySquare className="text-primary h-4 w-4" aria-hidden="true" />
            {labels.title}
          </CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </CardHeader>
        {ads.length === 0 ? (
          <p className="text-label text-fg-secondary px-4 pb-4 sm:px-5">{labels.empty}</p>
        ) : (
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
            {ads.map((ad) => {
              const signal = fatigueByAdId.get(ad.adId);
              return (
                <CreativeCard
                  key={ad.adId}
                  ad={ad}
                  signal={signal}
                  currency={currency}
                  locale={locale}
                  labels={labels}
                  workspaceSlug={workspaceSlug}
                  accountId={accountId}
                  localTags={localTagsByEntity[`ad:${ad.adId}`] ?? []}
                  onOpen={() => setSelectedAdId(ad.adId)}
                />
              );
            })}
          </div>
        )}
      </Card>

      <Dialog open={selectedAd !== null} onOpenChange={(open) => !open && setSelectedAdId(null)}>
        <DialogContent
          closeAriaLabel={labels.close}
          className="max-h-[min(760px,calc(100dvh-2rem))] overflow-y-auto sm:max-w-2xl"
          data-testid="advertising-reporting-creative-details"
        >
          {selectedAd ? (
            <>
              <DialogHeader>
                <DialogTitle>{labels.detailsTitle}</DialogTitle>
                <DialogDescription>{labels.detailsDescription}</DialogDescription>
              </DialogHeader>
              <CreativeDetails
                ad={selectedAd}
                signal={selectedFatigue}
                currency={currency}
                locale={locale}
                labels={labels}
              />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreativeCard({
  ad,
  signal,
  currency,
  locale,
  labels,
  workspaceSlug,
  accountId,
  localTags,
  onOpen,
}: {
  ad: AdvertisingAdSummary;
  signal: CreativeFatigueInsight | undefined;
  currency: string | null;
  locale: string;
  labels: AdvertisingCreativeExplorerLabels;
  workspaceSlug: string;
  accountId: string;
  localTags: readonly AdvertisingLocalTagView[];
  onOpen: () => void;
}) {
  const metadata = ad.creativeMetadata;
  const previewUrl = safePreviewUrl(metadata?.previewUrl);
  const title = textValue(metadata?.headline) ?? ad.name ?? ad.adId;
  return (
    <article className="border-border-subtle bg-surface-subtle overflow-hidden rounded-[var(--radius-control)] border">
      <button
        type="button"
        className="focus-visible:ring-focus-ring block w-full text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        onClick={onOpen}
        aria-label={`${labels.openDetails}: ${title}`}
      >
        <CreativePreview url={previewUrl} alt={title} unavailable={labels.unavailablePreview} />
        <div className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-body text-fg-primary line-clamp-2 min-w-0 font-semibold">{title}</p>
            <FormatBadge value={textValue(metadata?.format)} labels={labels} />
          </div>
          <div className="text-label text-fg-muted flex flex-wrap gap-x-3 gap-y-1 tabular-nums">
            <span>{formatMoney(ad.spend, currency, locale, labels.unavailable)}</span>
            <span>
              {labels.results}:{" "}
              {ad.results === null ? labels.unavailable : formatNumber(ad.results, locale)}
            </span>
            <span>{formatMoney(ad.cpc, currency, locale, labels.unavailable)}</span>
          </div>
        </div>
      </button>
      <div className="border-border-subtle flex items-center justify-between gap-2 border-t px-3 py-2">
        <SignalBadge signal={signal} labels={labels} />
        <Button type="button" size="sm" variant="ghost" onClick={onOpen}>
          <Info className="h-4 w-4" aria-hidden="true" />
          {labels.openDetails}
        </Button>
      </div>
      <AdvertisingTaxonomyEditor
        workspaceSlug={workspaceSlug}
        accountId={accountId}
        entityType="ad"
        entityId={ad.adId}
        initialTags={localTags}
        labels={{
          title: labels.taxonomyTitle,
          add: labels.taxonomyAdd,
          remove: labels.taxonomyRemove,
          placeholder: labels.taxonomyPlaceholder,
          topic: labels.taxonomyTopic,
          brand: labels.taxonomyBrand,
          platform: labels.taxonomyPlatform,
          objective: labels.taxonomyObjective,
          language: labels.taxonomyLanguage,
          month: labels.taxonomyMonth,
          error: labels.taxonomyError,
        }}
      />
    </article>
  );
}

function CreativeDetails({
  ad,
  signal,
  currency,
  locale,
  labels,
}: {
  ad: AdvertisingAdSummary;
  signal: CreativeFatigueInsight | undefined;
  currency: string | null;
  locale: string;
  labels: AdvertisingCreativeExplorerLabels;
}) {
  const metadata = ad.creativeMetadata;
  const previewUrl = safePreviewUrl(metadata?.previewUrl);
  const title = textValue(metadata?.headline) ?? ad.name ?? ad.adId;
  const body = textValue(metadata?.body);
  const linkUrl = textValue(metadata?.linkUrl);
  return (
    <div className="space-y-5">
      <CreativePreview url={previewUrl} alt={title} unavailable={labels.unavailablePreview} large />
      <dl className="grid gap-3 sm:grid-cols-2">
        <Detail label={labels.headline} value={title} />
        <Detail label={labels.format} value={formatValue(textValue(metadata?.format), labels)} />
        <Detail label={labels.campaign} value={ad.campaignId ?? labels.unavailable} />
        <Detail label={labels.status} value={ad.status ?? labels.unavailable} />
        <Detail
          label={labels.spend}
          value={formatMoney(ad.spend, currency, locale, labels.unavailable)}
        />
        <Detail
          label={labels.results}
          value={ad.results === null ? labels.unavailable : formatNumber(ad.results, locale)}
        />
        <Detail
          label={labels.costPerResult}
          value={formatMoney(ad.cpc, currency, locale, labels.unavailable)}
        />
        <Detail label={labels.link} value={linkUrl ?? labels.unavailable} />
      </dl>
      <div className="space-y-2">
        <h3 className="text-body text-fg-primary font-semibold">{labels.body}</h3>
        <p className="text-label text-fg-secondary whitespace-pre-wrap">{body ?? labels.noBody}</p>
      </div>
      <div className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-body text-fg-primary font-semibold">{labels.healthSignal}</h3>
          <SignalBadge signal={signal} labels={labels} />
        </div>
        {signal ? (
          <p className="text-label text-fg-secondary mt-2">
            {signal.ctrChange === null
              ? labels.unavailable
              : `${labels.healthSignal}: ${formatPercent(signal.ctrChange, locale as "en" | "ar")}`}
          </p>
        ) : null}
      </div>
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noreferrer"
          className="text-label text-primary inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {linkUrl}
        </a>
      ) : null}
    </div>
  );
}

function CreativePreview({
  url,
  alt,
  unavailable,
  large = false,
}: {
  url: string | null;
  alt: string;
  unavailable: string;
  large?: boolean;
}) {
  return url ? (
    <div
      className={`bg-surface-subtle aspect-video overflow-hidden ${large ? "rounded-[var(--radius-control)]" : ""}`}
    >
      {/* Provider URLs are intentionally used only when Meta returned a valid HTTPS preview. */}
      <img
        src={url}
        alt={alt}
        loading={large ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    </div>
  ) : (
    <div
      className="bg-surface-subtle text-fg-muted flex aspect-video flex-col items-center justify-center gap-2 p-4 text-center"
      aria-label={unavailable}
    >
      <ImageOff className="h-6 w-6" aria-hidden="true" />
      <span className="text-label">{unavailable}</span>
    </div>
  );
}

function SignalBadge({
  signal,
  labels,
}: {
  signal: CreativeFatigueInsight | undefined;
  labels: AdvertisingCreativeExplorerLabels;
}) {
  if (!signal || signal.status === "insufficient_data") {
    return <Badge variant="outline">{labels.insufficientData}</Badge>;
  }
  return (
    <Badge variant={signal.status === "fatiguing" ? "warning" : "success"}>
      {signal.status === "fatiguing" ? labels.fatiguing : labels.stable}
    </Badge>
  );
}

function FormatBadge({
  value,
  labels,
}: {
  value: string | null;
  labels: AdvertisingCreativeExplorerLabels;
}) {
  return <Badge variant="outline">{formatValue(value, labels)}</Badge>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="text-label text-fg-primary mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}

function formatValue(value: string | null, labels: AdvertisingCreativeExplorerLabels) {
  const normalized = value?.toLowerCase();
  if (normalized === "image") return labels.image;
  if (normalized === "video") return labels.video;
  if (normalized === "reel" || normalized === "reels") return labels.reel;
  if (normalized === "carousel") return labels.carousel;
  return value ?? labels.unavailable;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safePreviewUrl(value: unknown): string | null {
  const text = textValue(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatMoney(
  value: number | null,
  currency: string | null,
  locale: string,
  unavailable: string,
) {
  return value === null || !currency
    ? unavailable
    : formatCurrency(value, currency, locale as "en" | "ar");
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}
