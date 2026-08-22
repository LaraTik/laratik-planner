"use client";
import * as React from "react";
import { useActionState } from "react";
import { createPublishingRuleAction } from "./actions";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";

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

export function PublishingRuleForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createPublishingRuleAction.bind(null, slug),
    {} as FormState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // Reset the form on every successful submission. We use a ref +
  // effect (not a state-in-effect) to keep the React 19 lint rule
  // happy while still clearing the DOM after a server-action
  // success.
  React.useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3" data-testid="publishing-rule-form">
      <FormField id="publishing-rule-type" label="Rule type" required>
        <select
          id="publishing-rule-type"
          name="ruleType"
          required
          defaultValue="general"
          className={controlClass}
        >
          <option value="alt_text">Alt text</option>
          <option value="hashtag">Hashtags</option>
          <option value="compliance">Compliance</option>
          <option value="channel">Channel-specific</option>
          <option value="general">General</option>
        </select>
      </FormField>

      <FormField id="publishing-rule-title" label="Title" required>
        <Input
          id="publishing-rule-title"
          name="title"
          required
          maxLength={80}
          placeholder="e.g. Alt text standard"
          className="min-h-[44px]"
        />
      </FormField>

      <FormField id="publishing-rule-content" label="Rule" required>
        <textarea
          id="publishing-rule-content"
          name="content"
          required
          maxLength={1000}
          rows={4}
          placeholder="Describe the rule in plain language."
          className={controlClass}
        />
      </FormField>

      {state?.error ? (
        <p role="alert" aria-live="polite" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <FormSubmitButton label="Create rule" pendingLabel="Creating…" className="min-h-[44px]" />
      </div>
    </form>
  );
}
