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
import { humanize } from "@/lib/content/status";
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
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
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
              <CardTitle>Deliveries</CardTitle>
              <p className="text-label text-fg-muted mt-0.5">
                {deliveries.length} version{deliveries.length === 1 ? "" : "s"} on file
              </p>
            </div>
            {canSubmit ? (
              <Button size="sm" onClick={() => setOpen(true)} disabled={open}>
                <Package className="h-3.5 w-3.5" aria-hidden="true" /> Submit new version
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
              <CardTitle>Submit a delivery</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </header>

            <form
              action={(fd) => {
                start(async () => {
                  setFormError(null);
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
              <FormField id="description" label="Description" required>
                <Input
                  id="description"
                  type="text"
                  name="description"
                  required
                  minLength={1}
                  maxLength={500}
                  placeholder="Final creatives, 3 variants for testing"
                />
              </FormField>
              <FormField id="designerNote" label="Designer note (optional)">
                <Textarea
                  id="designerNote"
                  name="designerNote"
                  rows={3}
                  maxLength={2000}
                  placeholder="Anything the reviewer should know."
                />
              </FormField>

              <fieldset className="space-y-2">
                <legend className="text-body text-fg-primary font-semibold">
                  Links (at least one)
                </legend>
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
                        Provider {i + 1}
                      </label>
                      <select
                        id={`link-provider-${i}`}
                        name="linkProvider"
                        className="border-border bg-surface text-body min-h-11 w-full rounded-[var(--radius-control)] border px-2 py-1"
                        defaultValue="google_drive"
                      >
                        {PROVIDERS.map((p) => (
                          <option key={p} value={p}>
                            {humanize(p)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <label
                        htmlFor={`link-label-${i}`}
                        className="text-label mb-1 block font-medium"
                      >
                        Link label
                      </label>
                      <Input id={`link-label-${i}`} type="text" name="linkLabel" maxLength={120} />
                    </div>
                    <div className="col-span-12 sm:col-span-5">
                      <label
                        htmlFor={`link-url-${i}`}
                        className="text-label mb-1 block font-medium"
                      >
                        HTTPS URL
                      </label>
                      <Input
                        id={`link-url-${i}`}
                        type="url"
                        name="linkUrl"
                        placeholder="https://…"
                      />
                    </div>
                    <div className="text-label text-fg-primary col-span-12 flex min-h-11 items-center gap-2 sm:col-span-1 sm:mt-5">
                      <Checkbox id={`link-preview-${i}`} name="linkPreview" value="on" />
                      <label htmlFor={`link-preview-${i}`} className="cursor-pointer">
                        Preview
                      </label>
                    </div>
                  </div>
                ))}
              </fieldset>

              {formError ? (
                <p role="alert" className="text-body text-danger">
                  {formError}
                </p>
              ) : null}

              <Button type="submit" disabled={pending}>
                {pending ? "Submitting…" : "Submit for creative review"}
              </Button>
            </form>
          </Card>
        ) : deliveries.length === 0 ? (
          <Card data-testid="delivery-submit-cta">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Deliveries</CardTitle>
              <Button size="sm" onClick={() => setOpen(true)}>
                <Package className="h-3.5 w-3.5" aria-hidden="true" /> Submit delivery
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
