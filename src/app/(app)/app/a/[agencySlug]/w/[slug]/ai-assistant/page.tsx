import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/workspace/page-header";
import { hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";
import { auth } from "@/lib/auth/config";
import { tForActive } from "@/lib/i18n/t-for-active";
import { findAgencyIdBySlug, getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { WorkspaceAssistant } from "./workspace-assistant";
import { KnowledgeLibrary } from "./knowledge-library";
import { getAiFeatureSettings } from "@/lib/ai/feature-settings";
import { toZonedTime } from "date-fns-tz";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("workspaceAssistant.title") };
}

export default async function WorkspaceAiAssistantPage({
  params,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { agencySlug, slug } = await params;
  const actor = { id: session.user.id };
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, slug);
  if (!workspace) notFound();
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"]))) {
    notFound();
  }
  const canManageWorkspace = await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]);
  const agencyId = await findAgencyIdBySlug(actor, agencySlug);
  const canManageAgency = agencyId ? await isAgencyAdmin(actor, agencyId) : false;
  const { t, code } = await tForActive();
  const aiSettings = await getAiFeatureSettings();
  const workspaceNow = toZonedTime(new Date(), workspace.timezone);
  const currentMonth = `${workspaceNow.getFullYear()}-${String(workspaceNow.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("workspaceAssistant.title")}
        description={t("workspaceAssistant.description")}
      />
      <WorkspaceAssistant
        workspaceSlug={workspace.slug}
        workspaceTimezone={workspace.timezone}
        locale={code}
        model={aiSettings?.model ?? "MiniMax-M3"}
        permittedModels={
          aiSettings?.permittedModels?.length
            ? [...aiSettings.permittedModels]
            : [aiSettings?.model ?? "MiniMax-M3"]
        }
        preferenceScope={`${session.user.id}:${workspace.agencyId}`}
        currentMonth={currentMonth}
        canManageWorkspace={canManageWorkspace}
        labels={{
          emptyTitle: t("workspaceAssistant.emptyTitle"),
          emptyDescription: t("workspaceAssistant.emptyDescription"),
          summarize: t("workspaceAssistant.summarize"),
          findGaps: t("workspaceAssistant.findGaps"),
          improve: t("workspaceAssistant.improve"),
          placeholder: t("workspaceAssistant.placeholder"),
          model: t("workspaceAssistant.model"),
          send: t("workspaceAssistant.send"),
          sending: t("workspaceAssistant.sending"),
          assistant: t("workspaceAssistant.assistant"),
          you: t("workspaceAssistant.you"),
          evidence: t("workspaceAssistant.evidence"),
          source: t("workspaceAssistant.source"),
          capturedAt: t("workspaceAssistant.capturedAt"),
          itemCount: t("workspaceAssistant.itemCount"),
          boundedData: t("workspaceAssistant.boundedData"),
          completeData: t("workspaceAssistant.completeData"),
          limitations: t("workspaceAssistant.limitations"),
          error: t("workspaceAssistant.error"),
          privacy: t("workspaceAssistant.privacy"),
          readOnly: t("workspaceAssistant.readOnly"),
          conversations: t("workspaceAssistant.conversations"),
          newConversation: t("workspaceAssistant.newConversation"),
          searchConversations: t("workspaceAssistant.searchConversations"),
          rename: t("workspaceAssistant.rename"),
          archive: t("workspaceAssistant.archive"),
          renamePrompt: t("workspaceAssistant.renamePrompt"),
          reasoning: t("workspaceAssistant.reasoning"),
          reasoningLow: t("workspaceAssistant.reasoningLow"),
          reasoningMedium: t("workspaceAssistant.reasoningMedium"),
          reasoningHigh: t("workspaceAssistant.reasoningHigh"),
          reasoningExtraHigh: t("workspaceAssistant.reasoningExtraHigh"),
          reasoningMax: t("workspaceAssistant.reasoningMax"),
          promptLibrary: t("workspaceAssistant.promptLibrary"),
          createPrompt: t("workspaceAssistant.createPrompt"),
          promptName: t("workspaceAssistant.promptName"),
          promptPurpose: t("workspaceAssistant.promptPurpose"),
          promptGoal: t("workspaceAssistant.promptGoal"),
          promptInstructions: t("workspaceAssistant.promptInstructions"),
          promptTags: t("workspaceAssistant.promptTags"),
          promptScope: t("workspaceAssistant.promptScope"),
          promptPrivate: t("workspaceAssistant.promptPrivate"),
          promptWorkspace: t("workspaceAssistant.promptWorkspace"),
          promptAgency: t("workspaceAssistant.promptAgency"),
          savePrompt: t("workspaceAssistant.savePrompt"),
          runPrompt: t("workspaceAssistant.runPrompt"),
          promptParameters: t("workspaceAssistant.promptParameters"),
          promptParametersHelp: t("workspaceAssistant.promptParametersHelp"),
          promptParameterAdd: t("workspaceAssistant.promptParameterAdd"),
          promptParameterRemove: t("workspaceAssistant.promptParameterRemove"),
          promptParameterKey: t("workspaceAssistant.promptParameterKey"),
          promptParameterLabel: t("workspaceAssistant.promptParameterLabel"),
          promptParameterType: t("workspaceAssistant.promptParameterType"),
          promptParameterText: t("workspaceAssistant.promptParameterText"),
          promptParameterMonth: t("workspaceAssistant.promptParameterMonth"),
          promptParameterReference: t("workspaceAssistant.promptParameterReference"),
          promptParameterRequired: t("workspaceAssistant.promptParameterRequired"),
          promptParameterDefault: t("workspaceAssistant.promptParameterDefault"),
          promptParameterMissing: t("workspaceAssistant.promptParameterMissing"),
          promptParameterInvalid: t("workspaceAssistant.promptParameterInvalid"),
          promptParameterResolved: t("workspaceAssistant.promptParameterResolved"),
          promptParameterOptional: t("workspaceAssistant.promptParameterOptional"),
          editPrompt: t("workspaceAssistant.editPrompt"),
          publishPrompt: t("workspaceAssistant.publishPrompt"),
          promptPending: t("workspaceAssistant.promptPending"),
          promptError: t("workspaceAssistant.promptError"),
          dismiss: t("workspaceAssistant.dismiss"),
          planPeriod: t("workspaceAssistant.planPeriod"),
          deleteConversation: t("workspaceAssistant.deleteConversation"),
          confirmDelete: t("workspaceAssistant.confirmDelete"),
          showAllPrompts: t("workspaceAssistant.showAllPrompts"),
          showFewerPrompts: t("workspaceAssistant.showFewerPrompts"),
          archivePrompt: t("workspaceAssistant.archivePrompt"),
          archivedConversations: t("workspaceAssistant.archivedConversations"),
          activeConversations: t("workspaceAssistant.activeConversations"),
          restoreConversation: t("workspaceAssistant.restoreConversation"),
          contentReference: t("workspaceAssistant.contentReference"),
          contentReferenceHint: t("workspaceAssistant.contentReferenceHint"),
          contentReferenceNotFound: t("workspaceAssistant.contentReferenceNotFound"),
          chooseContentReference: t("workspaceAssistant.chooseContentReference"),
          useContentReference: t("workspaceAssistant.useContentReference"),
          selectedContent: t("workspaceAssistant.selectedContent"),
          reviewedPlan: t("workspaceAssistant.reviewedPlan"),
          proposedEdits: t("workspaceAssistant.proposedEdits"),
          before: t("workspaceAssistant.before"),
          after: t("workspaceAssistant.after"),
          applyEdit: t("workspaceAssistant.applyEdit"),
          selectProposal: t("workspaceAssistant.selectProposal"),
          applySelectedEdits: t("workspaceAssistant.applySelectedEdits"),
          applyingSelectedEdits: t("workspaceAssistant.applyingSelectedEdits"),
          applyingEdit: t("workspaceAssistant.applyingEdit"),
          rejectEdit: t("workspaceAssistant.rejectEdit"),
          editApplied: t("workspaceAssistant.editApplied"),
          editRejected: t("workspaceAssistant.editRejected"),
          editStale: t("workspaceAssistant.editStale"),
          editExpired: t("workspaceAssistant.editExpired"),
          editStatusError: t("workspaceAssistant.editStatusError"),
          activityContext: t("workspaceAssistant.activityContext"),
          activitySkills: t("workspaceAssistant.activitySkills"),
          activityAnalysis: t("workspaceAssistant.activityAnalysis"),
          activityProvider: t("workspaceAssistant.activityProvider"),
          activityWriting: t("workspaceAssistant.activityWriting"),
          activityValidated: t("workspaceAssistant.activityValidated"),
          activityComplete: t("workspaceAssistant.activityComplete"),
          activityFailed: t("workspaceAssistant.activityFailed"),
          activityCancelled: t("workspaceAssistant.activityCancelled"),
          runResultUnavailable: t("workspaceAssistant.runResultUnavailable"),
          activityToolRunning: t("workspaceAssistant.activityToolRunning"),
          activityToolCompleted: t("workspaceAssistant.activityToolCompleted"),
          activityToolFailed: t("workspaceAssistant.activityToolFailed"),
          activityToolPlanSummary: t("workspaceAssistant.activityToolPlanSummary"),
          activityToolSchedule: t("workspaceAssistant.activityToolSchedule"),
          activityToolContentMix: t("workspaceAssistant.activityToolContentMix"),
          activityToolItems: t("workspaceAssistant.activityToolItems"),
          activityToolSelectedItem: t("workspaceAssistant.activityToolSelectedItem"),
          activityToolBrand: t("workspaceAssistant.activityToolBrand"),
          activityToolWorkload: t("workspaceAssistant.activityToolWorkload"),
          stop: t("workspaceAssistant.stop"),
          mode: t("workspaceAssistant.mode"),
          modeAsk: t("workspaceAssistant.modeAsk"),
          modePlan: t("workspaceAssistant.modePlan"),
          modeApply: t("workspaceAssistant.modeApply"),
          modeAskDescription: t("workspaceAssistant.modeAskDescription"),
          modePlanDescription: t("workspaceAssistant.modePlanDescription"),
          modeApplyDescription: t("workspaceAssistant.modeApplyDescription"),
          searchPrompts: t("workspaceAssistant.searchPrompts"),
          assistantHistory: t("workspaceAssistant.assistantHistory"),
          toolsAndContext: t("workspaceAssistant.toolsAndContext"),
          responseLanguage: t("workspaceAssistant.responseLanguage"),
          languageArabic: t("workspaceAssistant.languageArabic"),
          languageEnglish: t("workspaceAssistant.languageEnglish"),
          pinConversation: t("workspaceAssistant.pinConversation"),
          unpinConversation: t("workspaceAssistant.unpinConversation"),
          pinnedConversation: t("workspaceAssistant.pinnedConversation"),
          noConversations: t("workspaceAssistant.noConversations"),
          noSearchResults: t("workspaceAssistant.noSearchResults"),
          copyResponse: t("workspaceAssistant.copyResponse"),
          responseCopied: t("workspaceAssistant.responseCopied"),
          regenerateResponse: t("workspaceAssistant.regenerateResponse"),
          activityTimeline: t("workspaceAssistant.activityTimeline"),
          conversationRestored: t("workspaceAssistant.conversationRestored"),
          findings: t("workspaceAssistant.findings"),
          recommendations: t("workspaceAssistant.recommendations"),
          hideHistory: t("workspaceAssistant.hideHistory"),
          showHistory: t("workspaceAssistant.showHistory"),
        }}
        knowledgeLibrary={
          <KnowledgeLibrary
            workspaceSlug={workspace.slug}
            locale={code}
            canManageWorkspace={canManageWorkspace}
            canManageAgency={canManageAgency}
          />
        }
      />
    </div>
  );
}
