"use client";
import * as React from "react";
import { useActionState } from "react";
import { createColorAssetAction } from "./actions";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";

/**
 * ColorForm — inline create form for the brand-kit color palette.
 *
 * The form takes a name + a hex color. The hex is editable in two
 * ways: a native `<input type="color">` swatch picker and a plain
 * text field. Both stay in sync via a single `useState`; submitting
 * sends the trimmed uppercase hex.
 */
export function ColorForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createColorAssetAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const [hex, setHex] = React.useState("#3B82F6");

  return (
    <Card padding="md" className="mb-3">
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="text-label font-semibold">
          Color name
          <Input className="mt-1" name="name" required maxLength={80} placeholder="Brand blue" />
        </label>
        <label className="text-label font-semibold">
          Hex
          <Input
            className="mt-1 font-mono"
            name="hex"
            required
            pattern="^#[0-9a-fA-F]{6}$"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#3B82F6"
          />
        </label>
        <label className="text-label font-semibold">
          Pick
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="border-border bg-surface mt-1 h-10 w-16 cursor-pointer rounded-[var(--radius-control)] border p-1"
            aria-label="Pick a color"
          />
        </label>
        <div className="flex items-end sm:col-span-3 sm:justify-end">
          <FormSubmitButton label="Add color" pendingLabel="Adding…" />
        </div>
        {state?.error ? (
          <p role="alert" className="text-label text-danger sm:col-span-3">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
