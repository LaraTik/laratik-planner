"use client";

import * as React from "react";
import { useActionState } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { grantPlatformAdminAction, type GrantActionState } from "./actions";

const initial: GrantActionState = {};

/**
 * Grant-platform-admin form (superadmin-clarity).
 *
 * Server action: `grantPlatformAdminAction`. The form maps
 * `formData` into the `GrantPlatformAdminSchema` payload and
 * surfaces service errors as a single `role="alert"` line.
 *
 * Success states are explicit:
 *   - "alreadyGranted" → the user already had a live grant; we
 *     treat this as a soft success (no error, no row insert).
 *   - "ok" → the grant was just inserted (or re-activated).
 */
export function GrantPlatformAdminForm() {
  const [state, action, pending] = useActionState(grantPlatformAdminAction, initial);

  return (
    <form action={action} className="space-y-4" data-testid="platform-admins-grant-form">
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label htmlFor="platform-admin-email">
            Email
            <span aria-hidden="true" className="text-danger ml-0.5">
              *
            </span>
          </Label>
          <Input
            id="platform-admin-email"
            name="email"
            type="email"
            required
            aria-required="true"
            autoComplete="off"
            placeholder="person@company.com"
            data-testid="platform-admins-grant-email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="platform-admin-reason">
            Reason
            <span aria-hidden="true" className="text-danger ml-0.5">
              *
            </span>
          </Label>
          <Input
            id="platform-admin-reason"
            name="reason"
            type="text"
            required
            aria-required="true"
            minLength={3}
            maxLength={500}
            placeholder="Onboarding operator; on-call rotation"
            data-testid="platform-admins-grant-reason"
          />
        </div>
      </div>
      {state.error ? (
        <p
          role="alert"
          data-testid="platform-admins-grant-error"
          className="text-body text-danger font-semibold"
        >
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p
          role="status"
          data-testid="platform-admins-grant-success"
          className="text-body text-success font-semibold"
        >
          {state.alreadyGranted
            ? `${state.email ?? "User"} was already a platform admin — no change.`
            : `Granted platform admin to ${state.email ?? "user"}.`}
        </p>
      ) : null}
      <div className="flex justify-end">
        <FormSubmitButton
          label="Grant platform admin"
          pendingLabel={pending ? "Granting…" : "Grant platform admin"}
          data-testid="platform-admins-grant-submit"
        />
      </div>
    </form>
  );
}
