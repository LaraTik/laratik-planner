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

type Translator = (key: string, params?: Record<string, string | number>) => string;

const EN_FALLBACK: Translator = (key, params) => {
  const lookup: Record<string, string> = {
    "platform.supportTicketLabel": "Ticket reference",
    "platform.supportTicketPlaceholder": "SUP-12345",
    "platform.supportDurationLabel": "Requested duration",
    "platform.supportDurationHelp": "Hours, up to 7 days.",
    "platform.supportScopeLabel": "Workspace scope",
    "platform.supportScopeAgency": "Agency-wide",
    "platform.supportMetadataTitle": "Metadata only",
    "platform.supportMetadataBody": "Do not request access to tenant content.",
    "platform.supportDownloadsTitle": "Request downloads",
    "platform.supportDownloadsBody": "The agency administrator may still deny downloads.",
    "platform.supportReasonLabel": "Reason for access",
    "platform.supportReasonPlaceholder": `Describe the support task for ${params?.name ?? ""} and why this scope is necessary.`,
    "platform.supportSubmitNote":
      "Submitting does not grant access immediately. An agency administrator must approve the request, and any grant is temporary and audited.",
    "platform.supportSuccess": "Request submitted for agency approval.",
    "platform.supportSubmit": "Request temporary access",
    "platform.supportSubmitPending": "Requesting…",
  };
  return lookup[key] ?? key;
};

export function SupportAccessRequestForm({
  agencyId,
  agencyName,
  workspaces,
  t,
}: {
  agencyId: string;
  agencyName: string;
  workspaces: ReadonlyArray<{ id: string; name: string }>;
  t?: Translator;
}) {
  const tr: Translator = t ?? EN_FALLBACK;
  const [state, action] = useActionState(createSupportAccessRequestFormAction, initial);
  return (
    <form action={action} className="space-y-4" data-testid="platform-support-request-form">
      <input type="hidden" name="targetAgencyId" value={agencyId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="support-ticket-reference">{tr("platform.supportTicketLabel")}</Label>
          <Input
            id="support-ticket-reference"
            name="ticketReference"
            required
            minLength={3}
            maxLength={120}
            placeholder={tr("platform.supportTicketPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="support-duration">{tr("platform.supportDurationLabel")}</Label>
          <Input
            id="support-duration"
            name="requestedDurationHours"
            type="number"
            required
            min={1}
            max={168}
            defaultValue={2}
          />
          <p className="text-label text-fg-muted">{tr("platform.supportDurationHelp")}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-workspace-scope">{tr("platform.supportScopeLabel")}</Label>
        <select
          id="support-workspace-scope"
          name="scopeWorkspaceId"
          defaultValue=""
          className="border-border bg-surface focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus:outline-none focus-visible:ring-2"
        >
          <option value="">{tr("platform.supportScopeAgency")}</option>
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
            <span className="text-fg-primary block font-semibold">
              {tr("platform.supportMetadataTitle")}
            </span>
            {tr("platform.supportMetadataBody")}
          </span>
        </label>
        <label className="border-border text-body text-fg-secondary flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] border p-3">
          <input type="checkbox" name="downloadsRequested" className="mt-1" />
          <span>
            <span className="text-fg-primary block font-semibold">
              {tr("platform.supportDownloadsTitle")}
            </span>
            {tr("platform.supportDownloadsBody")}
          </span>
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="support-access-reason">{tr("platform.supportReasonLabel")}</Label>
        <Textarea
          id="support-access-reason"
          name="reason"
          required
          minLength={8}
          maxLength={2000}
          rows={4}
          placeholder={tr("platform.supportReasonPlaceholder", { name: agencyName })}
        />
      </div>

      <p className="border-info/30 bg-info-subtle text-body text-fg-secondary rounded-[var(--radius-control)] border p-3">
        {tr("platform.supportSubmitNote")}
      </p>

      {state.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-body text-success">
          {tr("platform.supportSuccess")}
        </p>
      ) : null}
      <div className="flex justify-end">
        <FormSubmitButton
          label={tr("platform.supportSubmit")}
          pendingLabel={tr("platform.supportSubmitPending")}
          size="lg"
        />
      </div>
    </form>
  );
}
