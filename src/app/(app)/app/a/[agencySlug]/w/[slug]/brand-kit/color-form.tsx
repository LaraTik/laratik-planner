"use client";
import * as React from "react";
import { useActionState } from "react";
import { createColorAssetAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { CharacterCountInput } from "@/components/workspace/character-count-input";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * ColorForm — inline create form for the brand-kit color palette.
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
 *
 * Phase 8 (2026-08-28): adds a `Role` select (primary / secondary
 * / accent / neutral). The role is persisted to the new
 * `brand_asset.color_role` column and drives the colors page
 * grouping + the AI context payload. A planner who skips the
 * role still gets a usable color (rendered in the "Uncategorised"
 * group) — the form does not force a choice.
 */
type ColorRole = "primary" | "secondary" | "accent" | "neutral";

const ROLE_LABEL_KEY: Record<ColorRole, string> = {
  primary: "users.colorForm.rolePrimary",
  secondary: "users.colorForm.roleSecondary",
  accent: "users.colorForm.roleAccent",
  neutral: "users.colorForm.roleNeutral",
};
const ROLE_LABEL_FALLBACK: Record<ColorRole, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  neutral: "Neutral",
};
const ROLE_DESC_KEY: Record<ColorRole, string> = {
  primary: "users.colorForm.roleDescPrimary",
  secondary: "users.colorForm.roleDescSecondary",
  accent: "users.colorForm.roleDescAccent",
  neutral: "users.colorForm.roleDescNeutral",
};
const ROLE_DESC_FALLBACK: Record<ColorRole, string> = {
  primary: "The dominant brand colour (CTAs, headlines)",
  secondary: "A supporting brand colour (sub-heads, badges)",
  accent: "A highlight colour (links, call-outs)",
  neutral: "Background, surface, and text gray",
};

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

export function ColorForm({
  slug,
  t: tProp,
}: {
  slug: string;
  /**
   * Optional translator. When provided, every user-visible string
   * (4 form field labels, 4 role labels, 4 role descriptions, the
   * 2 placeholders, the picker aria-label, the submit button +
   * pending label) renders from `users.colorForm.*`; when omitted,
   * the stored English copy is used.
   */
  t?: (key: string) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const [state, action] = useActionState(
    createColorAssetAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const [hex, setHex] = React.useState("#3B82F6");
  const [role, setRole] = React.useState<ColorRole>("primary");
  const formRef = React.useRef<HTMLFormElement>(null);
  // Round 5: reset the form on success so the user can add a
  // second color without manually clearing the name + hex.
  useSuccessReset(state, formRef);

  function onHexBlur() {
    setHex(expandHex(hex));
  }

  return (
    <Card padding="md" className="mb-3">
      <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <FormField id="color-name" label={tr("users.colorForm.nameLabel", "Color name")} required>
          <CharacterCountInput
            id="color-name"
            name="name"
            maxLength={80}
            placeholder={tr("users.colorForm.namePlaceholder", "Brand blue")}
            className="mt-0"
          />
        </FormField>
        <FormField id="color-hex" label={tr("users.colorForm.hexLabel", "Hex")} required>
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
            placeholder={tr("users.colorForm.hexPlaceholder", "#3B82F6")}
            maxLength={7}
          />
        </FormField>
        <FormField id="color-pick" label={tr("users.colorForm.pickLabel", "Pick")}>
          <input
            id="color-pick"
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="border-border bg-surface h-10 w-16 cursor-pointer rounded-[var(--radius-control)] border p-1"
            aria-label={tr("users.colorForm.pickAria", "Pick a color")}
          />
        </FormField>
        <FormField id="color-role" label={tr("users.colorForm.roleLabel", "Role")}>
          <select
            id="color-role"
            name="colorRole"
            value={role}
            onChange={(e) => setRole(e.target.value as ColorRole)}
            data-testid="color-role-input"
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
            aria-describedby="color-role-description"
          >
            {(Object.keys(ROLE_LABEL_KEY) as ColorRole[]).map((value) => (
              <option key={value} value={value}>
                {tr(ROLE_LABEL_KEY[value], ROLE_LABEL_FALLBACK[value])}
              </option>
            ))}
          </select>
        </FormField>
        <p
          id="color-role-description"
          className="text-label text-fg-muted sm:col-span-4"
          aria-live="polite"
        >
          {tr(ROLE_DESC_KEY[role], ROLE_DESC_FALLBACK[role])}
        </p>
        <div className="flex items-end sm:col-span-4 sm:justify-end">
          <FormSubmitButton
            label={tr("users.colorForm.addColor", "Add color")}
            pendingLabel={tr("users.colorForm.adding", "Adding…")}
          />
        </div>
        {state?.error ? (
          <p role="alert" className="text-label text-danger sm:col-span-4">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
