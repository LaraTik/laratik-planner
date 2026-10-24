"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { FormActionError } from "@/components/forms/form-action-error";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { decideAgencySupportRequestAction, type SupportDecisionActionState } from "./actions";

const initialState: SupportDecisionActionState = {};

export function SupportRequestDecisionForm({
  requestId,
  downloadsRequested,
  locale,
}: {
  requestId: string;
  downloadsRequested: boolean;
  locale: "en" | "ar";
}) {
  const t = useLocaleT();
  const [state, action, pending] = useActionState(decideAgencySupportRequestAction, initialState);

  return (
    <form action={action} className="space-y-3" data-testid={`support-decision-form-${requestId}`}>
      <input type="hidden" name="requestId" value={requestId} />
      <div className="space-y-1.5">
        <Label htmlFor={`support-decision-reason-${requestId}`}>
          {t("agencyPlan.supportDecisionReason")}
        </Label>
        <DirAwareTextarea
          id={`support-decision-reason-${requestId}`}
          name="reason"
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          locale={locale}
          placeholder={t("agencyPlan.supportDecisionReasonPlaceholder")}
          data-testid={`support-decision-reason-${requestId}`}
        />
      </div>
      {downloadsRequested ? (
        <div className="border-border bg-surface-subtle flex min-h-11 items-start gap-3 rounded-[var(--radius-control)] border p-3">
          <Checkbox
            id={`support-decision-downloads-${requestId}`}
            name="grantDownloads"
            value="on"
          />
          <label
            htmlFor={`support-decision-downloads-${requestId}`}
            className="text-label text-fg-primary cursor-pointer"
          >
            {t("agencyPlan.supportDecisionAllowDownloads")}
          </label>
        </div>
      ) : null}
      {state.errorCode ? (
        <div data-testid={`support-decision-error-${requestId}`}>
          <FormActionError>
            {t(`agencyPlan.supportDecisionErrors.${state.errorCode}`)}
          </FormActionError>
        </div>
      ) : null}
      {state.successCode ? (
        <p
          role="status"
          className="text-body text-success"
          data-testid={`support-decision-success-${requestId}`}
        >
          {t(`agencyPlan.supportDecisionSuccess.${state.successCode}`)}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          name="decision"
          value="rejected"
          variant="destructive"
          disabled={pending}
          data-testid={`support-decision-reject-${requestId}`}
        >
          {pending ? t("agencyPlan.supportDecisionSaving") : t("agencyPlan.supportDecisionReject")}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
          data-testid={`support-decision-approve-${requestId}`}
        >
          {pending ? t("agencyPlan.supportDecisionSaving") : t("agencyPlan.supportDecisionApprove")}
        </Button>
      </div>
    </form>
  );
}
