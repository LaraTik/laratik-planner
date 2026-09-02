"use client";

import { useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Link as LinkIcon,
  PenSquare,
} from "lucide-react";
import { DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";

/**
 * DeliveryVersionCard — Phase 3 of the planning-workspace-v2
 * refactor (2026-08-30). The previous `DeliveryVersionList`
 * rendered one row per delivery with a single collapsible
 * body. The new component lifts each delivery into a proper
 * "Creative version" card with:
 *
 *   - a prominent V{n} title + status badge
 *     (Final approved / Awaiting review / Changes requested);
 *   - a thumbnail strip of the delivery's links (one tile
 *     per asset, with a provider icon when no image is
 *     available);
 *   - a designer note block (hidden for client viewers);
 *   - explicit action buttons: Open assets, Preview, Approve
 *     (the last calls the existing `decideApprovalAction`
 *     server action — see `delivery-section.tsx`).
 *
 * The card replaces the previous row-and-toggle pattern with
 * an always-visible summary (version + status + last-updated)
 * and a single "Details" disclosure for the link list and the
 * designer note. This makes the most important state — "is
 * this version final-approved?" — answerable at a glance,
 * which was the planning-workspace-v2 brief §15.
 */

export type DeliveryVersion = {
  id: string;
  versionNumber: number;
  description: string;
  designerNote: string | null;
  submittedAt: string;
  isFinalApproved: boolean;
  submittedBy: { id: string; name: string };
  links: {
    id: string;
    provider: string;
    label: string;
    url: string;
    isPreview: boolean;
  }[];
};

export type DeliveryVersionStatus = "approved" | "awaiting" | "changes_requested";

export interface DeliveryVersionCardProps {
  /** Pre-projected version (from the server). */
  version: DeliveryVersion;
  /**
   * When true, internal-only fields (designer note, submitter
   * name) are never rendered, even if the server projection
   * forgot to redact them.
   */
  viewerIsClient?: boolean;
  /**
   * Status of the content item. Used to derive
   * "Changes requested" (when the item is in
   * `changes_requested` and the latest version hasn't been
   * approved). Default: "awaiting".
   */
  contentStatus?: string;
  /**
   * When true, renders an "Approve" button. The button is
   * wired by the parent (it requires the approval request
   * id, which is content-scoped, not version-scoped).
   */
  showApprove?: boolean;
  /**
   * Called when the "Approve" button is clicked. The parent
   * triggers the server action and re-renders.
   */
  onApprove?: (version: DeliveryVersion) => void;
  /** Whether the approve action is in flight (disables the button). */
  approving?: boolean;
}

function deriveStatus(
  version: DeliveryVersion,
  contentStatus: string | undefined,
): DeliveryVersionStatus {
  if (version.isFinalApproved) return "approved";
  if (contentStatus === "changes_requested") return "changes_requested";
  return "awaiting";
}

const STATUS_BADGE: Record<
  DeliveryVersionStatus,
  {
    labelKey: string;
    icon: React.ComponentType<{ className?: string }>;
    className: string;
    testId: string;
  }
> = {
  approved: {
    labelKey: "contentDetail.deliveries.statusFinalApproved",
    icon: CheckCircle2,
    className: "text-success border-success/30 bg-success-subtle",
    testId: "delivery-version-status-approved",
  },
  awaiting: {
    labelKey: "contentDetail.deliveries.statusAwaitingReview",
    icon: Clock,
    className: "text-info border-info/30 bg-info-subtle",
    testId: "delivery-version-status-awaiting",
  },
  changes_requested: {
    labelKey: "contentDetail.deliveries.statusChangesRequested",
    icon: AlertCircle,
    className: "text-warning border-warning/30 bg-warning-subtle",
    testId: "delivery-version-status-changes-requested",
  },
};

export function DeliveryVersionCard({
  version,
  viewerIsClient = false,
  contentStatus,
  showApprove = false,
  onApprove,
  approving = false,
}: DeliveryVersionCardProps) {
  const locale = useLocaleCode();
  const t = useLocaleT();
  const [expanded, setExpanded] = useState(version.isFinalApproved);
  const status = deriveStatus(version, contentStatus);
  const badge = STATUS_BADGE[status];
  const BadgeIcon = badge.icon;
  const primaryLink = version.links[0];
  const previewLink = version.links.find((l) => l.isPreview) ?? primaryLink;
  const isV1 = version.versionNumber === 1;

  return (
    <article
      className="border-border bg-surface rounded-[var(--radius-control)] border p-3"
      data-testid={`delivery-version-card-${version.versionNumber}`}
      data-status={status}
    >
      {/* Header — version, status, submitter */}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="border-border bg-surface text-body text-fg-primary inline-flex h-8 w-12 items-center justify-center rounded-full border font-mono font-semibold tabular-nums"
            data-testid={`delivery-version-number-${version.versionNumber}`}
          >
            V{version.versionNumber}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-primary font-semibold">
              {version.description ||
                (isV1
                  ? t("contentDetail.deliveries.firstVersion")
                  : t("contentDetail.deliveries.versionNumber", {
                      count: version.versionNumber,
                    }))}
            </p>
            <p className="text-label text-fg-muted">
              <time dateTime={version.submittedAt}>
                {formatDate(version.submittedAt, locale, DateFormat.dateTime)}
              </time>
              {!viewerIsClient && version.submittedBy.name ? (
                <>
                  {" "}
                  · {t("contentDetail.deliveries.submittedBy", { name: version.submittedBy.name })}
                </>
              ) : null}
            </p>
          </div>
        </div>
        <span
          className={`text-label inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${badge.className}`}
          data-testid={badge.testId}
        >
          <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {t(badge.labelKey)}
        </span>
      </header>

      {/* Thumbnail strip — one tile per link. When the link is
          a previewable image we render an <img> so the planner
          can see the asset at a glance; otherwise we fall back
          to a provider-icon tile. */}
      {version.links.length > 0 ? (
        <ol
          className="mt-3 flex flex-wrap gap-2"
          data-testid={`delivery-version-thumbnails-${version.versionNumber}`}
        >
          {version.links.map((l) => (
            <li
              key={l.id}
              className="border-border bg-surface-subtle flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border"
              data-testid={`delivery-version-thumbnail-${version.versionNumber}-${l.id}`}
            >
              {looksLikeDirectImage(l.url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.url}
                  alt={`${version.description} — ${l.label}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="text-fg-muted flex flex-col items-center gap-0.5 p-1 text-center">
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  <span className="text-label truncate font-semibold">
                    {t(`contentDetail.deliveries.providers.${l.provider}`)}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {/* Designer note — hidden for client viewers. */}
      {!viewerIsClient && version.designerNote ? (
        <blockquote className="border-border bg-surface-subtle mt-3 rounded-[var(--radius-control)] border-s-2 px-3 py-2">
          <p className="text-label text-fg-muted mb-1 flex items-center gap-1 font-semibold">
            <PenSquare className="h-3 w-3" aria-hidden="true" />
            {t("contentDetail.deliveries.designerNote")}
          </p>
          <p className="text-body text-fg-secondary whitespace-pre-wrap">{version.designerNote}</p>
        </blockquote>
      ) : null}

      {/* Action row */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {primaryLink ? (
          <a
            href={primaryLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-surface text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold focus-visible:ring-2 focus-visible:outline-none"
            data-testid={`delivery-version-open-assets-${version.versionNumber}`}
          >
            <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t("contentDetail.deliveries.openAssets")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
        {previewLink && previewLink !== primaryLink ? (
          <a
            href={previewLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-surface text-body text-fg-primary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold focus-visible:ring-2 focus-visible:outline-none"
            data-testid={`delivery-version-preview-${version.versionNumber}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            {t("contentDetail.deliveries.preview")}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
        {showApprove && !version.isFinalApproved ? (
          <button
            type="button"
            disabled={approving}
            onClick={() => onApprove?.(version)}
            className="border-success/30 bg-success-subtle text-success hover:bg-success focus-visible:ring-focus-ring inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`delivery-version-approve-${version.versionNumber}`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {approving
              ? t("contentDetail.deliveries.approving")
              : t("contentDetail.deliveries.approve")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={`delivery-version-details-${version.versionNumber}`}
          className="text-label text-fg-muted hover:text-fg-primary focus-visible:ring-focus-ring ms-auto inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 focus-visible:ring-2 focus-visible:outline-none"
          data-testid={`delivery-version-toggle-${version.versionNumber}`}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <DirAwareChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {expanded
            ? t("contentDetail.deliveries.hideDetails")
            : t("contentDetail.deliveries.viewAllLinks")}
        </button>
      </div>

      {/* Details disclosure — full link list. */}
      {expanded ? (
        <div
          id={`delivery-version-details-${version.versionNumber}`}
          className="border-border mt-3 space-y-1.5 border-t pt-3"
          data-testid={`delivery-version-details-panel-${version.versionNumber}`}
        >
          {version.links.length > 0 ? (
            <ul
              className="space-y-1.5"
              data-testid={`delivery-version-links-${version.versionNumber}`}
            >
              {version.links.map((l) => (
                <li
                  key={l.id}
                  className="text-body text-fg-primary flex flex-wrap items-center gap-2"
                >
                  <span className="text-label text-fg-muted bg-surface rounded-[var(--radius-control)] px-2 py-0.5 font-semibold">
                    {t(`contentDetail.deliveries.providers.${l.provider}`)}
                  </span>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  >
                    {l.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                  {l.isPreview ? (
                    <span className="text-label text-fg-muted inline-flex items-center gap-1 font-semibold">
                      <Eye className="h-3 w-3" aria-hidden="true" />
                      {t("contentDetail.deliveries.preview")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted italic">
              {t("contentDetail.deliveries.noLinks")}
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function looksLikeDirectImage(url: string): boolean {
  // Direct image URLs (signed S3 / Googleusercontent / etc.)
  // can be rendered as <img> thumbnails. Everything else
  // (Google Drive share pages, Dropbox folders) gets a
  // provider-icon tile so we never render a broken image.
  try {
    const u = new URL(url);
    if (u.pathname === "/") return false;
    return /\.(png|jpe?g|gif|webp|avif|heic|heif|bmp|svg)(\?.*)?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export interface DeliveryVersionListProps {
  versions: DeliveryVersion[];
  viewerIsClient?: boolean;
  contentStatus?: string;
  showApprove?: boolean;
  onApprove?: (version: DeliveryVersion) => void;
  approvingVersionId?: string | null;
}

/**
 * DeliveryVersionList — list wrapper around
 * `DeliveryVersionCard`. Backwards-compatible with the
 * previous `<DeliveryVersionList />` API: `versions` and
 * `viewerIsClient` still work. New optional props add the
 * "Approve" action and the `contentStatus`-driven status
 * derivation.
 */
export function DeliveryVersionList({
  versions,
  viewerIsClient = false,
  contentStatus,
  showApprove = false,
  onApprove,
  approvingVersionId = null,
}: DeliveryVersionListProps) {
  const t = useLocaleT();
  if (versions.length === 0) {
    return (
      <p className="text-body text-fg-muted italic" data-testid="delivery-version-list-empty">
        {t("contentDetail.deliveries.emptyList")}
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="delivery-version-list">
      {versions.map((v) => (
        <li key={v.id}>
          <DeliveryVersionCard
            version={v}
            {...(viewerIsClient ? { viewerIsClient: true } : {})}
            {...(contentStatus ? { contentStatus } : {})}
            {...(showApprove ? { showApprove: true } : {})}
            {...(onApprove ? { onApprove } : {})}
            approving={approvingVersionId === v.id}
          />
        </li>
      ))}
    </ul>
  );
}
