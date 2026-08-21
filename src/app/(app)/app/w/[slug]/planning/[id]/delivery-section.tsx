"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Eye, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { submitDeliveryAction } from "../actions";
import { humanize } from "@/lib/content/status";

const PROVIDERS = [
  "google_drive",
  "dropbox",
  "onedrive",
  "frame_io",
  "figma",
  "canva",
  "other",
] as const;

type DeliveryLink = {
  id: string;
  provider: string;
  label: string;
  url: string;
  isPreview: boolean;
};

type Delivery = {
  id: string;
  versionNumber: number;
  description: string;
  designerNote: string | null;
  submittedAt: string;
  isFinalApproved: boolean;
  submittedBy: { id: string; name: string };
  links: DeliveryLink[];
};

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
 * The submit form is the tail, not the head — the history is always
 * visible above it.
 */
export function DeliverySection({
  workspaceSlug,
  contentItemId,
  contentStatus,
  isDesigner,
  isManager,
  deliveries,
}: {
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  isDesigner: boolean;
  isManager: boolean;
  deliveries: Delivery[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
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

          <ul className="space-y-3">
            {deliveries.map((d) => (
              <DeliveryRow key={d.id} delivery={d} />
            ))}
          </ul>
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
                  try {
                    const res = await submitDeliveryAction(workspaceSlug, contentItemId, null, fd);
                    if (res && "error" in res && res.error) {
                      alert(res.error);
                    } else {
                      setOpen(false);
                    }
                  } catch (e) {
                    alert((e as Error).message);
                  }
                });
              }}
              className="space-y-4"
            >
              <FormField id="description" label="Description" required>
                <Input
                  type="text"
                  name="description"
                  required
                  minLength={1}
                  maxLength={500}
                  placeholder="Final creatives, 3 variants for testing"
                />
              </FormField>
              <FormField id="designerNote" label="Designer note (optional)">
                <textarea
                  name="designerNote"
                  rows={3}
                  maxLength={2000}
                  placeholder="Anything the reviewer should know."
                  className="border-border bg-surface text-fg-primary text-body w-full rounded-[var(--radius-control)] border px-3 py-2"
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
                    <select
                      name="linkProvider"
                      className="border-border bg-surface text-body col-span-3 rounded-[var(--radius-control)] border px-2 py-1"
                      defaultValue="google_drive"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {humanize(p)}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="text"
                      name="linkLabel"
                      placeholder="Label"
                      maxLength={120}
                      className="col-span-3"
                    />
                    <Input
                      type="url"
                      name="linkUrl"
                      placeholder="https://…"
                      className="col-span-5"
                    />
                    <label className="text-label text-fg-primary col-span-1 flex items-center gap-1">
                      <input type="checkbox" name="linkPreview" className="h-4 w-4" /> Preview
                    </label>
                  </div>
                ))}
              </fieldset>

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

function DeliveryRow({ delivery }: { delivery: Delivery }) {
  const [expanded, setExpanded] = useState(delivery.isFinalApproved);
  const isV1 = delivery.versionNumber === 1;
  return (
    <li
      className="border-border bg-surface-subtle rounded-[var(--radius-control)] border"
      data-testid={`delivery-version-${delivery.versionNumber}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="text-body text-fg-primary hover:bg-surface focus-visible:ring-focus-ring flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left font-semibold focus:outline-none focus-visible:ring-2"
        data-testid={`delivery-version-toggle-${delivery.versionNumber}`}
      >
        <span className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="text-fg-secondary h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="text-fg-secondary h-4 w-4" aria-hidden="true" />
          )}
          V{delivery.versionNumber}
          <span className="text-fg-muted font-normal">— {delivery.description}</span>
          {delivery.isFinalApproved ? (
            <span className="text-label text-success ml-2 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold">
              Final approved
            </span>
          ) : null}
        </span>
        <span className="text-label text-fg-muted font-normal">
          {delivery.submittedBy.name} ·{" "}
          {new Date(delivery.submittedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      </button>

      {expanded ? (
        <div className="border-border space-y-3 border-t px-3 pt-3 pb-3">
          {delivery.designerNote ? (
            <p className="text-body text-fg-secondary whitespace-pre-wrap">
              <span className="text-label text-fg-muted block">Designer note</span>
              {delivery.designerNote}
            </p>
          ) : null}

          {delivery.links.length > 0 ? (
            <ul className="space-y-1.5" data-testid={`delivery-links-${delivery.versionNumber}`}>
              {delivery.links.map((l) => (
                <li
                  key={l.id}
                  className="text-body text-fg-primary flex flex-wrap items-center gap-2"
                >
                  <span className="text-label text-fg-muted bg-surface rounded-[var(--radius-control)] px-2 py-0.5 font-semibold">
                    {humanize(l.provider)}
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
                      <Eye className="h-3 w-3" aria-hidden="true" /> Preview
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-fg-muted italic">No links on this version.</p>
          )}

          {!isV1 ? null : (
            <p className="text-label text-fg-muted">First delivery for this content item.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
