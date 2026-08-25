"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
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
import { PLATFORM_ROLE_DETAILS, type PlatformRole } from "@/lib/auth/platform-access-types";
import { revokePlatformAccessAction, type PlatformAccessActionState } from "./actions";

const initial: PlatformAccessActionState = {};

export function RevokePlatformAccessDialog({
  userId,
  email,
  role,
}: {
  userId: string;
  email: string;
  role: PlatformRole;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(revokePlatformAccessAction, initial);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger min-h-11 min-w-11 px-0"
          aria-label={`Revoke access for ${email}`}
          title={`Revoke access for ${email}`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke platform access</DialogTitle>
          <DialogDescription>
            Revoke {PLATFORM_ROLE_DETAILS[role].label} access for <strong>{email}</strong>. The
            assignment remains in the audit history.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`platform-revoke-reason-${userId}`}>Reason</Label>
            <Input
              id={`platform-revoke-reason-${userId}`}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Offboarding or rotation ended"
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-body text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p role="status" className="text-body text-success">
              Access revoked.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {state.ok ? "Close" : "Cancel"}
            </Button>
            {!state.ok ? (
              <FormSubmitButton
                label="Revoke access"
                pendingLabel="Revoking…"
                variant="destructive"
              />
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
