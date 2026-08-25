"use client";

import { useActionState } from "react";
import { EditAgencyForm } from "@/components/forms/edit-agency-form";
import { platformEditAgencyAction, type PlatformEditAgencyActionState } from "./actions";

const initial: PlatformEditAgencyActionState = {};

/**
 * Platform-scoped wrapper around the shared EditAgencyForm
 * (M3.4 — agency CRUD). The wrapper:
 *   - Calls the platform-specific server action, which
 *     enforces `requirePlatformAdmin` at the boundary
 *   - Carries the `agencyId` as a hidden field so the action
 *     does not need to read it from the URL
 *   - Prepends a "platform" prefix to the data-testids so the
 *     same component can be used in the agency-settings surface
 *     without collision
 */
export function PlatformEditAgencyForm({
  agencyId,
  initialName,
  initialSlug,
  initialLocale,
  initialTimezone,
}: {
  agencyId: string;
  initialName: string;
  initialSlug: string;
  initialLocale: string;
  initialTimezone: string;
}) {
  // useActionState returns a (prev, formData) => Promise<state>
  // action. EditAgencyForm expects a (formData) => Promise<void>
  // action. We bridge with a thin wrapper that drops the
  // prev-state argument.
  const [state, dispatchWithPrev] = useActionState(platformEditAgencyAction, initial);
  const formAction = (formData: FormData) => {
    void dispatchWithPrev(formData);
  };
  return (
    <EditAgencyForm
      initialName={initialName}
      initialSlug={initialSlug}
      initialLocale={initialLocale}
      initialTimezone={initialTimezone}
      testIdPrefix="platform-agency"
      formAction={formAction}
      actionState={state}
      hiddenFields={{ agencyId }}
    />
  );
}
