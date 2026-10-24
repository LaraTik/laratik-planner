"use client";

import { useActionState } from "react";
import { EditAgencyForm } from "@/components/forms/edit-agency-form";
import { editAgencyAction, type EditAgencyActionState } from "./actions";

const initial: EditAgencyActionState = {};

export function AgencySettingsEditForm({
  initialName,
  initialSlug,
  initialLocale,
  initialTimezone,
}: {
  initialName: string;
  initialSlug: string;
  initialLocale: string;
  initialTimezone: string;
}) {
  const [state, formAction] = useActionState(editAgencyAction, initial);

  return (
    <EditAgencyForm
      initialName={initialName}
      initialSlug={initialSlug}
      initialLocale={initialLocale}
      initialTimezone={initialTimezone}
      formAction={formAction}
      actionState={state}
    />
  );
}
