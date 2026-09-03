"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
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
import { useLocaleT } from "@/components/i18n/locale-provider";
import { createAgencyAction, type PlatformActionState } from "./actions";

type PlanOption = { id: string; name: string; description: string | null };
const platforms = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "pinterest",
  "x",
  "threads",
  "snapchat",
  "other",
] as const;

const initialState: PlatformActionState = {};

export function AddAgencyDrawer({ plans }: { plans: PlanOption[] }) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState(1);
  const [state, action, pending] = useActionState(createAgencyAction, initialState);
  const [values, setValues] = React.useState<Record<string, string>>({
    locale: "en",
    timezone: "UTC",
    planTemplateId: plans[0]?.id ?? "",
  });

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));
  const overrideNumbers = (keys: readonly string[]) =>
    Object.fromEntries(
      keys.filter((key) => values[key]?.trim()).map((key) => [key, Number(values[key])]),
    );
  const numericOverrides = overrideNumbers(["workspaces", "users", "total_social_profiles"]);
  const platformOverrides = overrideNumbers(platforms);
  const overrides = {
    ...numericOverrides,
    ...(Object.keys(platformOverrides).length > 0
      ? { social_profiles_by_platform: platformOverrides }
      : {}),
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" onClick={() => setOpen(true)} data-testid="platform-agencies-add">
          <Plus className="h-4 w-4" aria-hidden="true" /> {t("platform.addAgency.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="start-auto end-0 top-0 flex h-dvh w-full max-w-2xl translate-x-0 translate-y-0 flex-col rounded-none p-0 sm:w-[640px]">
        <DialogHeader className="border-border border-b px-6 py-5 pe-14">
          <DialogTitle>{t("platform.addAgency.title")}</DialogTitle>
          <DialogDescription>{t("platform.addAgency.stepDescription", { step })}</DialogDescription>
        </DialogHeader>
        {/* Stepper — visual progress indicator. Each step is a
            button so the user can jump back without losing the
            fields they already filled. The current step is
            aria-current and visually distinct. */}
        <nav
          aria-label={t("platform.addAgency.stepsAria")}
          className="border-border bg-surface-subtle flex items-center gap-1 border-b px-6 py-3"
          data-testid="add-agency-stepper"
        >
          {[
            { num: 1, label: t("platform.addAgency.steps.organization") },
            { num: 2, label: t("platform.addAgency.steps.administrator") },
            { num: 3, label: t("platform.addAgency.steps.plan") },
            { num: 4, label: t("platform.addAgency.steps.review") },
          ].map((s) => {
            const isCurrent = step === s.num;
            const isComplete = step > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => {
                  // Forward navigation is gated by the
                  // required-field check in onContinue; backward
                  // navigation is always allowed.
                  if (s.num < step) setStep(s.num);
                }}
                aria-current={isCurrent ? "step" : undefined}
                aria-label={t("platform.addAgency.goToStep", { step: s.num, label: s.label })}
                className={`text-label rounded-[var(--radius-control)] px-2.5 py-1 font-semibold transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                      ? "text-primary hover:bg-surface"
                      : "text-fg-muted"
                }`}
                data-testid={`add-agency-step-${s.num}`}
              >
                <span aria-hidden="true">{s.num}.</span> {s.label}
              </button>
            );
          })}
        </nav>
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          {(
            [
              "name",
              "slug",
              "locale",
              "timezone",
              "adminName",
              "adminEmail",
              "planTemplateId",
              "reason",
            ] as const
          ).map((key) => (
            <input
              key={key}
              type="hidden"
              name={key}
              value={values[key] ?? (key === "reason" ? t("platform.addAgency.defaultReason") : "")}
            />
          ))}
          <input type="hidden" name="overrides" value={JSON.stringify(overrides)} />
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 1 ? (
              <section
                className="grid gap-4"
                aria-label={t("platform.addAgency.sections.organizationDetails")}
              >
                <Field
                  label={t("platform.addAgency.fields.agencyName")}
                  name="name"
                  value={values.name ?? ""}
                  onChange={set("name")}
                  required
                />
                <Field
                  label={t("platform.addAgency.fields.slug")}
                  name="slug"
                  value={values.slug ?? ""}
                  onChange={set("slug")}
                  required
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t("platform.addAgency.fields.locale")}
                    name="locale"
                    value={values.locale ?? "en"}
                    onChange={set("locale")}
                    required
                  />
                  <Field
                    label={t("platform.addAgency.fields.timezone")}
                    name="timezone"
                    value={values.timezone ?? "UTC"}
                    onChange={set("timezone")}
                    required
                  />
                </div>
              </section>
            ) : null}
            {step === 2 ? (
              <section
                className="grid gap-4"
                aria-label={t("platform.addAgency.sections.firstAdministrator")}
              >
                <Field
                  label={t("platform.addAgency.fields.administratorName")}
                  name="adminName"
                  value={values.adminName ?? ""}
                  onChange={set("adminName")}
                  required
                />
                <Field
                  label={t("platform.addAgency.fields.administratorEmail")}
                  name="adminEmail"
                  type="email"
                  value={values.adminEmail ?? ""}
                  onChange={set("adminEmail")}
                  required
                />
                <p className="text-body text-fg-secondary">
                  {t("platform.addAgency.invitationNote")}
                </p>
              </section>
            ) : null}
            {step === 3 ? (
              <section
                className="grid gap-5"
                aria-label={t("platform.addAgency.sections.planAndLimits")}
              >
                <div className="grid gap-2">
                  <Label htmlFor="planTemplateId">{t("platform.addAgency.fields.plan")}</Label>
                  <select
                    id="planTemplateId"
                    name="planTemplateId"
                    value={values.planTemplateId}
                    onChange={set("planTemplateId")}
                    className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2"
                  >
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field
                    label={t("platform.addAgency.fields.workspacesOverride")}
                    name="workspaces"
                    type="number"
                    value={values.workspaces ?? ""}
                    onChange={set("workspaces")}
                  />
                  <Field
                    label={t("platform.addAgency.fields.usersOverride")}
                    name="users"
                    type="number"
                    value={values.users ?? ""}
                    onChange={set("users")}
                  />
                  <Field
                    label={t("platform.addAgency.fields.totalProfiles")}
                    name="total_social_profiles"
                    type="number"
                    value={values.total_social_profiles ?? ""}
                    onChange={set("total_social_profiles")}
                  />
                </div>
                <fieldset className="border-border grid gap-3 rounded-[var(--radius-card)] border p-4 sm:grid-cols-2">
                  <legend className="text-label text-fg-secondary px-1 font-semibold">
                    {t("platform.addAgency.fields.profilesPerPlatform")}
                  </legend>
                  {platforms.map((platform) => (
                    <Field
                      key={platform}
                      label={platform.charAt(0).toUpperCase() + platform.slice(1)}
                      name={platform}
                      type="number"
                      value={values[platform] ?? ""}
                      onChange={set(platform)}
                    />
                  ))}
                </fieldset>
              </section>
            ) : null}
            {step === 4 ? (
              <section
                className="space-y-4"
                aria-label={t("platform.addAgency.sections.reviewAgency")}
              >
                <Review
                  label={t("platform.addAgency.steps.organization")}
                  value={`${values.name ?? "—"} (${values.slug ?? "—"})`}
                />
                <Review
                  label={t("platform.addAgency.steps.administrator")}
                  value={`${values.adminName ?? "—"} · ${values.adminEmail ?? "—"}`}
                />
                <Review
                  label={t("platform.addAgency.fields.plan")}
                  value={plans.find((plan) => plan.id === values.planTemplateId)?.name ?? "—"}
                />
                <Field
                  label={t("platform.addAgency.fields.auditReason")}
                  name="reason"
                  value={values.reason ?? t("platform.addAgency.defaultReason")}
                  onChange={set("reason")}
                  required
                />
                {state.error ? (
                  <p role="alert" className="text-danger text-body">
                    {state.error}
                  </p>
                ) : null}
                {state.warning ? (
                  <p role="status" className="text-warning text-body">
                    {state.warning}
                  </p>
                ) : null}
                {state.success ? (
                  <p role="status" className="text-success text-body">
                    {t("platform.addAgency.success")}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
          <DialogFooter className="border-border border-t px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={step === 1 || pending}
              onClick={() => setStep((value) => Math.max(1, value - 1))}
            >
              {t("platform.addAgency.back")}
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                onClick={() => setStep((value) => Math.min(4, value + 1))}
                disabled={
                  (step === 1 && (!values.name || !values.slug)) ||
                  (step === 2 && (!values.adminName || !values.adminEmail)) ||
                  (step === 3 && !values.planTemplateId)
                }
                data-testid="add-agency-continue"
              >
                {t("platform.addAgency.continue")}
              </Button>
            ) : (
              <Button type="submit" disabled={pending}>
                {pending ? t("platform.addAgency.creating") : t("platform.addAgency.create")}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <div className="grid gap-2">
      <Label htmlFor={inputProps.name}>{label}</Label>
      <Input
        id={inputProps.name}
        min={inputProps.type === "number" ? 0 : undefined}
        {...inputProps}
      />
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-[var(--radius-control)] border p-3">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-body text-fg-primary font-semibold">{value}</p>
    </div>
  );
}
