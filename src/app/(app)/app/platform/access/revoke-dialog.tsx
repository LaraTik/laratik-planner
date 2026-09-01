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
import { useLocaleT } from "@/components/i18n/locale-provider";

const initial: PlatformAccessActionState = {};

type Translator = (key: string, params?: Record<string, string | number>) => string;

function roleLabel(role: PlatformRole, t: Translator): string {
  return t(`platform.roleLabels.${role}.label`) || PLATFORM_ROLE_DETAILS[role].label;
}

export function RevokePlatformAccessDialog({
  userId,
  email,
  role,
  t: tProp,
}: {
  userId: string;
  email: string;
  role: PlatformRole;
  t?: Translator;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
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
          aria-label={t("platform.revokeAria", { email })}
          title={t("platform.revokeTitle", { email })}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platform.revokeHeading")}</DialogTitle>
          <DialogDescription>
            {t("platform.revokeDescription", { email, role: roleLabel(role, t) })}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-1.5">
            <Label htmlFor={`platform-revoke-reason-${userId}`}>
              {t("platform.revokeReasonLabel")}
            </Label>
            <Input
              id={`platform-revoke-reason-${userId}`}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder={t("platform.revokeReasonPlaceholder")}
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-body text-danger">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p role="status" className="text-body text-success">
              {t("platform.revokeSuccess")}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {state.ok ? t("platform.commonClose") : t("platform.commonCancel")}
            </Button>
            {!state.ok ? (
              <FormSubmitButton
                label={t("platform.revokeSubmit")}
                pendingLabel={t("platform.revokeSubmitPending")}
                variant="destructive"
              />
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
