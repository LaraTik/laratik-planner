"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { submitDeliveryAction } from "../actions";
import { humanize } from "@/lib/content/status";
import { Package } from "lucide-react";

const PROVIDERS = [
  "google_drive",
  "dropbox",
  "onedrive",
  "frame_io",
  "figma",
  "canva",
  "other",
] as const;

export function DeliverySection({
  workspaceSlug,
  contentItemId,
  contentStatus,
  isDesigner,
  isManager,
}: {
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  isDesigner: boolean;
  isManager: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const canSubmit =
    (isDesigner || isManager) &&
    (contentStatus === "in_design" ||
      contentStatus === "creative_review" ||
      contentStatus === "changes_requested");

  if (!canSubmit && !open) return null;

  if (!open) {
    return (
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Deliveries</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Package className="h-3.5 w-3.5" aria-hidden="true" /> Submit delivery
          </Button>
        </header>
      </Card>
    );
  }

  return (
    <Card>
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
          <legend className="text-body text-fg-primary font-semibold">Links (at least one)</legend>
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
              <Input type="url" name="linkUrl" placeholder="https://…" className="col-span-5" />
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
  );
}
