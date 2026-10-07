"use client";
import * as React from "react";
import { useActionState } from "react";
import { createLinkedResourceAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { CharacterCountInput } from "@/components/workspace/character-count-input";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
  const t = useLocaleT();
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const [state, action] = useActionState(
    createLinkedResourceAction.bind(null, slug),
    {} as FormState,
  );
  const formRef = React.useRef<HTMLFormElement>(null);
  // Reset the form on every successful submission via the shared
  // hook (Round 5 — replaces the per-form useEffect+formRef pattern
  // that was duplicated across all 6 brand-kit forms).
  useSuccessReset(state, formRef);

  return (
    <form ref={formRef} action={action} className="space-y-3" data-testid="linked-resource-form">
      <FormField
        id="linked-resource-provider"
        label={tr("users.linkedResource.providerLabel", "Provider")}
        required
      >
        <select
          id="linked-resource-provider"
          name="provider"
          required
          defaultValue="figma"
          className={controlClass}
        >
          <option value="google_drive">
            {tr("users.linkedResource.providerGoogleDrive", "Google Drive")}
          </option>
          <option value="figma">{tr("users.linkedResource.providerFigma", "Figma")}</option>
          <option value="canva">{tr("users.linkedResource.providerCanva", "Canva")}</option>
          <option value="dropbox">{tr("users.linkedResource.providerDropbox", "Dropbox")}</option>
          <option value="other">{tr("users.linkedResource.providerOther", "Other")}</option>
        </select>
      </FormField>

      <FormField
        id="linked-resource-name"
        label={tr("users.linkedResource.nameLabel", "Name")}
        required
      >
        <CharacterCountInput
          id="linked-resource-name"
          name="name"
          required
          maxLength={120}
          placeholder={tr("users.linkedResource.namePlaceholder", "e.g. Brand library")}
        />
      </FormField>

      <FormField
        id="linked-resource-url"
        label={tr("users.linkedResource.urlLabel", "URL")}
        required
        hint={tr("users.linkedResource.urlHint", "HTTPS only")}
      >
        <Input
          id="linked-resource-url"
          name="url"
          type="url"
          required
          // Tighter pattern (Round 5): the old https://.* matched
          // 'https:// ' (whitespace) and 'https://-invalid'. The
          // new pattern enforces https:// + a domain-like host.
          // The server-side Zod schema (.url().refine(...)) is
          // the real source of truth; the pattern is a UX hint.
          pattern="https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*"
          placeholder={tr("users.linkedResource.urlPlaceholder", "https://figma.com/file/…")}
          className="min-h-[44px]"
        />
      </FormField>

      <FormField
        id="linked-resource-description"
        label={tr("users.linkedResource.descriptionLabel", "Description")}
      >
        <CharacterCountInput
          id="linked-resource-description"
          as="textarea"
          name="description"
          maxLength={280}
          rows={3}
          placeholder={tr(
            "users.linkedResource.descriptionPlaceholder",
            "Optional. What's in this library?",
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
          label={tr("users.linkedResource.link", "Link resource")}
          pendingLabel={tr("users.linkedResource.adding", "Adding…")}
          className="min-h-[44px]"
        />
      </div>
    </form>
  );
}
