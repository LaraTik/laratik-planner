"use client";

import * as React from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addColorPaletteAction,
  addPillarTemplateAction,
  addPublishingTemplateAction,
  addTypographyTemplateAction,
  addVoiceTemplateAction,
} from "../actions";

/**
 * TemplateCard — one-click "Add to brand kit" affordance for the
 * curated template library. Each card renders a single template
 * (one voice rule, one pillar, a 5-color palette, a font pair, or
 * a publishing rule) and an Add button. The button calls the
 * matching per-section action; on success the card flips to a
 * "Added" state with a check mark so the user can see what
 * they've already seeded.
 *
 * "Bulk" templates (palettes, font pairs) return the number of
 * new rows added; the card surfaces that count in the success
 * state so a user who re-adds a template they already have
 * half-of sees "+3 added" rather than "+5 added" (and so an
 * idempotent re-add shows "+0 added" instead of pretending to
 * add the same swatches twice).
 */
type Kind = "voice" | "pillar" | "palette" | "typography" | "publishing";

export interface TemplateCardProps {
  kind: Kind;
  templateId: string;
  /** Title shown in the card header. */
  title: string;
  /** Subhead / blurb. */
  blurb?: string;
  /** Optional preview row (swatches, font family, rule type badge, etc.). */
  preview?: React.ReactNode;
  /** Optional small footer text (e.g. "5 swatches" / "1 face"). */
  meta?: string;
  /** Test id (default = the template id). */
  testId?: string;
  slug: string;
}

type Status = "idle" | "loading" | "added" | "error";

export function TemplateCard({
  kind,
  templateId,
  title,
  blurb,
  preview,
  meta,
  testId,
  slug,
}: TemplateCardProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  async function onAdd() {
    setStatus("loading");
    setMessage(null);
    let res;
    switch (kind) {
      case "voice":
        res = await addVoiceTemplateAction(slug, templateId);
        break;
      case "pillar":
        res = await addPillarTemplateAction(slug, templateId);
        break;
      case "palette":
        res = await addColorPaletteAction(slug, templateId);
        break;
      case "typography":
        res = await addTypographyTemplateAction(slug, templateId);
        break;
      case "publishing":
        res = await addPublishingTemplateAction(slug, templateId);
        break;
    }
    if (!res?.ok) {
      setStatus("error");
      setMessage(res?.error ?? "Failed to add template.");
      return;
    }
    setStatus("added");
    if (typeof res.added === "number" && res.added > 0) {
      setMessage(
        res.added === 1
          ? "Added 1 entry."
          : `Added ${res.added} entries. (${res.added === 1 ? "1" : res.added} new; the rest were already in your brand kit.)`,
      );
    } else {
      setMessage("Already in your brand kit — no change.");
    }
  }

  const test = testId ?? templateId;

  return (
    <div
      className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4"
      data-testid={`template-card-${test}`}
    >
      <div className="flex flex-col gap-1">
        <h4 className="text-section-title text-fg-primary font-semibold">{title}</h4>
        {blurb ? <p className="text-body text-fg-secondary">{blurb}</p> : null}
      </div>
      {preview ? <div className="flex flex-wrap items-center gap-2">{preview}</div> : null}
      {meta ? <p className="text-label text-fg-muted">{meta}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {status === "added" ? (
          <span
            className="text-label text-success inline-flex items-center gap-1 font-semibold"
            data-testid={`template-card-${test}-added`}
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {message ?? "Added."}
          </span>
        ) : status === "error" ? (
          <span
            className="text-label text-danger font-semibold"
            role="alert"
            data-testid={`template-card-${test}-error`}
          >
            {message}
          </span>
        ) : (
          <span className="text-label text-fg-muted" />
        )}
        <Button
          type="button"
          size="sm"
          variant={status === "added" ? "outline" : "default"}
          onClick={onAdd}
          disabled={status === "loading" || status === "added"}
          data-testid={`template-card-${test}-add`}
        >
          {status === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : status === "added" ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {status === "added" ? "Added" : "Add to brand kit"}
        </Button>
      </div>
    </div>
  );
}
