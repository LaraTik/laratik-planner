"use client";

import * as React from "react";
import { useActionState } from "react";
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
import { revokePlatformAdminAction, type RevokeActionState } from "./actions";

const initial: RevokeActionState = {};

/**
 * Revoke-platform-admin dialog (superadmin-clarity).
 *
 * Wraps `revokePlatformAdminAction` in a confirmation dialog. The
 * reason field is required (the service enforces min 3 chars). The
 * service also refuses to revoke the last live admin; that
 * error surfaces in the dialog and prevents submission.
 */
export function RevokePlatformAdminDialog({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = React.useState(false);
  const [state, action, pending] = useActionState(revokePlatformAdminAction, initial);

  // When the action succeeds the success message is rendered
  // below; the user closes the dialog with the Cancel button
  // (now labelled "Close") or by clicking outside. Auto-closing
  // from an effect would trigger React 19's setState-in-effect
  // lint and a "flash of stale content" race.

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid={`platform-admins-revoke-trigger-${userId}`}
        >
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke platform admin</DialogTitle>
          <DialogDescription>
            This soft-revokes the platform-admin grant for <strong>{email}</strong>. The row stays
            in the table for the audit trail; the user will no longer be able to reach{" "}
            <code>/app/platform/*</code>.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`revoke-reason-${userId}`}>
              Reason
              <span aria-hidden="true" className="text-danger ml-0.5">
                *
              </span>
            </Label>
            <Input
              id={`revoke-reason-${userId}`}
              name="reason"
              type="text"
              required
              aria-required="true"
              minLength={3}
              maxLength={500}
              placeholder="Left the team / role change / off-rotation"
              data-testid={`platform-admins-revoke-reason-${userId}`}
            />
          </div>
          {state.error ? (
            <p
              role="alert"
              data-testid={`platform-admins-revoke-error-${userId}`}
              className="text-body text-danger font-semibold"
            >
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p
              role="status"
              data-testid={`platform-admins-revoke-success-${userId}`}
              className="text-body text-success font-semibold"
            >
              Platform admin revoked. Close this dialog to return to the table.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {state.ok ? "Close" : "Cancel"}
            </Button>
            {!state.ok ? (
              <FormSubmitButton
                label="Revoke"
                pendingLabel={pending ? "Revoking…" : "Revoke"}
                data-testid={`platform-admins-revoke-submit-${userId}`}
              />
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
