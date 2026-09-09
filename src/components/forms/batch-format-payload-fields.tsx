"use client";

import * as React from "react";
import {
  fieldsFor,
  ratioOptionsFor,
  splitByGroup,
  type FieldDef,
} from "./format-payload-field-set";
import {
  isObjectiveAudienceKey,
  rendererFor,
  type FieldRendererProps,
} from "./format-payload-field-renderers";
import { AdvancedDisclosure } from "./advanced-disclosure";
import type { ContentFormat } from "@/lib/format-payload/schemas";
import type { LocaleCode } from "@/lib/i18n/locales";

export function BatchFormatPayloadFields({
  format,
  value,
  locale,
  t,
  onChange,
}: {
  format: ContentFormat;
  value: Record<string, unknown>;
  locale: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  onChange: (value: Record<string, unknown>) => void;
}) {
  const fields = React.useMemo(() => fieldsFor(format), [format]);
  const { essential, advanced } = React.useMemo(() => splitByGroup(fields), [fields]);
  const translations =
    (value.translations as Record<string, Record<string, unknown>> | undefined) ?? {};

  const setField = (key: string, nextValue: unknown) => {
    onChange({ ...value, [key]: nextValue });
  };
  const setTranslation = (key: string, code: LocaleCode, nextValue: string) => {
    const current =
      (value.translations as Record<string, Record<string, unknown>> | undefined) ?? {};
    onChange({
      ...value,
      translations: {
        ...current,
        [code]: { ...(current[code] ?? {}), [key]: nextValue },
      },
    });
  };
  const renderField = (field: FieldDef) => {
    const renderer = rendererFor(field.key);
    return renderer({
      fieldKey: field.key,
      label: t(field.labelKey),
      payload: value,
      translations,
      locale,
      editable: true,
      aiEnabled: false,
      contentItemId: "batch-row",
      ...(field.key === "ratio" ? { enumValues: ratioOptionsFor(format) } : {}),
      ...(field.key === "durationSeconds" && format === "long_form_video"
        ? { numberMin: 30, numberMax: 3600 }
        : {}),
      t,
      onField: setField,
      onTranslation: setTranslation,
    } as FieldRendererProps);
  };
  const hasObjectiveAudience = fields.some((field) => isObjectiveAudienceKey(field.key));
  const renderObjectiveAudience = () =>
    rendererFor("objective")({
      fieldKey: "objective",
      label: t("formatEditor.editor.goalAudience"),
      payload: value,
      translations,
      locale,
      editable: true,
      aiEnabled: false,
      contentItemId: "batch-row",
      t,
      onField: setField,
      onTranslation: setTranslation,
    } as FieldRendererProps);

  const essentialFields = essential.filter((field) => !isObjectiveAudienceKey(field.key));
  const advancedFields = advanced.filter((field) => !isObjectiveAudienceKey(field.key));

  return (
    <div className="space-y-5" data-testid="batch-format-payload-fields">
      <div className="bg-surface-subtle text-label text-fg-secondary rounded-[var(--radius-control)] p-3">
        {t("batchAdd.form.detailsGuidance")}
      </div>
      <div className="space-y-5" data-testid="batch-essential-fields">
        {hasObjectiveAudience ? renderObjectiveAudience() : null}
        {essentialFields.map((field) => (
          <div key={field.key}>{renderField(field)}</div>
        ))}
      </div>
      {advancedFields.length ? (
        <AdvancedDisclosure
          fields={advancedFields}
          format={format}
          payload={value}
          renderField={renderField}
          label={t("batchAdd.form.advancedDetails")}
        />
      ) : null}
    </div>
  );
}
