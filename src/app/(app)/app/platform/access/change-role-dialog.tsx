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

type Translator = (key: string, params?: Record<string, string | number>) => string;

function roleLabel(role: (typeof PLATFORM_ROLE_VALUES)[number], t: Translator): string {
  return t(`platform.roleLabels.${role}.label`) || PLATFORM_ROLE_DETAILS[role].label;
}

export function ChangePlatformRoleDialog({
  userId,
  email,
  currentRole,
  t,
}: {
  userId: string;
  email: string;
  currentRole: PlatformRole;
  t: Translator;
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
          aria-label={t("platform.changeRoleAria", { email })}
          title={t("platform.changeRoleTitle", { email })}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platform.changeRoleHeading")}</DialogTitle>
          <DialogDescription>{t("platform.changeRoleDescription", { email })}</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`platform-role-${userId}`}>
              {t("platform.changeRoleNewRoleLabel")}
            </Label>
            <select
              id={`platform-role-${userId}`}
              name="role"
              required
              defaultValue={currentRole}
              className="border-border bg-surface focus-visible:ring-focus-ring min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus:outline-none focus-visible:ring-2"
            >
              {PLATFORM_ROLE_VALUES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role, t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`platform-role-reason-${userId}`}>
              {t("platform.changeRoleReasonLabel")}
            </Label>
            <Input
              id={`platform-role-reason-${userId}`}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder={t("platform.changeRoleReasonPlaceholder")}
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-body text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p role="status" className="text-body text-success">
              {t("platform.changeRoleSuccess")}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {state.ok ? t("platform.commonClose") : t("platform.commonCancel")}
            </Button>
            {!state.ok ? (
              <FormSubmitButton
                label={t("platform.changeRoleSubmit")}
                pendingLabel={t("platform.changeRoleSubmitPending")}
              />
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
