"use client";

import { useState, useTransition } from "react";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/form-field";
import { submitDeliveryAction } from "../actions";
import { useLocaleT } from "@/components/i18n/locale-provider";
import {
  DeliveryVersionList,
  type DeliveryVersion,
} from "@/components/workspace/delivery-version-card";

const PROVIDERS = [
  "google_drive",
  "dropbox",
  "onedrive",
  "frame_io",
  "figma",
  "canva",
  "other",
] as const;

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
  workspaceSlug,
  contentItemId,
  contentStatus,
  isDesigner,
  isManager,
  deliveries,
  viewerIsClient = false,
}: {
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  isDesigner: boolean;
  isManager: boolean;
  deliveries: DeliveryVersion[];
  viewerIsClient?: boolean;
}) {
  const t = useLocaleT();
  const [open, setOpen] = useState(deliveries.length === 0);
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const canSubmit =
    (isDesigner || isManager) &&
    (contentStatus === "in_design" ||
      contentStatus === "creative_review" ||
      contentStatus === "changes_requested");

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
                if (!String(data.get("description") ?? "").trim()) {
                  nextErrors.description = t("contentDetail.deliveries.descriptionRequired");
                }
                const labels = data.getAll("linkLabel").map(String);
                const urls = data.getAll("linkUrl").map(String);
                const hasCompleteLink = labels.some((label, i) => label.trim() && urls[i]?.trim());
                if (!hasCompleteLink) {
                  const row = labels.findIndex((label, i) => label.trim() || urls[i]?.trim());
                  const index = row >= 0 ? row : 0;
                  if (!labels[index]?.trim()) {
                    nextErrors[`link-label-${index}`] = t(
                      "contentDetail.deliveries.linkLabelRequired",
                    );
                  }
                  if (!urls[index]?.trim()) {
                    nextErrors[`link-url-${index}`] = t("contentDetail.deliveries.linkUrlRequired");
                  }
                }
                setFieldErrors(nextErrors);
                if (Object.keys(nextErrors).length > 0) {
                  event.preventDefault();
                  const firstInvalid = Object.keys(nextErrors)[0];
                  form.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
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
                required
                {...(fieldErrors.description ? { error: fieldErrors.description } : {})}
              >
                <Input
                  id="description"
                  type="text"
                  name="description"
                  required
                  minLength={1}
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
                aria-describedby="delivery-links-help delivery-links-error"
              >
                <legend className="text-body text-fg-primary font-semibold">
                  {t("contentDetail.deliveries.linksTitle")}
                </legend>
                <p id="delivery-links-help" className="text-label text-fg-muted">
                  {t("contentDetail.deliveries.linksHelp")}
                </p>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="border-border bg-surface-subtle grid grid-cols-12 gap-2 rounded-[var(--radius-control)] border p-2"
                  >
                    <div className="col-span-12 sm:col-span-3">
                      <label
                        htmlFor={`link-provider-${i}`}
                        className="text-label mb-1 block font-medium"
                      >
                        {t("contentDetail.deliveries.provider", { count: i + 1 })}
                      </label>
                      <select
                        id={`link-provider-${i}`}
                        name="linkProvider"
                        className="border-border bg-surface text-body min-h-11 w-full rounded-[var(--radius-control)] border px-2 py-1"
                        defaultValue="google_drive"
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p} value={p}>
                            {t(`contentDetail.deliveries.providers.${p}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <label
                        htmlFor={`link-label-${i}`}
                        className="text-label mb-1 block font-medium"
                      >
                        {t("contentDetail.deliveries.linkLabel")}
                      </label>
                      <Input
                        id={`link-label-${i}`}
                        type="text"
                        name="linkLabel"
                        maxLength={120}
                        aria-invalid={Boolean(fieldErrors[`link-label-${i}`])}
                        aria-describedby={
                          fieldErrors[`link-label-${i}`] ? `link-label-${i}-error` : undefined
                        }
                      />
                      {fieldErrors[`link-label-${i}`] ? (
                        <p
                          id={`link-label-${i}-error`}
                          role="alert"
                          className="text-label text-danger mt-1 font-semibold"
                        >
                          {fieldErrors[`link-label-${i}`]}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-12 sm:col-span-5">
                      <label
                        htmlFor={`link-url-${i}`}
                        className="text-label mb-1 block font-medium"
                      >
                        {t("contentDetail.deliveries.linkUrl")}
                      </label>
                      <Input
                        id={`link-url-${i}`}
                        type="url"
                        name="linkUrl"
                        placeholder="https://"
                        aria-invalid={Boolean(fieldErrors[`link-url-${i}`])}
                        aria-describedby={
                          fieldErrors[`link-url-${i}`] ? `link-url-${i}-error` : undefined
                        }
                      />
                      {fieldErrors[`link-url-${i}`] ? (
                        <p
                          id={`link-url-${i}-error`}
                          role="alert"
                          className="text-label text-danger mt-1 font-semibold"
                        >
                          {fieldErrors[`link-url-${i}`]}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-label text-fg-primary col-span-12 flex min-h-11 items-center gap-2 sm:col-span-1 sm:mt-5">
                      <Checkbox id={`link-preview-${i}`} name="linkPreview" value="on" />
                      <label htmlFor={`link-preview-${i}`} className="cursor-pointer">
                        {t("contentDetail.deliveries.preview")}
                      </label>
                    </div>
                  </div>
                ))}
                {Object.keys(fieldErrors).some((key) => key.startsWith("link-")) ? (
                  <p
                    id="delivery-links-error"
                    role="alert"
                    className="text-label text-danger font-semibold"
                  >
                    {t("contentDetail.deliveries.linkSummaryError")}
                  </p>
                ) : null}
              </fieldset>

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
              No deliveries yet. Submit at least one https link to advance to creative review.
            </p>
          </Card>
        ) : null
      ) : null}
    </div>
  );
}
