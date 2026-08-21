"use client";
import * as React from "react";
import { useActionState } from "react";
import { createLinkedResourceAction } from "./actions";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";

/**
 * LinkedResourceForm — inline create form for the brand-kit Linked
 * Resources section (STUDIOFLOW_MASTER_PROMPT.md §11.x).
 *
 * Fields:
 *   - `provider`    — google_drive / figma / canva / dropbox / other
 *   - `name`        — 1–120 chars
 *   - `url`         — HTTPS-only URL; the `pattern` attribute blocks
 *                     http:// / javascript: submissions in the
 *                     browser before the server-action Zod check
 *                     runs
 *   - `description` — optional, ≤280 chars
 *
 * Accessibility:
 *   - Every control has a visible `<label htmlFor>` (via `FormField`).
 *   - Touch targets are at least 44px tall on mobile (per §18).
 *   - Server-action errors are announced via `role="alert"
 *     aria-live="polite"`.
 *   - The submit button is disabled and shows "Adding…" while the
 *     action is in flight.
 *
 * On success the form resets to empty values via `form.reset()` so
 * another resource can be added without a manual page refresh. We
 * use uncontrolled inputs + a ref to keep the reset declarative.
 */

// Shared control class — matches the publishing-rule form and the
// `settings-form.tsx` / `channel-form.tsx` patterns.
const controlClass =
  "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring min-h-[44px] w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none";

type FormState = { error?: string; success?: boolean };

export function LinkedResourceForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createLinkedResourceAction.bind(null, slug),
    {} as FormState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // Reset the form on every successful submission. See the
  // publishing-rule form for the rationale.
  React.useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state?.success]);

  return (
    <form ref={formRef} action={action} className="space-y-3" data-testid="linked-resource-form">
      <FormField id="linked-resource-provider" label="Provider" required>
        <select
          id="linked-resource-provider"
          name="provider"
          required
          defaultValue="figma"
          className={controlClass}
        >
          <option value="google_drive">Google Drive</option>
          <option value="figma">Figma</option>
          <option value="canva">Canva</option>
          <option value="dropbox">Dropbox</option>
          <option value="other">Other</option>
        </select>
      </FormField>

      <FormField id="linked-resource-name" label="Name" required>
        <Input
          id="linked-resource-name"
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Brand library"
          className="min-h-[44px]"
        />
      </FormField>

      <FormField id="linked-resource-url" label="URL" required hint="HTTPS only">
        <Input
          id="linked-resource-url"
          name="url"
          type="url"
          required
          pattern="https://.*"
          placeholder="https://figma.com/file/…"
          className="min-h-[44px]"
        />
      </FormField>

      <FormField id="linked-resource-description" label="Description">
        <textarea
          id="linked-resource-description"
          name="description"
          maxLength={280}
          rows={3}
          placeholder="Optional. What's in this library?"
          className={controlClass}
        />
      </FormField>

      {state?.error ? (
        <p role="alert" aria-live="polite" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <FormSubmitButton label="Link resource" pendingLabel="Adding…" className="min-h-[44px]" />
      </div>
    </form>
  );
}
