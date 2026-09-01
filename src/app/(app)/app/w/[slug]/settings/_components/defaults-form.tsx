"use client";
import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateDefaultsSettingsAction, type SettingsActionState } from "../actions";

type PersonOption = { id: string; label: string };

/**
 * DefaultsForm — per-section form for the Settings → Default
 * assignments page (Phase A + D).
 *
 * Phase D adds two empty-state affordances:
 *  - If a role has 0 people on the workspace, the dropdown
 *    renders a non-actionable "No designers yet" message and a
 *    link to Team settings so the manager can add someone
 *    with the matching role.
 *  - If a role has people available, the dropdown's hint
 *    surfaces the count so the manager knows how many
 *    candidates they have to pick from.
 */
export function DefaultsForm({
  slug,
  designers,
  contentReviewers,
  internalCreativeReviewers,
  clientReviewers,
  values,
  t,
}: {
  slug: string;
  designers: PersonOption[];
  contentReviewers: PersonOption[];
  internalCreativeReviewers: PersonOption[];
  clientReviewers: PersonOption[];
  values: {
    defaultDesignerId: string | null;
    defaultContentReviewerId: string | null;
    defaultInternalCreativeReviewerId: string | null;
    defaultClientReviewerId: string | null;
  };
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const action = updateDefaultsSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});

  return (
    <Card padding="md" data-testid="defaults-form-card">
      <form action={formAction} className="space-y-6">
        <p className="text-body text-fg-secondary max-w-3xl">{t("settings.defaults.formBlurb")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonField
            slug={slug}
            id="settings-default-designer"
            name="defaultDesignerId"
            label={t("settings.defaults.designerLabel")}
            help={t("settings.defaults.designerHint")}
            value={values.defaultDesignerId}
            options={designers}
            roleSlug="designer"
            t={t}
          />
          <PersonField
            slug={slug}
            id="settings-default-content-reviewer"
            name="defaultContentReviewerId"
            label={t("settings.defaults.contentReviewerLabel")}
            help={t("settings.defaults.contentReviewerHint")}
            value={values.defaultContentReviewerId}
            options={contentReviewers}
            roleSlug="content_reviewer"
            t={t}
          />
          <PersonField
            slug={slug}
            id="settings-default-internal-creative"
            name="defaultInternalCreativeReviewerId"
            label={t("settings.defaults.internalCreativeLabel")}
            help={t("settings.defaults.internalCreativeHint")}
            value={values.defaultInternalCreativeReviewerId}
            options={internalCreativeReviewers}
            roleSlug="creative_director"
            t={t}
          />
          <PersonField
            slug={slug}
            id="settings-default-client-reviewer"
            name="defaultClientReviewerId"
            label={t("settings.defaults.clientReviewerLabel")}
            help={t("settings.defaults.clientReviewerHint")}
            value={values.defaultClientReviewerId}
            options={clientReviewers}
            roleSlug="client_reviewer"
            t={t}
          />
        </div>
        {state.error ? (
          <p
            role="alert"
            data-testid="defaults-form-error"
            className="text-body text-danger font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            data-testid="defaults-form-saved"
            className="text-body text-success font-semibold"
          >
            {t("settings.defaults.saved")}
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton
            label={t("settings.defaults.submit")}
            pendingLabel={t("common.saving")}
          />
        </div>
      </form>
    </Card>
  );
}

function PersonField({
  slug,
  id,
  name,
  label,
  help,
  value,
  options,
  roleSlug,
  t,
}: {
  slug: string;
  id: string;
  name: string;
  label: string;
  help: string;
  value: string | null;
  options: PersonOption[];
  roleSlug: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const empty = options.length === 0;
  const count = options.length;
  const countLabel =
    count === 0
      ? t("settings.defaults.emptyCount")
      : count === 1
        ? t("settings.defaults.oneCount")
        : t("settings.defaults.manyCount", { count });
  return (
    <div className="space-y-1.5">
      <FormField id={id} label={label} hint={help}>
        <select
          id={id}
          name={name}
          defaultValue={value ?? ""}
          disabled={empty}
          className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {empty ? (
            <option value="">{t("settings.defaults.emptyOption")}</option>
          ) : (
            <>
              <option value="">{t("settings.defaults.noDefault")}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </>
          )}
        </select>
      </FormField>
      {empty ? (
        <p
          className="text-label text-fg-muted inline-flex items-center gap-1"
          data-testid={`defaults-empty-${roleSlug}`}
        >
          <AlertCircle className="text-warning h-3 w-3" aria-hidden="true" />
          {t("settings.defaults.emptyHint", { role: label.toLowerCase() })}{" "}
          <Link
            href={`/app/w/${slug}/team?role=${roleSlug}`}
            className="text-primary font-semibold hover:underline"
          >
            {t("settings.defaults.addOneLink")}
          </Link>
        </p>
      ) : (
        <p className="text-label text-fg-muted" data-testid={`defaults-count-${roleSlug}`}>
          {countLabel}.{" "}
          {value ? t("settings.defaults.currentDefault") : t("settings.defaults.noDefaultYet")}
        </p>
      )}
    </div>
  );
}
