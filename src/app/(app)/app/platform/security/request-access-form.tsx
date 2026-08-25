"use client";

import { useActionState } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createSupportAccessRequestFormAction,
  type SupportAccessRequestActionState,
} from "./actions";

const initial: SupportAccessRequestActionState = {};

export function SupportAccessRequestForm({
  agencyId,
  agencyName,
  workspaces,
}: {
  agencyId: string;
  agencyName: string;
  workspaces: ReadonlyArray<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState(createSupportAccessRequestFormAction, initial);
  return (
    <form action={action} className="space-y-4" data-testid="platform-support-request-form">
      <input type="hidden" name="targetAgencyId" value={agencyId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="support-ticket-reference">Ticket reference</Label>
          <Input
            id="support-ticket-reference"
            name="ticketReference"
            required
            minLength={3}
            maxLength={120}
            placeholder="SUP-12345"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-duration">Requested duration</Label>
          <Input
            id="support-duration"
            name="requestedDurationHours"
            type="number"
            required
            min={1}
            max={168}
            defaultValue={2}
          />
          <p className="text-label text-fg-muted">Hours, up to 7 days.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-workspace-scope">Workspace scope</Label>
        <select
          id="support-workspace-scope"
          name="scopeWorkspaceId"
          defaultValue=""
          className="border-border bg-surface focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus:outline-none focus-visible:ring-2"
        >
          <option value="">Agency-wide</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="border-border text-body text-fg-secondary flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] border p-3">
          <input type="checkbox" name="scopeMetadataOnly" className="mt-1" />
          <span>
            <span className="text-fg-primary block font-semibold">Metadata only</span>
            Do not request access to tenant content.
          </span>
        </label>
        <label className="border-border text-body text-fg-secondary flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] border p-3">
          <input type="checkbox" name="downloadsRequested" className="mt-1" />
          <span>
            <span className="text-fg-primary block font-semibold">Request downloads</span>
            The agency administrator may still deny downloads.
          </span>
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-access-reason">Reason for access</Label>
        <Textarea
          id="support-access-reason"
          name="reason"
          required
          minLength={8}
          maxLength={2000}
          rows={4}
          placeholder={`Describe the support task for ${agencyName} and why this scope is necessary.`}
        />
      </div>

      <p className="border-info/30 bg-info-subtle text-body text-fg-secondary rounded-[var(--radius-control)] border p-3">
        Submitting does not grant access immediately. An agency administrator must approve the
        request, and any grant is temporary and audited.
      </p>

      {state.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-body text-success">
          Request submitted for agency approval.
        </p>
      ) : null}
      <div className="flex justify-end">
        <FormSubmitButton label="Request temporary access" pendingLabel="Requesting…" size="lg" />
      </div>
    </form>
  );
}
