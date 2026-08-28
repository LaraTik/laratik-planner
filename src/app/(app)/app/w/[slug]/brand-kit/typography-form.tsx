"use client";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Type as TypeIcon } from "lucide-react";
import { createFontAssetAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/forms/form-field";
import { CharacterCountInput } from "@/components/workspace/character-count-input";
import { Button } from "@/components/ui/button";
import {
  TYPOGRAPHY_OPTIONS,
  fontClassFor,
  KNOWN_FAMILY_NAMES,
} from "@/lib/brand/typography-families";

/**
 * TypographyForm — create form for the brand-kit Typography section.
 *
 * Phase 5 (2026-08-28) replaces the previous `<datalist>` family
 * picker with a proper searchable Combobox (see
 * `src/components/ui/combobox.tsx`). The dropdown groups families
 * into Sans / Serif / Display / Mono, and each option row renders
 * the family name in its actual font so the planner sees a live
 * preview without leaving the dropdown.
 *
 * The 14 families are pre-imported via `next/font/google` at
 * module load (see `lib/brand/typography-families.ts`) so the
 * preview is honest — no FOUT, no `@import` round-trip. Families
 * outside the catalog are accepted as free-text (the form
 * continues to allow custom family names like "Caveat" or a
 * brand-paid license like "Söhne").
 *
 * Fields: name, family (Combobox), weight (100-900 step 100),
 * role (Headline / Body / Accent / Mono). The live preview card
 * below the form renders the sample text in the currently-selected
 * family + weight.
 */

type FontRole = "headline" | "body" | "accent" | "mono";
const ROLES: { value: FontRole; label: string }[] = [
  { value: "headline", label: "Headline" },
  { value: "body", label: "Body" },
  { value: "accent", label: "Accent" },
  { value: "mono", label: "Mono" },
];

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";

export function TypographyForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createFontAssetAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const [family, setFamily] = React.useState<string>(KNOWN_FAMILY_NAMES[0] ?? "Inter");
  const [weight, setWeight] = React.useState(400);
  const [role, setRole] = React.useState<FontRole>("headline");
  const formRef = React.useRef<HTMLFormElement>(null);
  // Round 5: reset the form on success so the user can add a
  // second font without manually clearing the fields.
  useSuccessReset(state, formRef);

  const fontClass = fontClassFor(family);
  const previewSize = role === "headline" ? 28 : role === "accent" ? 22 : 16;

  return (
    <Card padding="md" className="mb-3">
      <form ref={formRef} action={action} className="grid gap-3">
        <FormField id="typography-name" label="Name" required>
          <CharacterCountInput
            id="typography-name"
            className="mt-0"
            name="name"
            maxLength={80}
            placeholder="Heading, Body, Mono caption…"
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="typography-family" label="Family" required hint="Catalog + free-text">
            <Combobox
              value={family}
              onChange={setFamily}
              name="family"
              options={TYPOGRAPHY_OPTIONS}
              placeholder="Pick a family…"
              ariaLabel="Typography family"
              triggerTestId="typography-family-input"
              inputTestId="typography-family-search"
              allowCustom
            />
          </FormField>

          <FormField id="typography-weight" label="Weight" required>
            <input
              id="typography-weight"
              type="number"
              name="weight"
              min={100}
              max={900}
              step={100}
              required
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              data-testid="typography-weight-input"
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full [appearance:textfield] rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </FormField>

          <FormField id="typography-role" label="Role" required>
            <select
              id="typography-role"
              name="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value as FontRole)}
              data-testid="typography-role-input"
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div
          className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
          aria-label="Live preview"
          data-testid="typography-preview"
        >
          <p className="text-label text-fg-muted mb-1 inline-flex items-center gap-1 font-semibold">
            <TypeIcon className="h-3 w-3" aria-hidden="true" />
            Preview — {family} {weight} ({role})
          </p>
          <p
            className={fontClass ?? undefined}
            style={{
              fontFamily: fontClass ? undefined : `"${family}", system-ui, sans-serif`,
              fontWeight: weight,
              fontSize: `${previewSize}px`,
              lineHeight: 1.4,
            }}
          >
            {SAMPLE_TEXT}
          </p>
        </div>

        <div className="flex items-center justify-end">
          <SubmitButton />
        </div>
        {state?.error ? (
          <p role="alert" className="text-label text-danger font-semibold">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="default"
      variant="default"
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid="typography-submit"
    >
      {pending ? "Adding…" : "Add font"}
    </Button>
  );
}

// Re-export so the page can import the trash icon in one place.
export { Trash2 };
