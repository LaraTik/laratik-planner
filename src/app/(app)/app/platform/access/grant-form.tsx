"use client";

import { useActionState } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM_ROLE_DETAILS, PLATFORM_ROLE_VALUES } from "@/lib/auth/platform-access-types";
import { grantPlatformAccessAction, type PlatformAccessActionState } from "./actions";

const initial: PlatformAccessActionState = {};

export function GrantPlatformAccessForm() {
  const [state, action] = useActionState(grantPlatformAccessAction, initial);
  return (
    <form action={action} className="grid gap-4" data-testid="platform-access-grant-form">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="platform-access-email">Email</Label>
          <Input
            id="platform-access-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="person@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="platform-access-role">Platform role</Label>
          <select
            id="platform-access-role"
            name="role"
            required
            defaultValue="agency_operator"
            className="border-border bg-surface focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus:outline-none focus-visible:ring-2"
          >
            {PLATFORM_ROLE_VALUES.map((role) => (
              <option key={role} value={role}>
                {PLATFORM_ROLE_DETAILS[role].label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="platform-access-reason">Reason</Label>
          <Input
            id="platform-access-reason"
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder="On-call rotation or responsibility"
          />
        </div>
      </div>
      <ul className="text-label text-fg-muted grid gap-1 sm:grid-cols-2">
        {PLATFORM_ROLE_VALUES.map((role) => (
          <li key={role}>
            <span className="text-fg-secondary font-semibold">
              {PLATFORM_ROLE_DETAILS[role].label}:
            </span>{" "}
            {PLATFORM_ROLE_DETAILS[role].description}
          </li>
        ))}
      </ul>
      {state.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-body text-success">
          {state.unchanged ? "That assignment was already active." : "Platform access added."}
        </p>
      ) : null}
      <div className="flex justify-end">
        <FormSubmitButton label="Add platform member" pendingLabel="Adding…" />
      </div>
    </form>
  );
}
