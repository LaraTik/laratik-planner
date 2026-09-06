"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { saveManagedR2Action, testManagedR2Action, type StorageConfigActionState } from "./actions";

type StorageConfigCopy = {
  platformTitle: string;
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  storageClass: string;
  standard: string;
  save: string;
  test: string;
  testing: string;
  saving: string;
  secretsNote: string;
  endpointHint: string;
  credentialHint: string;
  rotateHint: string;
  testHint: string;
  feedback: {
    authRequired: string;
    testFailed: string;
    invalidConfiguration: string;
    saveFailed: string;
    testSuccess: string;
    savedVerified: string;
  };
};

function feedbackMessage(copy: StorageConfigCopy, key: string | undefined): string | undefined {
  if (!key) return undefined;
  const code = key.replace("storage.", "") as keyof StorageConfigCopy["feedback"];
  return copy.feedback[code];
}

export function StorageConfigForm({
  initial,
  copy,
}: {
  initial?:
    | {
        accountId: string;
        endpoint: string;
        bucket: string;
        accessKeyLastFour: string;
        secretAccessKeyLastFour: string;
        status?: string;
      }
    | undefined;
  copy: StorageConfigCopy;
}) {
  const [testState, testAction, testPending] = useActionState<StorageConfigActionState, FormData>(
    testManagedR2Action,
    {},
  );
  const [saveState, saveAction, savePending] = useActionState<StorageConfigActionState, FormData>(
    saveManagedR2Action,
    {},
  );
  return (
    <Card padding="lg">
      <CardTitle>{copy.platformTitle}</CardTitle>
      <CardDescription className="mt-1 max-w-2xl">{copy.secretsNote}</CardDescription>
      <form action={saveAction} className="mt-6 grid gap-4 md:grid-cols-2">
        <FormField id="storage-account-id" label={copy.accountId} required>
          <Input name="accountId" defaultValue={initial?.accountId} required />
        </FormField>
        <FormField id="storage-endpoint" label={copy.endpoint} hint={copy.endpointHint} required>
          <Input name="endpoint" type="url" defaultValue={initial?.endpoint} required />
        </FormField>
        <FormField id="storage-bucket" label={copy.bucket} required>
          <Input name="bucket" defaultValue={initial?.bucket} required />
        </FormField>
        <FormField id="storage-storage-class" label={copy.storageClass}>
          <Input name="storageClass" value={copy.standard} readOnly />
        </FormField>
        <FormField
          id="storage-access-key"
          label={copy.accessKeyId}
          hint={initial?.accessKeyLastFour ? copy.rotateHint : copy.credentialHint}
          required
        >
          <Input
            name="accessKeyId"
            autoComplete="off"
            placeholder={
              initial?.accessKeyLastFour ? `••••${initial.accessKeyLastFour}` : undefined
            }
            required
          />
        </FormField>
        <FormField
          id="storage-secret-key"
          label={copy.secretAccessKey}
          hint={initial?.secretAccessKeyLastFour ? copy.rotateHint : copy.credentialHint}
          required
        >
          <Input
            name="secretAccessKey"
            type="password"
            autoComplete="new-password"
            placeholder={
              initial?.secretAccessKeyLastFour
                ? `••••${initial.secretAccessKeyLastFour}`
                : undefined
            }
            required
          />
        </FormField>
        <div className="border-border mt-2 space-y-3 border-t pt-4 md:col-span-2">
          <p className="text-label text-fg-muted">{copy.testHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" disabled={savePending} aria-busy={savePending}>
              {savePending ? copy.saving : copy.save}
            </Button>
            <Button
              type="submit"
              formAction={testAction}
              variant="outline"
              disabled={testPending}
              aria-busy={testPending}
            >
              {testPending ? copy.testing : copy.test}
            </Button>
          </div>
        </div>
        {testState.errorKey || saveState.errorKey ? (
          <div
            className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm md:col-span-2"
            role="alert"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{feedbackMessage(copy, testState.errorKey ?? saveState.errorKey)}</span>
          </div>
        ) : null}
        {testState.successKey || saveState.successKey ? (
          <div
            className="border-success/20 bg-success-subtle text-success flex items-start gap-2 rounded-[var(--radius-control)] border p-3 text-sm md:col-span-2"
            role="status"
            aria-live="polite"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{feedbackMessage(copy, testState.successKey ?? saveState.successKey)}</span>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
