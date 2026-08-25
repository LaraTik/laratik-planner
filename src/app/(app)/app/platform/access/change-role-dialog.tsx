"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import {
  PLATFORM_ROLE_DETAILS,
  PLATFORM_ROLE_VALUES,
  type PlatformRole,
} from "@/lib/auth/platform-access-types";
import { changePlatformRoleAction, type PlatformAccessActionState } from "./actions";

const initial: PlatformAccessActionState = {};

export function ChangePlatformRoleDialog({
  userId,
  email,
  currentRole,
}: {
  userId: string;
  email: string;
  currentRole: PlatformRole;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(changePlatformRoleAction, initial);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11 min-w-11 px-0"
          aria-label={`Change role for ${email}`}
          title={`Change role for ${email}`}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change platform role</DialogTitle>
          <DialogDescription>
            Change access for <strong>{email}</strong>. Downgrading the final Platform Owner is
            blocked by the server.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`platform-role-${userId}`}>New role</Label>
            <select
              id={`platform-role-${userId}`}
              name="role"
              required
              defaultValue={currentRole}
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
            <Label htmlFor={`platform-role-reason-${userId}`}>Reason</Label>
            <Input
              id={`platform-role-reason-${userId}`}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Responsibility changed"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-body text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p role="status" className="text-body text-success">
              Role updated.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {state.ok ? "Close" : "Cancel"}
            </Button>
            {!state.ok ? <FormSubmitButton label="Change role" pendingLabel="Changing…" /> : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
