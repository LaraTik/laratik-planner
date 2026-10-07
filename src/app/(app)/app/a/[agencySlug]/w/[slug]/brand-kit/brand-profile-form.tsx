"use client";

import * as React from "react";
import { useActionState } from "react";
import { Save } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { saveBrandProfileAction } from "./profile-actions";
import type { BrandProfile } from "@/lib/brand/profile";

const EMPTY: { error?: string; success?: boolean; revision?: number } = {};
const csvValue = (items: string[]) => items.join(", ");

export function BrandProfileForm({
  slug,
  initial,
}: {
  slug: string;
  initial: BrandProfile | null;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [state, action] = useActionState(saveBrandProfileAction.bind(null, slug), EMPTY);
  const profile = initial ?? {
    businessName: "",
    industry: "",
    location: "",
    audience: "",
    goals: [],
    offers: [],
    competitors: [],
    primaryLanguage: "en" as const,
    secondaryLanguage: null,
    tone: [],
    strengths: [],
    constraints: [],
    productionCapacity: "",
    paidOrganicMix: "",
    monthlyPriority: "",
  };
  return (
    <form action={action} className="space-y-5" data-testid="brand-profile-form">
      {state.error ? (
        <p className="bg-danger-subtle text-danger rounded p-3" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="bg-success-subtle text-success rounded p-3" role="status">
          {t("brandKit.profile.saved")}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("brandKit.profile.identityTitle")}</CardTitle>
          <CardDescription>{t("brandKit.profile.identityDescription")}</CardDescription>
        </CardHeader>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <FormField id="brand-profile-business" label={t("brandKit.profile.businessName")}>
            <DirAwareInput
              name="businessName"
              defaultValue={profile.businessName}
              locale={locale}
            />
          </FormField>
          <FormField id="brand-profile-industry" label={t("brandKit.profile.industry")}>
            <DirAwareInput name="industry" defaultValue={profile.industry} locale={locale} />
          </FormField>
          <FormField id="brand-profile-location" label={t("brandKit.profile.location")}>
            <DirAwareInput name="location" defaultValue={profile.location} locale={locale} />
          </FormField>
          <FormField
            id="brand-profile-primary-language"
            label={t("brandKit.profile.primaryLanguage")}
          >
            <select
              name="primaryLanguage"
              defaultValue={profile.primaryLanguage}
              className="border-border bg-surface text-body focus-visible:ring-focus-ring h-11 cursor-pointer rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="en">{t("common.english")}</option>
              <option value="ar">{t("common.arabic")}</option>
            </select>
          </FormField>
          <FormField
            id="brand-profile-secondary-language"
            label={t("brandKit.profile.secondaryLanguage")}
          >
            <select
              name="secondaryLanguage"
              defaultValue={profile.secondaryLanguage ?? ""}
              className="border-border bg-surface text-body focus-visible:ring-focus-ring h-11 cursor-pointer rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="">{t("brandKit.profile.none")}</option>
              <option value="en">{t("common.english")}</option>
              <option value="ar">{t("common.arabic")}</option>
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <label htmlFor="brand-profile-audience" className="text-body font-semibold">
              {t("brandKit.profile.audience")}
            </label>
            <DirAwareTextarea
              id="brand-profile-audience"
              name="audience"
              defaultValue={profile.audience}
              locale={locale}
              rows={3}
            />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("brandKit.profile.strategyTitle")}</CardTitle>
          <CardDescription>{t("brandKit.profile.listHint")}</CardDescription>
        </CardHeader>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {(["goals", "offers", "competitors", "tone", "strengths", "constraints"] as const).map(
            (key) => (
              <div key={key}>
                <label htmlFor={`brand-profile-${key}`} className="text-body font-semibold">
                  {t(`brandKit.profile.${key}`)}
                </label>
                <DirAwareInput
                  id={`brand-profile-${key}`}
                  name={key}
                  defaultValue={csvValue(profile[key])}
                  locale={locale}
                />
              </div>
            ),
          )}
          <div className="sm:col-span-2">
            <label htmlFor="brand-profile-monthly-priority" className="text-body font-semibold">
              {t("brandKit.profile.monthlyPriority")}
            </label>
            <DirAwareTextarea
              id="brand-profile-monthly-priority"
              name="monthlyPriority"
              defaultValue={profile.monthlyPriority}
              locale={locale}
              rows={3}
            />
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("brandKit.profile.operationsTitle")}</CardTitle>
          <CardDescription>{t("brandKit.profile.operationsDescription")}</CardDescription>
        </CardHeader>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label htmlFor="brand-profile-production" className="text-body font-semibold">
              {t("brandKit.profile.productionCapacity")}
            </label>
            <DirAwareTextarea
              id="brand-profile-production"
              name="productionCapacity"
              defaultValue={profile.productionCapacity}
              locale={locale}
              rows={3}
            />
          </div>
          <div>
            <label htmlFor="brand-profile-paid" className="text-body font-semibold">
              {t("brandKit.profile.paidOrganicMix")}
            </label>
            <DirAwareTextarea
              id="brand-profile-paid"
              name="paidOrganicMix"
              defaultValue={profile.paidOrganicMix}
              locale={locale}
              rows={3}
            />
          </div>
        </div>
      </Card>
      <div className="flex justify-end">
        <FormSubmitButton
          label={
            <>
              <Save className="h-4 w-4" aria-hidden="true" />
              {t("brandKit.profile.save")}
            </>
          }
          pendingLabel={t("brandKit.profile.saving")}
        />
      </div>
    </form>
  );
}
