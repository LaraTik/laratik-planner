"use client";

import { useState, useTransition } from "react";
import { FileText, FolderOpen, Package, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { submitDeliveryAction } from "../actions";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaUploadForm, type MediaUploadResult } from "@/components/media/media-upload-form";
import {
  DeliveryVersionList,
  type DeliveryVersion,
} from "@/components/workspace/delivery-version-card";

type DeliveryMediaAsset = {
  id: string;
  title: string;
  kind: string;
  mimeType?: string;
  byteSize: number;
  workspaceName: string;
  visibility: string;
  altText?: string | null;
};

type DeliveryFolder = { id: string; name: string; parentId?: string | null };

/**
 * STUDIOFLOW_MASTER_PROMPT.md §10 — Delivery history + submit form.
 *
 * Two responsibilities:
 *
 *  1. Render every past delivery version for this content item, newest
 *     first, with the links and who submitted it. Designers and reviewers
 *     must be able to see what was actually submitted. (Previously the
 *     form submitted and closed without any visible history — that was
 *     the "designer submit the links but looks not saved" bug.)
 *
 *  2. Open the submit form for designers/managers when the content is
 *     in a submittable state (in_design, creative_review, changes_requested).
 *
 * The history rendering lives in the shared `<DeliveryVersionList>`
 * component (Task 12 extraction). The submit form is the tail, not
 * the head — the history is always visible above it.
 */
