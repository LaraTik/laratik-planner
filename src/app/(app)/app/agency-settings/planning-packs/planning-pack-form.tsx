"use client";

import * as React from "react";
import { useActionState } from "react";
import { Save } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { savePlanningPackAction, type PlanningPackActionState } from "./actions";

type Pack = {
  id: string;
  name: string;
  sourceMarkdown: string;
  manifest: unknown;
  revision: number;
  status: string;
};

export function PlanningPackForm({ initial }: { initial?: Pack }) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [state, action] = useActionState<PlanningPackActionState, FormData>(
    savePlanningPackAction,
    {},
  );
  return (
    <form action={action} className="space-y-4" data-testid="planning-pack-form">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state.error ? (
        <p className="text-body text-danger rounded bg-red-50 p-3" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="text-body text-success rounded bg-green-50 p-3" role="status">
          {t("planningPacks.saved")}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>
            {initial ? t("planningPacks.editTitle") : t("planningPacks.newTitle")}
          </CardTitle>
          <CardDescription>{t("planningPacks.formDescription")}</CardDescription>
        </CardHeader>
        <div className="space-y-4 p-5">
          <FormField id="planning-pack-name" label={t("planningPacks.name")}>
            <DirAwareInput name="name" defaultValue={initial?.name ?? ""} locale={locale} />
          </FormField>
          <FormField
            id="planning-pack-source"
            label={t("planningPacks.sourceMarkdown")}
            hint={t("planningPacks.sourceHint")}
          >
            <DirAwareTextarea
              name="sourceMarkdown"
              defaultValue={initial?.sourceMarkdown ?? ""}
              locale={locale}
              rows={12}
            />
          </FormField>
          <FormField
            id="planning-pack-manifest"
            label={t("planningPacks.manifest")}
            hint={t("planningPacks.manifestHint")}
          >
            <textarea
              name="manifest"
              defaultValue={JSON.stringify(initial?.manifest ?? {}, null, 2)}
              rows={16}
              className="border-border bg-surface text-body focus-visible:ring-focus-ring w-full rounded-[var(--radius-control)] border p-3 font-mono focus:outline-none focus-visible:ring-2"
              spellCheck={false}
            />
          </FormField>
          <div className="flex justify-end">
            <FormSubmitButton
              label={
                <>
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {t("planningPacks.save")}
                </>
              }
              pendingLabel={t("planningPacks.saving")}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
