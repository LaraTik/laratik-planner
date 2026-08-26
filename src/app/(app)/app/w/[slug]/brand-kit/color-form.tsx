"use client";
import * as React from "react";
import { useActionState } from "react";
import { createColorAssetAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";

/**
 * ColorForm — inline create form for the brand-kit color palette.
 *
 * The form takes a name + a hex color. The hex is editable in two
 * ways: a native `<input type="color">` swatch picker and a plain
 * text field. Both stay in sync via a single `useState`; submitting
 * sends the trimmed uppercase 6-char hex.
 *
 * Round 5 (rebuild, 2026-08-26):
 *   - Accept shorthand hex (`#fff`, `#000`) — common in design
 *     tools. The form expands it to 6 chars on blur. The Zod schema
 *     still requires 6 chars at the server; the expansion happens
 *     client-side before submission.
 *   - Uppercase the hex on blur so the saved value is always
 *     `#RRGGBB`. The picker already emits uppercase; the text
 *     field is normalised to match.
 *   - The pattern attribute is intentionally permissive (#abc or
 *     #abcdef) so the browser does not block the user mid-typing;
 *     the schema + the blur-expansion catch the rest.
 */
const SHORT_HEX = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const LONG_HEX = /^#[0-9a-fA-F]{6}$/;

function expandHex(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (LONG_HEX.test(trimmed)) return trimmed.toUpperCase();
  const m = SHORT_HEX.exec(trimmed);
  if (m && m[1] && m[2] && m[3]) {
    return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

export function ColorForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createColorAssetAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const [hex, setHex] = React.useState("#3B82F6");
  const formRef = React.useRef<HTMLFormElement>(null);
  // Round 5: reset the form on success so the user can add a
  // second color without manually clearing the name + hex.
  useSuccessReset(state, formRef);

  function onHexBlur() {
    setHex(expandHex(hex));
  }

  return (
    <Card padding="md" className="mb-3">
      <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <FormField id="color-name" label="Color name" required>
          <Input
            id="color-name"
            name="name"
            required
            maxLength={80}
            placeholder="Brand blue"
            className="mt-0"
          />
        </FormField>
        <FormField id="color-hex" label="Hex" required>
          <Input
            id="color-hex"
            className="mt-0 font-mono"
            name="hex"
            required
            // Permissive pattern so the browser does not block mid-typing.
            // The server-side Zod schema (and the on-blur expansion) are
            // the source of truth.
            pattern="#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            onBlur={onHexBlur}
            placeholder="#3B82F6"
            maxLength={7}
          />
        </FormField>
        <FormField id="color-pick" label="Pick">
          <input
            id="color-pick"
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="border-border bg-surface h-10 w-16 cursor-pointer rounded-[var(--radius-control)] border p-1"
            aria-label="Pick a color"
          />
        </FormField>
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
