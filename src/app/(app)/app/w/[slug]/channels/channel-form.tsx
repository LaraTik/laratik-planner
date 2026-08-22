"use client";
import { useActionState } from "react";
import { createChannelAction } from "./actions";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Inline "Add social channel" form. Renders at the top of the channels
 * page for `workspace_manager`s; the table is the primary surface.
 *
 * Polished per the Stitch design + §18 form rules:
 *   - Every control has a visible `<Label htmlFor>` + `id`
 *   - Required fields show the `*` marker and `aria-required`
 *   - Errors are announced via `role="alert"`
 *   - Submit button is `disabled` + `aria-busy` while pending
 *   - Inputs use the focus-ring token (`--color-focus-ring`)
 *   - Touch targets are 40px (h-10) on desktop and 44px on mobile
 *
 * Why this lives at `/channels` (not `src/components/forms/`): the
 * form is page-specific (workspace-scoped, knows the slug, uses the
 * channels command). A shared "ChannelFields" was considered but the
 * create-vs-edit layouts are different enough to make the abstraction
 * net negative. See `channel-edit-drawer.tsx` for the drawer form.
 */
export function ChannelForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    createChannelAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  return (
    <Card padding="md" data-testid="channel-add-card" id="channel-add-card">
      <CardTitle className="mb-1">Add social channel</CardTitle>
      <CardDescription className="mb-4">
        Track the brand&rsquo;s accounts in one place. New ideas target all active channels by
        default; you can change channels per idea.
      </CardDescription>
      <form action={action} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="add-channel-platform">Platform</Label>
          <select
            id="add-channel-platform"
            name="platform"
            defaultValue="instagram"
            className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="linkedin">LinkedIn</option>
            <option value="youtube">YouTube</option>
            <option value="x">X (Twitter)</option>
            <option value="pinterest">Pinterest</option>
            <option value="threads">Threads</option>
            <option value="other">Custom</option>
          </select>
        </div>
        <FormField id="add-channel-accountName" label="Account name" required>
          <Input
            name="accountName"
            placeholder="Brand Instagram"
            autoComplete="off"
            maxLength={120}
          />
        </FormField>
        <FormField id="add-channel-handle" label="Handle" hint="Optional · without @">
          <Input name="handle" placeholder="brand" autoComplete="off" maxLength={60} />
        </FormField>
        <FormField id="add-channel-url" label="Account link" hint="Optional · full URL">
          <Input name="url" type="url" placeholder="https://…" autoComplete="off" />
        </FormField>
        <div className="flex items-end">
          <FormSubmitButton
            label="Add channel"
            pendingLabel="Adding…"
            className="w-full sm:w-auto"
          />
        </div>
        {state?.error ? (
          <p
            role="alert"
            data-testid="channel-add-error"
            className="text-label text-danger font-semibold sm:col-span-2 xl:col-span-5"
          >
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
