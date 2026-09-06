"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
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
      <CardDescription className="mt-1">{copy.secretsNote}</CardDescription>
      <form action={saveAction} className="mt-6 grid gap-4 md:grid-cols-2">
        <FormField id="storage-account-id" label={copy.accountId} required>
          <Input name="accountId" defaultValue={initial?.accountId} required />
        </FormField>
        <FormField id="storage-endpoint" label={copy.endpoint} required>
          <Input name="endpoint" type="url" defaultValue={initial?.endpoint} required />
        </FormField>
        <FormField id="storage-bucket" label={copy.bucket} required>
          <Input name="bucket" defaultValue={initial?.bucket} required />
        </FormField>
        <FormField id="storage-storage-class" label={copy.storageClass}>
          <Input name="storageClass" value={copy.standard} readOnly />
        </FormField>
        <FormField id="storage-access-key" label={copy.accessKeyId} required>
          <Input
            name="accessKeyId"
            autoComplete="off"
            placeholder={
              initial?.accessKeyLastFour ? `••••${initial.accessKeyLastFour}` : undefined
            }
            required
          />
        </FormField>
        <FormField id="storage-secret-key" label={copy.secretAccessKey} required>
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
        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <Button type="submit" disabled={savePending}>
            {savePending ? copy.saving : copy.save}
          </Button>
          <Button type="submit" formAction={testAction} variant="outline" disabled={testPending}>
            {testPending ? copy.testing : copy.test}
          </Button>
        </div>
        {testState.errorKey || saveState.errorKey ? (
          <p className="text-danger text-label md:col-span-2" role="alert">
            {feedbackMessage(copy, testState.errorKey ?? saveState.errorKey)}
          </p>
        ) : null}
        {testState.successKey || saveState.successKey ? (
          <p className="text-success text-label md:col-span-2" role="status">
            {feedbackMessage(copy, testState.successKey ?? saveState.successKey)}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
