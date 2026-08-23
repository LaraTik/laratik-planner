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
      keys
        .filter((key) => values[key]?.trim())
        .map((key) => [key, Number(values[key])]),
    );
  const overrides = {
    ...overrideNumbers(["workspaces", "users", "total_social_profiles"]),
    social_profiles_by_platform: overrideNumbers(platforms),
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" onClick={() => setOpen(true)} data-testid="platform-agencies-add">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add agency
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto flex h-dvh w-full max-w-2xl translate-x-0 translate-y-0 flex-col rounded-none p-0 sm:w-[640px]">
        <DialogHeader className="border-border border-b px-6 py-5 pr-14">
          <DialogTitle>Add agency</DialogTitle>
          <DialogDescription>Step {step} of 4 · Organization, administrator, plan, review</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex min-h-0 flex-1 flex-col">
          {(["name", "slug", "locale", "timezone", "adminName", "adminEmail", "planTemplateId", "reason"] as const).map((key) => (
            <input key={key} type="hidden" name={key} value={values[key] ?? (key === "reason" ? "Initial agency provisioning" : "")} />
          ))}
          <input type="hidden" name="overrides" value={JSON.stringify(overrides)} />
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 1 ? (
              <section className="grid gap-4" aria-label="Organization details">
                <Field label="Agency name" name="name" value={values.name ?? ""} onChange={set("name")} required />
                <Field label="Slug" name="slug" value={values.slug ?? ""} onChange={set("slug")} required />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Locale" name="locale" value={values.locale ?? "en"} onChange={set("locale")} required />
                  <Field label="Timezone" name="timezone" value={values.timezone ?? "UTC"} onChange={set("timezone")} required />
                </div>
              </section>
            ) : null}
            {step === 2 ? (
              <section className="grid gap-4" aria-label="First administrator">
                <Field label="Administrator name" name="adminName" value={values.adminName ?? ""} onChange={set("adminName")} required />
                <Field label="Administrator email" name="adminEmail" type="email" value={values.adminEmail ?? ""} onChange={set("adminEmail")} required />
                <p className="text-body text-fg-secondary">An invitation is sent only after the agency transaction commits successfully.</p>
              </section>
            ) : null}
            {step === 3 ? (
              <section className="grid gap-5" aria-label="Plan and limits">
                <div className="grid gap-2">
                  <Label htmlFor="planTemplateId">Plan</Label>
                  <select id="planTemplateId" name="planTemplateId" value={values.planTemplateId} onChange={set("planTemplateId")} className="border-border bg-surface rounded-[var(--radius-control)] border px-3 py-2">
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Workspaces override" name="workspaces" type="number" value={values.workspaces ?? ""} onChange={set("workspaces")} />
                  <Field label="Users override" name="users" type="number" value={values.users ?? ""} onChange={set("users")} />
                  <Field label="Total profiles" name="total_social_profiles" type="number" value={values.total_social_profiles ?? ""} onChange={set("total_social_profiles")} />
                </div>
                <fieldset className="border-border grid gap-3 rounded-[var(--radius-card)] border p-4 sm:grid-cols-2">
                  <legend className="text-label text-fg-secondary px-1 font-semibold">Profiles per platform</legend>
                  {platforms.map((platform) => <Field key={platform} label={platform.charAt(0).toUpperCase() + platform.slice(1)} name={platform} type="number" value={values[platform] ?? ""} onChange={set(platform)} />)}
                </fieldset>
              </section>
            ) : null}
            {step === 4 ? (
              <section className="space-y-4" aria-label="Review agency">
                <Review label="Organization" value={`${values.name ?? "—"} (${values.slug ?? "—"})`} />
                <Review label="Administrator" value={`${values.adminName ?? "—"} · ${values.adminEmail ?? "—"}`} />
                <Review label="Plan" value={plans.find((plan) => plan.id === values.planTemplateId)?.name ?? "—"} />
                <Field label="Audit reason" name="reason" value={values.reason ?? "Initial agency provisioning"} onChange={set("reason")} required />
                {state.error ? <p role="alert" className="text-danger text-body">{state.error}</p> : null}
                {state.warning ? <p role="status" className="text-warning text-body">{state.warning}</p> : null}
                {state.success ? <p role="status" className="text-success text-body">Agency created successfully. Close this drawer to see it in the table.</p> : null}
              </section>
            ) : null}
          </div>
          <DialogFooter className="border-border border-t px-6 py-4">
            <Button type="button" variant="outline" disabled={step === 1 || pending} onClick={() => setStep((value) => Math.max(1, value - 1))}>Back</Button>
            {step < 4 ? <Button type="button" onClick={() => setStep((value) => Math.min(4, value + 1))}>Continue</Button> : <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create agency"}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string }) {
  const { label, ...inputProps } = props;
  return <div className="grid gap-2"><Label htmlFor={inputProps.name}>{label}</Label><Input id={inputProps.name} min={inputProps.type === "number" ? 0 : undefined} {...inputProps} /></div>;
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="border-border rounded-[var(--radius-control)] border p-3"><p className="text-label text-fg-muted">{label}</p><p className="text-body text-fg-primary font-semibold">{value}</p></div>;
}
