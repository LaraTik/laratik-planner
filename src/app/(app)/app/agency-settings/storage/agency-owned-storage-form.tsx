"use client";

import { useActionState } from "react";
import { CheckCircle2, CircleAlert, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import {
  saveAgencyOwnedR2Action,
  testAgencyOwnedR2Action,
  switchAgencyToManagedStorageAction,
  type AgencyStorageActionState,
} from "./actions";

type AgencyStorageCopy = {
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  ownedTitle: string;
  ownedDescription: string;
  ownedInstructions: string;
  ownedEndpointHint: string;
  ownedCredentialHint: string;
  ownedTestHint: string;
  ownedSave: string;
  ownedTest: string;
  ownedTesting: string;
  ownedSaving: string;
  ownedMode: string;
  managedMode: string;
  currentMode: string;
  configured: string;
  switchToManaged: string;
  switching: string;
  backendChangeLocked: string;
  feedback: {
    invalidConfiguration: string;
    testFailed: string;
    saveFailed: string;
    ownedTestSuccess: string;
    ownedSavedVerified: string;
    managedSwitched: string;
    backendMigrationRequired: string;
    authRequired: string;
    permissionDenied: string;
  };
};

type InitialAgencyStorage = {
  mode: "managed" | "agency_owned";
  accountId: string | null;
  endpoint: string | null;
  bucket: string | null;
  accessKeyLastFour: string | null;
  secretAccessKeyLastFour: string | null;
};

function feedbackMessage(copy: AgencyStorageCopy, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const code = key.replace("storage.", "") as keyof AgencyStorageCopy["feedback"];
  return copy.feedback[code];
}

function Feedback({ copy, state }: { copy: AgencyStorageCopy; state: AgencyStorageActionState }) {
  const error = feedbackMessage(copy, state.errorKey);
  const success = feedbackMessage(copy, state.successKey);
  if (!error && !success) return null;
  return (
    <div
      className={`flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm ${error ? "border-danger/20 bg-danger-subtle text-danger" : "border-success/20 bg-success-subtle text-success"}`}
      role={error ? "alert" : "status"}
      aria-live={error ? undefined : "polite"}
    >
      {error ? (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{error ?? success}</span>
    </div>
  );
}

export function AgencyOwnedStorageForm({
  initial,
  copy,
  backendChangeLocked,
}: {
  initial: InitialAgencyStorage;
  copy: AgencyStorageCopy;
  backendChangeLocked: boolean;
}) {
  const [testState, testAction, testPending] = useActionState<AgencyStorageActionState, FormData>(
    testAgencyOwnedR2Action,
    {},
  );
  const [saveState, saveAction, savePending] = useActionState<AgencyStorageActionState, FormData>(
    saveAgencyOwnedR2Action,
    {},
  );
  const [managedState, managedAction, managedPending] = useActionState<
    AgencyStorageActionState,
    FormData
  >(async () => switchAgencyToManagedStorageAction(), {});
  const switchingFromManagedBlocked = initial.mode === "managed" && backendChangeLocked;

  return (
    <Card padding="lg" data-testid="agency-owned-storage-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-primary-subtle text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <CardTitle>{copy.ownedTitle}</CardTitle>
            <CardDescription>{copy.ownedDescription}</CardDescription>
          </div>
        </div>
        <div className="bg-surface-subtle text-label text-fg-secondary rounded-[var(--radius-control)] px-3 py-2">
          <span className="text-fg-muted">{copy.currentMode}: </span>
          <span className="font-semibold">
            {initial.mode === "agency_owned" ? copy.ownedMode : copy.managedMode}
          </span>
        </div>
      </div>

      <div className="border-border bg-surface-subtle mt-5 rounded-[var(--radius-control)] border p-4">
        <p className="text-body text-fg-secondary">{copy.ownedInstructions}</p>
        {initial.mode === "agency_owned" && initial.accessKeyLastFour ? (
          <p className="text-label text-fg-muted mt-3">
            {copy.configured}: <span dir="ltr">••••{initial.accessKeyLastFour}</span>
          </p>
        ) : null}
      </div>

      {switchingFromManagedBlocked ? (
        <p className="border-warning/20 bg-warning-subtle text-label text-fg-secondary mt-4 rounded-[var(--radius-control)] border p-3">
          {copy.backendChangeLocked}
        </p>
      ) : null}

      <form action={saveAction} className="mt-5 grid gap-4 md:grid-cols-2">
        <FormField id="agency-storage-account-id" label={copy.accountId} required>
          <Input name="accountId" defaultValue={initial.accountId ?? undefined} required />
        </FormField>
        <FormField
          id="agency-storage-endpoint"
          label={copy.endpoint}
          hint={copy.ownedEndpointHint}
          required
        >
          <Input name="endpoint" type="url" defaultValue={initial.endpoint ?? undefined} required />
        </FormField>
        <FormField id="agency-storage-bucket" label={copy.bucket} required>
          <Input name="bucket" defaultValue={initial.bucket ?? undefined} required />
        </FormField>
        <div className="hidden md:block" aria-hidden="true" />
        <FormField id="agency-storage-access-key" label={copy.accessKeyId} required>
          <Input
            name="accessKeyId"
            autoComplete="off"
            placeholder={initial.accessKeyLastFour ? `••••${initial.accessKeyLastFour}` : undefined}
            required
          />
        </FormField>
        <FormField
          id="agency-storage-secret-key"
          label={copy.secretAccessKey}
          hint={copy.ownedCredentialHint}
          required
        >
          <Input
            name="secretAccessKey"
            type="password"
            autoComplete="new-password"
            placeholder={
              initial.secretAccessKeyLastFour ? `••••${initial.secretAccessKeyLastFour}` : undefined
            }
            required
          />
        </FormField>
        <div className="border-border mt-2 space-y-3 border-t pt-4 md:col-span-2">
          <p className="text-label text-fg-muted">{copy.ownedTestHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="submit"
              disabled={savePending || switchingFromManagedBlocked}
              aria-busy={savePending}
            >
              {savePending ? copy.ownedSaving : copy.ownedSave}
            </Button>
            <Button
              type="submit"
              formAction={testAction}
              variant="outline"
              disabled={testPending || switchingFromManagedBlocked}
              aria-busy={testPending}
            >
              {testPending ? copy.ownedTesting : copy.ownedTest}
            </Button>
          </div>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Feedback copy={copy} state={testState} />
          <Feedback copy={copy} state={saveState} />
        </div>
      </form>

      {initial.mode === "agency_owned" ? (
        <form action={managedAction} className="border-border mt-6 border-t pt-5">
          <Button type="submit" variant="ghost" disabled={managedPending || backendChangeLocked}>
            {managedPending ? copy.switching : copy.switchToManaged}
          </Button>
          <Feedback copy={copy} state={managedState} />
        </form>
      ) : null}
    </Card>
  );
}
