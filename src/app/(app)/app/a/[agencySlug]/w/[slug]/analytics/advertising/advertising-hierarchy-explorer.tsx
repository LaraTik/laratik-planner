"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  AdvertisingAdSetSummary,
  AdvertisingAdSummary,
  AdvertisingCampaignSummary,
} from "@/lib/advertising/reporting-view";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format-locale";

export type AdvertisingHierarchyExplorerLabels = {
  title: string;
  description: string;
  campaign: string;
  adSet: string;
  ad: string;
  spend: string;
  results: string;
  ctr: string;
  delivery: string;
  expand: string;
  collapse: string;
  noChildren: string;
  unavailable: string;
  tableLabel: string;
  active: string;
};

export function AdvertisingHierarchyExplorer({
  campaigns,
  adSets,
  ads,
  currency,
  locale,
  labels,
}: {
  campaigns: readonly AdvertisingCampaignSummary[];
  adSets: readonly AdvertisingAdSetSummary[];
  ads: readonly AdvertisingAdSummary[];
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
}) {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState<Set<string>>(new Set());
  const toggle = (current: Set<string>, id: string, setValue: (value: Set<string>) => void) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setValue(next);
  };

  return (
    <Card
      id="advertising-reporting-campaigns"
      padding="none"
      className="overflow-hidden"
      data-testid="advertising-reporting-campaigns"
    >
      <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="text-primary h-4 w-4" aria-hidden="true" />
            {labels.title}
          </CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </div>
      </CardHeader>
      <div aria-label={labels.tableLabel} className="overflow-x-auto" role="region" tabIndex={0}>
        <table className="text-body w-full min-w-[760px] text-start">
          <caption className="sr-only">{labels.tableLabel}</caption>
          <thead className="bg-surface-subtle text-label text-fg-muted">
            <tr>
              <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="col">
                {labels.campaign}
              </th>
              <th className="px-4 py-3 text-end font-semibold" scope="col">
                {labels.spend}
              </th>
              <th className="px-4 py-3 text-end font-semibold" scope="col">
                {labels.results}
              </th>
              <th className="px-4 py-3 text-end font-semibold" scope="col">
                {labels.ctr}
              </th>
              <th className="px-4 py-3 text-start font-semibold" scope="col">
                {labels.delivery}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {campaigns.map((campaign) => {
              const children = adSets.filter((adSet) => adSet.campaignId === campaign.campaignId);
              const expanded = expandedCampaigns.has(campaign.campaignId);
              return (
                <CampaignRows
                  key={campaign.campaignId}
                  campaign={campaign}
                  adSets={children}
                  ads={ads}
                  expanded={expanded}
                  expandedAdSets={expandedAdSets}
                  currency={currency}
                  locale={locale}
                  labels={labels}
                  onToggle={() =>
                    toggle(expandedCampaigns, campaign.campaignId, setExpandedCampaigns)
                  }
                  onToggleAdSet={(id) => toggle(expandedAdSets, id, setExpandedAdSets)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {campaigns.length === 0 ? (
        <p className="text-label text-fg-secondary px-4 py-4 sm:px-5">{labels.unavailable}</p>
      ) : null}
    </Card>
  );
}

function CampaignRows({
  campaign,
  adSets,
  ads,
  expanded,
  expandedAdSets,
  currency,
  locale,
  labels,
  onToggle,
  onToggleAdSet,
}: {
  campaign: AdvertisingCampaignSummary;
  adSets: readonly AdvertisingAdSetSummary[];
  ads: readonly AdvertisingAdSummary[];
  expanded: boolean;
  expandedAdSets: Set<string>;
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
  onToggle: () => void;
  onToggleAdSet: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-surface">
        <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
          <EntityButton
            expanded={expanded}
            disabled={adSets.length === 0}
            label={campaign.name ?? campaign.campaignId}
            ariaLabel={`${expanded ? labels.collapse : labels.expand}: ${campaign.name ?? campaign.campaignId}`}
            onClick={onToggle}
          />
          <bdi className="text-label text-fg-muted block ps-7" dir="ltr">
            {campaign.campaignId}
          </bdi>
        </th>
        <MetricCells entity={campaign} currency={currency} locale={locale} labels={labels} />
      </tr>
      {expanded
        ? adSets.map((adSet) => {
            const adChildren = ads.filter((ad) => ad.adSetId === adSet.adSetId);
            const adSetExpanded = expandedAdSets.has(adSet.adSetId);
            return (
              <AdSetRows
                key={adSet.adSetId}
                adSet={adSet}
                ads={adChildren}
                expanded={adSetExpanded}
                currency={currency}
                locale={locale}
                labels={labels}
                onToggle={() => onToggleAdSet(adSet.adSetId)}
              />
            );
          })
        : null}
    </>
  );
}

function AdSetRows({
  adSet,
  ads,
  expanded,
  currency,
  locale,
  labels,
  onToggle,
}: {
  adSet: AdvertisingAdSetSummary;
  ads: readonly AdvertisingAdSummary[];
  expanded: boolean;
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="bg-surface-subtle">
        <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
          <EntityButton
            expanded={expanded}
            disabled={ads.length === 0}
            label={adSet.name ?? adSet.adSetId}
            ariaLabel={`${expanded ? labels.collapse : labels.expand}: ${adSet.name ?? adSet.adSetId}`}
            onClick={onToggle}
            indent
          />
          <bdi className="text-label text-fg-muted block ps-12" dir="ltr">
            {adSet.adSetId}
          </bdi>
        </th>
        <MetricCells entity={adSet} currency={currency} locale={locale} labels={labels} />
      </tr>
      {expanded
        ? ads.map((ad) => (
            <tr key={ad.adId}>
              <th className="px-4 py-3 text-start font-semibold sm:px-5" scope="row">
                <span className="text-fg-primary block ps-16">{ad.name ?? ad.adId}</span>
                <bdi className="text-label text-fg-muted block ps-16" dir="ltr">
                  {ad.adId}
                </bdi>
              </th>
              <MetricCells entity={ad} currency={currency} locale={locale} labels={labels} />
            </tr>
          ))
        : null}
    </>
  );
}

function EntityButton({
  expanded,
  disabled,
  label,
  ariaLabel,
  onClick,
  indent = false,
}: {
  expanded: boolean;
  disabled: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      className={`text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-11 max-w-full items-center gap-1 text-start font-semibold focus:outline-none focus-visible:ring-2 ${indent ? "ps-5" : ""}`}
      aria-label={ariaLabel}
      aria-expanded={disabled ? undefined : expanded}
      disabled={disabled}
      onClick={onClick}
    >
      {disabled ? (
        <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : expanded ? (
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

function MetricCells({
  entity,
  currency,
  locale,
  labels,
}: {
  entity: AdvertisingCampaignSummary | AdvertisingAdSetSummary | AdvertisingAdSummary;
  currency: string | null;
  locale: string;
  labels: AdvertisingHierarchyExplorerLabels;
}) {
  return (
    <>
      <td className="px-4 py-3 text-end tabular-nums">
        {currency
          ? formatCurrency(entity.spend, currency, locale as "en" | "ar")
          : labels.unavailable}
      </td>
      <td className="px-4 py-3 text-end tabular-nums">
        {entity.results === null
          ? labels.unavailable
          : formatNumber(entity.results, locale as "en" | "ar")}
      </td>
      <td className="px-4 py-3 text-end tabular-nums">
        {entity.ctr === null
          ? labels.unavailable
          : formatPercent(entity.ctr, locale as "en" | "ar")}
      </td>
      <td className="px-4 py-3 text-start">
        {entity.status ? <Badge variant="outline">{entity.status}</Badge> : labels.unavailable}
      </td>
    </>
  );
}
