"use client";

import {
  markPublishingSetupReadyAction,
  recordInternalNoteAction,
  savePublishPackageAction,
  savePublishPackageBatchAction,
  setFinalCopyApprovalAction,
} from "./actions";
import {
  PublishPackageForm as PublishingFeatureForm,
  type PublishPackageActions,
} from "@/features/publishing";

export type { PublishPreviewData } from "@/features/publishing";

const actions: PublishPackageActions = {
  markPublishingSetupReadyAction,
  recordInternalNoteAction,
  savePublishPackageAction,
  savePublishPackageBatchAction,
  setFinalCopyApprovalAction,
};

type PublishPackageFormProps = Omit<Parameters<typeof PublishingFeatureForm>[0], "actions">;

/** Route adapter that binds the publishing feature to this route's server actions. */
export function PublishPackageForm(props: PublishPackageFormProps) {
  return <PublishingFeatureForm {...props} actions={actions} />;
}