export function DeliverySection({
  workspaceId = "",
  workspaceName = "",
  workspaceSlug,
  contentItemId,
  contentStatus,
  isDesigner,
  isManager,
  deliveries,
  mediaAssets = [],
  folderOptions = [],
  viewerIsClient = false,
}: {
  workspaceId?: string;
  workspaceName?: string;
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  isDesigner: boolean;
  isManager: boolean;
  deliveries: DeliveryVersion[];
  mediaAssets?: DeliveryMediaAsset[];
  folderOptions?: DeliveryFolder[];
  viewerIsClient?: boolean;
}) {
  const t = useLocaleT();
  const [open, setOpen] = useState(deliveries.length === 0);
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [availableAssets, setAvailableAssets] = useState(mediaAssets);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [showUploader, setShowUploader] = useState(mediaAssets.length === 0);
  const [showMediaSearch, setShowMediaSearch] = useState(false);
  const [mediaQuery, setMediaQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchingMedia, setSearchingMedia] = useState(false);
  const [mediaSearchError, setMediaSearchError] = useState<string | null>(null);
  const canUploadInline = workspaceId.length > 0;
  const canSubmit =
    (isDesigner || isManager) &&
    (contentStatus === "in_design" ||
      contentStatus === "creative_review" ||
      contentStatus === "changes_requested");

  async function searchMediaLibrary() {
    const query = mediaQuery.trim();
    setHasSearched(Boolean(query));
    setMediaSearchError(null);
    if (!query) {
      setAvailableAssets((current) =>
        current.filter((asset) => selectedAssetIds.includes(asset.id)),
      );
      return;
    }

    setSearchingMedia(true);
    try {
      const params = new URLSearchParams({ workspaceId, q: query });
      const response = await fetch(`/api/media/assets?${params.toString()}`, {
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as {
        assets?: DeliveryMediaAsset[];
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Media search failed");
      const results = payload?.assets ?? [];
      setAvailableAssets((current) => {
        const selected = current.filter((asset) => selectedAssetIds.includes(asset.id));
        const seen = new Set(selected.map((asset) => asset.id));
        return [...selected, ...results.filter((asset) => !seen.has(asset.id))];
      });
    } catch {
      setMediaSearchError(t("contentDetail.deliveries.mediaSearchFailed"));
      setAvailableAssets((current) =>
        current.filter((asset) => selectedAssetIds.includes(asset.id)),
      );
    } finally {
      setSearchingMedia(false);
    }
  }

  function clearMediaSearch() {
    setMediaQuery("");
    setHasSearched(false);
    setMediaSearchError(null);
    setAvailableAssets((current) => current.filter((asset) => selectedAssetIds.includes(asset.id)));
  }

  return (
    <div className="space-y-4">
      {/* History — always visible when there is at least one delivery */}
      {deliveries.length > 0 ? (
        <Card data-testid="delivery-history">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t("contentDetail.deliveries.title")}</CardTitle>
              <p className="text-label text-fg-muted mt-0.5">
                {t(
                  deliveries.length === 1
                    ? "contentDetail.deliveries.versionOne"
                    : "contentDetail.deliveries.versionMany",
                  { count: deliveries.length },
                )}
              </p>
            </div>
            {canSubmit ? (
              <Button size="sm" onClick={() => setOpen(true)} disabled={open}>
                <Package className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                {t("contentDetail.deliveries.submitNewVersion")}
              </Button>
            ) : null}
          </header>

          <DeliveryVersionList
            versions={deliveries}
            viewerIsClient={viewerIsClient}
            contentStatus={contentStatus}
          />
        </Card>
      ) : null}

      {deliveries.length === 0 && !canSubmit ? (
        <Card data-testid="delivery-not-ready" className="border-border bg-surface-subtle">
          <CardTitle>{t("contentDetail.deliveries.notReadyTitle")}</CardTitle>
          <p className="text-body text-fg-secondary mt-2 max-w-2xl">
            {t("contentDetail.deliveries.notReadyBody")}
          </p>
        </Card>
      ) : null}

      {/* Submit form — open by default when there is no history yet AND
          the user can submit; otherwise tucked behind a button. */}
      {canSubmit ? (
        open ? (
          <Card data-testid="delivery-submit-form">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t("contentDetail.deliveries.submitTitle")}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
            </header>

            <form
              noValidate
              onSubmit={(event) => {
                const form = event.currentTarget;
                const data = new FormData(form);
                const nextErrors: Record<string, string> = {};
                const selectedMedia = data.getAll("mediaAssetId");
                if (selectedMedia.length === 0) {
                  nextErrors.deliverySources = t("contentDetail.deliveries.sourceRequired");
                }
                setFieldErrors(nextErrors);
                if (Object.keys(nextErrors).length > 0) {
                  event.preventDefault();
                  const firstInvalid = Object.keys(nextErrors)[0];
                  const targetId =
                    firstInvalid === "deliverySources" ? "delivery-media-first" : firstInvalid;
                  form.querySelector<HTMLElement>(`#${targetId}`)?.focus();
                }
              }}
              action={(fd) => {
                start(async () => {
                  setFormError(null);
                  setFieldErrors({});
                  try {
                    const res = await submitDeliveryAction(workspaceSlug, contentItemId, null, fd);
                    if (res && "error" in res && res.error) {
                      setFormError(res.error);
                    } else {
                      setOpen(false);
                    }
                  } catch (e) {
                    setFormError((e as Error).message);
                  }
                });
              }}
              className="space-y-4"
            >
              <FormField
                id="description"
                label={t("contentDetail.deliveries.description")}
                hint={t("contentDetail.deliveries.optionalHint")}
                {...(fieldErrors.description ? { error: fieldErrors.description } : {})}
              >
                <Input
                  id="description"
                  type="text"
                  name="description"
                  maxLength={500}
                  placeholder={t("contentDetail.deliveries.descriptionPlaceholder")}
                />
              </FormField>
              <FormField
                id="designerNote"
                label={t("contentDetail.deliveries.designerNote")}
                hint={t("contentDetail.deliveries.optionalHint")}
              >
                <Textarea
                  id="designerNote"
                  name="designerNote"
                  rows={3}
                  maxLength={2000}
                  placeholder={t("contentDetail.deliveries.designerNotePlaceholder")}
                />
              </FormField>

              <fieldset
                className="space-y-2"
                aria-describedby="delivery-media-help delivery-sources-error"
              >
                <legend className="text-body text-fg-primary font-semibold">
                  {t("contentDetail.deliveries.mediaTitle")}
                </legend>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p id="delivery-media-help" className="text-label text-fg-muted mt-1">
                    {t("contentDetail.deliveries.mediaHelp")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowMediaSearch((value) => !value)}
                    >
                      <Search className="h-3.5 w-3.5" aria-hidden="true" />
                      {showMediaSearch
                        ? t("contentDetail.deliveries.closeMediaSearch")
                        : t("contentDetail.deliveries.searchMediaLibrary")}
                    </Button>
                    {canUploadInline ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setShowUploader((value) => !value)}
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        {showUploader
                          ? t("contentDetail.deliveries.hideUploader")
                          : t("contentDetail.deliveries.uploadHere")}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {showMediaSearch ? (
                  <div className="border-border bg-surface-subtle mt-3 space-y-3 rounded-[var(--radius-control)] border p-3">
                    <label
                      htmlFor="delivery-media-search"
                      className="text-label text-fg-primary block font-semibold"
                    >
                      {t("contentDetail.deliveries.searchMediaLabel")}
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="delivery-media-search"
                        value={mediaQuery}
                        onChange={(event) => setMediaQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void searchMediaLibrary();
                          }
                        }}
                        placeholder={t("contentDetail.deliveries.searchMediaPlaceholder")}
                        className="min-h-11 flex-1"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        onClick={() => void searchMediaLibrary()}
                        disabled={searchingMedia}
                      >
                        <Search className="h-3.5 w-3.5" aria-hidden="true" />
                        {searchingMedia
                          ? t("contentDetail.deliveries.searchingMedia")
                          : t("contentDetail.deliveries.searchMedia")}
                      </Button>
                      {hasSearched || mediaQuery ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          onClick={clearMediaSearch}
                          aria-label={t("contentDetail.deliveries.clearMediaSearch")}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-label text-fg-muted">
                      {t("contentDetail.deliveries.searchMediaHint")}
                    </p>
                    {mediaSearchError ? (
                      <p role="alert" className="text-label text-danger font-semibold">
                        {mediaSearchError}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {showUploader && canUploadInline ? (
                  <div className="mt-3">
                    <MediaUploadForm
                      compact
                      workspaceOptions={[{ id: workspaceId, name: workspaceName }]}
                      folderOptionsByWorkspace={{ [workspaceId]: folderOptions }}
                      contentItemId={contentItemId}
                      onAssetReady={(asset: MediaUploadResult) => {
                        setAvailableAssets((current) =>
                          current.some((candidate) => candidate.id === asset.id)
                            ? current
                            : [
                                ...current,
                                {
                                  ...asset,
                                  workspaceName,
                                  visibility: "workspace",
                                },
                              ],
                        );
                        setSelectedAssetIds((current) =>
                          current.includes(asset.id) ? current : [...current, asset.id],
                        );
                        setHasSearched(false);
                        setShowUploader(false);
                      }}
                    />
                  </div>
                ) : null}
                {availableAssets.length > 0 &&
                (hasSearched || selectedAssetIds.length > 0 || mediaAssets.length > 0) ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {availableAssets.map((asset, index) => {
                      const checkboxId = `delivery-media-${asset.id}`;
                      return (
                        <div
                          key={asset.id}
                          className="border-border bg-surface hover:border-primary focus-within:ring-focus-ring flex min-h-20 items-center gap-3 rounded-[var(--radius-control)] border p-3 transition-colors focus-within:ring-2"
                        >
                          <Checkbox
                            id={index === 0 ? "delivery-media-first" : checkboxId}
                            name="mediaAssetId"
                            value={asset.id}
                            checked={selectedAssetIds.includes(asset.id)}
                            onCheckedChange={(checked) => {
                              setSelectedAssetIds((current) =>
                                checked === true
                                  ? current.includes(asset.id)
                                    ? current
                                    : [...current, asset.id]
                                  : current.filter((id) => id !== asset.id),
                              );
                            }}
                          />
                          <MediaAssetPreview asset={asset} />
                          <span className="min-w-0 flex-1">
                            <label
                              htmlFor={index === 0 ? "delivery-media-first" : checkboxId}
                              className="text-body text-fg-primary block cursor-pointer truncate font-semibold"
                            >
                              {asset.title}
                            </label>
                            <span className="text-label text-fg-muted block truncate">
                              {formatBytes(asset.byteSize)} · {asset.workspaceName}
                              {asset.visibility === "agency"
                                ? ` · ${t("contentDetail.deliveries.agencyShared")}`
                                : ""}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : showMediaSearch && hasSearched ? (
                  <div className="border-border bg-surface-subtle flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-dashed p-3">
                    <FolderOpen className="text-fg-muted h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-label text-fg-secondary min-w-0 flex-1">
                      {t("contentDetail.deliveries.noMediaSearchResults")}
                    </p>
                  </div>
                ) : showMediaSearch ? (
                  <div className="border-border bg-surface-subtle flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-dashed p-3">
                    <Search className="text-fg-muted h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-label text-fg-secondary min-w-0 flex-1">
                      {t("contentDetail.deliveries.searchMediaPrompt")}
                    </p>
                  </div>
                ) : selectedAssetIds.length === 0 ? (
                  <div className="border-border bg-surface-subtle flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-dashed p-3">
                    <FolderOpen className="text-fg-muted h-5 w-5 shrink-0" aria-hidden="true" />
                    <p className="text-label text-fg-secondary min-w-0 flex-1">
                      {t("contentDetail.deliveries.mediaSearchClosed")}
                    </p>
                  </div>
                ) : null}
              </fieldset>

              {selectedAssetIds.length > 0 ? (
                <p
                  className="border-success/30 bg-success-subtle text-label text-fg-secondary rounded-[var(--radius-control)] border p-3"
                  role="status"
                  aria-live="polite"
                >
                  {t("contentDetail.deliveries.assetsReadyToSubmit", {
                    count: selectedAssetIds.length,
                  })}
                </p>
              ) : null}

              <p className="border-border bg-surface-subtle text-label text-fg-secondary rounded-[var(--radius-control)] border p-3">
                {t("contentDetail.deliveries.storedOnlyNotice")}
              </p>

              <div>
                {fieldErrors.deliverySources ? (
                  <p
                    id="delivery-sources-error"
                    role="alert"
                    className="text-label text-danger font-semibold"
                  >
                    {fieldErrors.deliverySources}
                  </p>
                ) : null}
              </div>

              {formError ? (
                <p role="alert" className="text-body text-danger">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" disabled={pending}>
                {pending
                  ? t("contentDetail.deliveries.submitting")
                  : t("contentDetail.deliveries.submitForReview")}
              </Button>
            </form>
          </Card>
        ) : deliveries.length === 0 ? (
          <Card data-testid="delivery-submit-cta">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{t("contentDetail.deliveries.title")}</CardTitle>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Package className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                {t("contentDetail.deliveries.submitDelivery")}
              </Button>
            </header>
            <p className="text-body text-fg-muted mt-3">
              {t("contentDetail.deliveries.emptyBody")}
            </p>
          </Card>
        ) : null
      ) : null}
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function MediaAssetPreview({ asset }: { asset: DeliveryMediaAsset }) {
  const src = `/api/media/assets/${encodeURIComponent(asset.id)}`;
  const label = asset.altText ?? asset.title;

  if (asset.kind === "image") {
    return (
      <div className="bg-surface-subtle h-14 w-16 shrink-0 overflow-hidden rounded-[var(--radius-control)]">
        {/* Authenticated same-origin media request; do not use next/image here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  if (asset.kind === "video") {
    return (
      <div className="bg-surface-subtle h-14 w-16 shrink-0 overflow-hidden rounded-[var(--radius-control)]">
        <video
          controls
          playsInline
          preload="metadata"
          aria-label={label}
          className="h-full w-full object-cover"
        >
          <source src={src} type={asset.mimeType} />
        </video>
      </div>
    );
  }

  return (
    <div className="bg-primary-subtle text-primary flex h-14 w-16 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
      <FileText className="h-5 w-5" aria-hidden="true" />
    </div>
  );
}
