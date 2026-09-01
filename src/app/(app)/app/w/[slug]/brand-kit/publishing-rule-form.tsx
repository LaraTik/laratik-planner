"use client";
import * as React from "react";
import { useActionState } from "react";
import { createPublishingRuleAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { CharacterCountInput } from "@/components/workspace/character-count-input";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * PublishingRuleForm — inline create form for the brand-kit
 * Publishing Rules section (STUDIOFLOW_MASTER_PROMPT.md §11.x).
 *
 * Fields:
 *   - `ruleType` — alt_text / hashtag / compliance / channel / general
 *   - `title`    — short label, 1–80 chars
 *   - `content`  — the rule body, 1–1000 chars
 *
 * Accessibility:
 *   - Every control is associated with a visible `<label htmlFor>`
 *     (rendered by `FormField`); required fields are marked with
 *     `aria-required` and a `*` glyph.
 *   - Touch targets are at least 44px tall on mobile (per §18) via
 *     the `min-h-[44px]` utility on the select/textarea/button.
 *   - Server-action errors are announced via `role="alert"
 *     aria-live="polite"`.
 *   - The submit button is disabled and shows "Creating…" while the
 *     action is in flight.
 *
 * On success the form resets to empty values via `form.reset()` so
 * a second rule can be added without a page refresh. We use
 * uncontrolled inputs + a ref to keep the reset declarative; this
 * also avoids `setState`-in-effect lint warnings.
 */

// Shared control class — matches `settings-form.tsx` and
// `channel-form.tsx`. `min-h-[44px]` is the touch-target floor;
// the 40px `h-10` default from `<Input>` already meets the bar on
// desktop, and the explicit min-height keeps the bar on mobile.
const controlClass =
  "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-[44px] w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none";

type FormState = { error?: string; success?: boolean };

const TYPE_KEY: Record<"alt_text" | "hashtag" | "compliance" | "channel" | "general", string> = {
  alt_text: "users.publishingRuleForm.typeAltText",
  hashtag: "users.publishingRuleForm.typeHashtag",
  compliance: "users.publishingRuleForm.typeCompliance",
  channel: "users.publishingRuleForm.typeChannel",
  general: "users.publishingRuleForm.typeGeneral",
};
const TYPE_FALLBACK: Record<"alt_text" | "hashtag" | "compliance" | "channel" | "general", string> =
  {
    alt_text: "Alt text",
    hashtag: "Hashtags",
    compliance: "Compliance",
    channel: "Channel-specific",
    general: "General",
  };

export function PublishingRuleForm({
  slug,
  t: tProp,
}: {
  slug: string;
  /**
   * Optional translator. When provided, every user-visible string
   * (3 field labels, 2 placeholders, 5 rule-type options, the
   * submit button + pending label) renders from
   * `users.publishingRuleForm.*`; when omitted, the stored
   * English copy is used.
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
    createPublishingRuleAction.bind(null, slug),
    {} as FormState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // Reset the form on every successful submission via the shared
  // hook (Round 5 — replaces the per-form useEffect+formRef pattern
  // that was duplicated across all 6 brand-kit forms).
  useSuccessReset(state, formRef);

  return (
    <form ref={formRef} action={action} className="space-y-3" data-testid="publishing-rule-form">
      <FormField
        id="publishing-rule-type"
        label={tr("users.publishingRuleForm.typeLabel", "Rule type")}
        required
      >
        <select
          id="publishing-rule-type"
          name="ruleType"
          required
          defaultValue="general"
          className={controlClass}
        >
          {(Object.keys(TYPE_KEY) as Array<keyof typeof TYPE_KEY>).map((value) => (
            <option key={value} value={value}>
              {tr(TYPE_KEY[value], TYPE_FALLBACK[value])}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        id="publishing-rule-title"
        label={tr("users.publishingRuleForm.titleLabel", "Title")}
        required
      >
        <CharacterCountInput
          id="publishing-rule-title"
          name="title"
          required
          maxLength={80}
          placeholder={tr("users.publishingRuleForm.titlePlaceholder", "e.g. Alt text standard")}
        />
      </FormField>

      <FormField
        id="publishing-rule-content"
        label={tr("users.publishingRuleForm.contentLabel", "Rule")}
        required
      >
        <CharacterCountInput
          id="publishing-rule-content"
          as="textarea"
          name="content"
          required
          maxLength={1000}
          rows={4}
          placeholder={tr(
            "users.publishingRuleForm.contentPlaceholder",
            "Describe the rule in plain language.",
          )}
        />
      </FormField>

      {state?.error ? (
        <p role="alert" aria-live="polite" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <FormSubmitButton
          label={tr("users.publishingRuleForm.createRule", "Create rule")}
          pendingLabel={tr("users.publishingRuleForm.creating", "Creating…")}
          className="min-h-[44px]"
        />
      </div>
    </form>
  );
}
