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
import { useLocaleT } from "@/components/i18n/locale-provider";

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
const ROLE_KEY: Record<FontRole, string> = {
  headline: "users.typographyForm.roleHeadline",
  body: "users.typographyForm.roleBody",
  accent: "users.typographyForm.roleAccent",
  mono: "users.typographyForm.roleMono",
};
const ROLE_FALLBACK: Record<FontRole, string> = {
  headline: "Headline",
  body: "Body",
  accent: "Accent",
  mono: "Mono",
};

const SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";

export function TypographyForm({
  slug,
  t: tProp,
}: {
  slug: string;
  /**
   * Optional translator. When provided, every user-visible string
   * (4 form field labels, the family hint, the 4 role options, the
   * 2 placeholders, the family aria-label, the live preview
   * aria-label + 'Preview — {family} {weight} ({role})' label,
   * the submit button + pending label) renders from
   * `users.typographyForm.*`; when omitted, the stored English
   * copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const value = t(key, params);
    return value === key ? fallback : value;
  };
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
        <FormField
          id="typography-name"
          label={tr("users.typographyForm.nameLabel", "Name")}
          required
        >
          <CharacterCountInput
            id="typography-name"
            className="mt-0"
            name="name"
            maxLength={80}
            placeholder={tr("users.typographyForm.namePlaceholder", "Heading, Body, Mono caption…")}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            id="typography-family"
            label={tr("users.typographyForm.familyLabel", "Family")}
            required
            hint={tr("users.typographyForm.familyHint", "Catalog + free-text")}
          >
            <Combobox
              value={family}
              onChange={setFamily}
              name="family"
              options={TYPOGRAPHY_OPTIONS}
              placeholder={tr("users.typographyForm.familyPlaceholder", "Pick a family…")}
              ariaLabel={tr("users.typographyForm.familyAria", "Typography family")}
              triggerTestId="typography-family-input"
              inputTestId="typography-family-search"
              allowCustom
            />
          </FormField>

          <FormField
            id="typography-weight"
            label={tr("users.typographyForm.weightLabel", "Weight")}
            required
          >
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

          <FormField
            id="typography-role"
            label={tr("users.typographyForm.roleLabel", "Role")}
            required
          >
            <select
              id="typography-role"
              name="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value as FontRole)}
              data-testid="typography-role-input"
              className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            >
              {(Object.keys(ROLE_KEY) as FontRole[]).map((value) => (
                <option key={value} value={value}>
                  {tr(ROLE_KEY[value], ROLE_FALLBACK[value])}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div
          className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
          aria-label={tr("users.typographyForm.previewAria", "Live preview")}
          data-testid="typography-preview"
        >
          <p className="text-label text-fg-muted mb-1 inline-flex items-center gap-1 font-semibold">
            <TypeIcon className="h-3 w-3" aria-hidden="true" />
            {tr("users.typographyForm.previewLabel", `Preview — ${family} ${weight} (${role})`, {
              family,
              weight,
              role: tr(ROLE_KEY[role], ROLE_FALLBACK[role]),
            })}
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
          <SubmitButton t={t} />
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

function SubmitButton({
  t,
}: {
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const { pending } = useFormStatus();
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  return (
    <Button
      type="submit"
      size="default"
      variant="default"
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid="typography-submit"
    >
      {pending
        ? tr("users.typographyForm.adding", "Adding…")
        : tr("users.typographyForm.addFont", "Add font")}
    </Button>
  );
}

// Re-export so the page can import the trash icon in one place.
export { Trash2 };
