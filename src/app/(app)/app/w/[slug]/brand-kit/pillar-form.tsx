"use client";
import * as React from "react";
import { useActionState } from "react";
import { createPillarAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCountInput } from "@/components/workspace/character-count-input";

/**
 * PillarForm — inline create form for the brand-kit Pillars
 * section (Phase 8 / C-5.4). Mirrors the pattern used by the
 * voice / color forms: manager-only, useActionState, form-reset
 * on success.
 *
 * Fields:
 *   - name (required, 2-80 chars; case-insensitive unique per
 *     active workspace — the server's partial unique index
 *     surfaces a friendlier error)
 *   - color (optional, #rrggbb; preview swatch updates live)
 *   - description (optional, up to 2000 chars)
 */
type FormState = { error?: string; success?: boolean };

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

export function PillarForm({
  slug,
  t,
}: {
  slug: string;
  /**
   * Optional translator. When provided, every user-visible string
   * (3 field labels, 3 placeholders, the picker aria-label, the
   * submit button + pending label) renders from
   * `users.pillarForm.*`; when omitted, the stored English copy
   * is used.
   */
  t?: (key: string) => string;
}) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  const [state, action] = useActionState(createPillarAction.bind(null, slug), {} as FormState);
  const [color, setColor] = React.useState("#6366F1");
  const [name, setName] = React.useState("");
  const formRef = React.useRef<HTMLFormElement>(null);
  useSuccessReset(state, formRef);

  return (
    <Card padding="md" className="mb-3">
      <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <FormField
          id="pillar-name"
          label={tr("users.pillarForm.nameLabel", "Pillar name")}
          required
        >
          <CharacterCountInput
            id="pillar-name"
            name="name"
            maxLength={80}
            placeholder={tr(
              "users.pillarForm.namePlaceholder",
              "Education, Product, Behind the scenes…",
            )}
            className="mt-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField id="pillar-color" label={tr("users.pillarForm.colorLabel", "Color")}>
          <div className="flex items-center gap-2">
            <Input
              id="pillar-color"
              className="mt-0 w-28 font-mono"
              name="color"
              pattern="#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onBlur={() => setColor(expandHex(color))}
              placeholder={tr("users.pillarForm.colorPlaceholder", "#6366F1")}
              maxLength={7}
              data-testid="pillar-color-input"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="border-border bg-surface h-10 w-12 cursor-pointer rounded-[var(--radius-control)] border p-1"
              aria-label={tr("users.pillarForm.colorAria", "Pick a pillar color")}
            />
            <span
              className="border-border h-6 w-6 shrink-0 rounded-full border"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          </div>
        </FormField>
        <FormField
          id="pillar-description"
          label={tr("users.pillarForm.descriptionLabel", "Description")}
          className="sm:col-span-2"
        >
          <Textarea
            id="pillar-description"
            name="description"
            maxLength={2000}
            rows={2}
            placeholder={tr(
              "users.pillarForm.descriptionPlaceholder",
              "One or two sentences the AI uses to keep caption drafts on-topic.",
            )}
            className="mt-0"
          />
        </FormField>
        <div className="flex items-end sm:col-span-2 sm:justify-end">
          <FormSubmitButton
            label={tr("users.pillarForm.addPillar", "Add pillar")}
            pendingLabel={tr("users.pillarForm.adding", "Adding…")}
          />
        </div>
        {state?.error ? (
          <p role="alert" className="text-label text-danger sm:col-span-2">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
