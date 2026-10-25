import { notFound, redirect } from "next/navigation";
import { hasWorkspaceRole, isAgencyAdmin } from "@/lib/auth/policy";
import { auth } from "@/lib/auth/config";
import { tForActive } from "@/lib/i18n/t-for-active";
import { findAgencyIdBySlug, getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { getWorkspaceAssistantMonthSummary } from "@/features/content/server";
import { workspaceMonthRange } from "@/lib/i18n/workspace-month";
import { ALL_FORMATS, ALL_STATUSES } from "@/lib/content/status";
import { WorkspaceAssistant } from "./workspace-assistant";
import { KnowledgeLibrary } from "./knowledge-library";
import type { WorkspaceAssistantMonthSnapshot } from "./workspace-assistant-dashboard";
import { getAiFeatureSettings } from "@/lib/ai/feature-settings";
import { toZonedTime } from "date-fns-tz";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("workspaceAssistant.title") };
}

export default async function WorkspaceAiAssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ agencySlug: string; slug: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const [{ agencySlug, slug }, query] = await Promise.all([params, searchParams]);
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
  const requestedMonth = typeof query.month === "string" ? query.month : "";
  const requestedYear = Number(requestedMonth.slice(0, 4));
  const selectedMonth =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) && requestedYear >= 1000 && requestedYear <= 9998
      ? requestedMonth
      : currentMonth;
  const [year, monthNumber] = selectedMonth.split("-").map(Number);
  const previousDate = new Date(Date.UTC(year!, monthNumber! - 2, 1));
  const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const loadMonthSnapshot = async (month: string): Promise<WorkspaceAssistantMonthSnapshot> => {
    const [snapshotYear, snapshotMonth] = month.split("-").map(Number);
    const range = workspaceMonthRange(snapshotYear!, snapshotMonth! - 1, workspace.timezone);
    const summary = await getWorkspaceAssistantMonthSummary(actor, workspace.id, {
      monthStart: range.start,
      monthEnd: range.end,
      timezone: workspace.timezone,
    });
    return {
      month,
      totalItems: summary.totalItems,
      statusCounts: summary.statusCounts,
      notReadyCount: summary.notReadyCount,
      notReadyItems: summary.notReadyItems.map((item) => ({
        ...item,
        plannedPublishAt: item.plannedPublishAt.toISOString(),
      })),
      formatCounts: summary.formatCounts,
      dailyCounts: summary.dailyCounts,
      retrievedAt: new Date().toISOString(),
    };
  };
  const [dashboardSnapshot, previousDashboardSnapshot] = await Promise.all([
    loadMonthSnapshot(selectedMonth),
    loadMonthSnapshot(previousMonth),
  ]);

  return (
    <div className="space-y-5">
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
        currentMonth={selectedMonth}
        canManageWorkspace={canManageWorkspace}
        dashboardSnapshot={dashboardSnapshot}
        previousDashboardSnapshot={previousDashboardSnapshot}
        statusLabels={Object.fromEntries(
          ALL_STATUSES.map((status) => [status, t(`planningFilters.statusLabels.${status}`)]),
        )}
        formatLabels={Object.fromEntries(
          ALL_FORMATS.map((format) => [format, t(`planningFilters.formatLabels.${format}`)]),
        )}
        dashboardLabels={{
          heroTitle: t("workspaceAssistant.dashboard.heroTitle"),
          heroDescription: t("workspaceAssistant.dashboard.heroDescription"),
          quickContentAnalysis: t("workspaceAssistant.dashboard.quickContentAnalysis"),
          quickContentAnalysisPrompt: t("workspaceAssistant.dashboard.quickContentAnalysisPrompt"),
          quickSuggestions: t("workspaceAssistant.dashboard.quickSuggestions"),
          quickSuggestionsPrompt: t("workspaceAssistant.dashboard.quickSuggestionsPrompt"),
          quickPlanImprovement: t("workspaceAssistant.dashboard.quickPlanImprovement"),
          quickPlanImprovementPrompt: t("workspaceAssistant.dashboard.quickPlanImprovementPrompt"),
          quickReadyDrafts: t("workspaceAssistant.dashboard.quickReadyDrafts"),
          quickReadyDraftsPrompt: t("workspaceAssistant.dashboard.quickReadyDraftsPrompt"),
          addKnowledge: t("workspaceAssistant.dashboard.addKnowledge"),
          searchKnowledge: t("workspaceAssistant.dashboard.searchKnowledge"),
          openPromptLibrary: t("workspaceAssistant.dashboard.openPromptLibrary"),
          quickActions: t("workspaceAssistant.dashboard.quickActions"),
          promptCardsTitle: t("workspaceAssistant.dashboard.promptCardsTitle"),
          promptCardsDescription: t("workspaceAssistant.dashboard.promptCardsDescription"),
          heroPlaceholder: t("workspaceAssistant.dashboard.heroPlaceholder"),
          monthSummaryTitle: t("workspaceAssistant.dashboard.monthSummaryTitle"),
          monthLabel: t("workspaceAssistant.dashboard.monthLabel"),
          generateReport: t("workspaceAssistant.dashboard.generateReport"),
          comparePrevious: t("workspaceAssistant.dashboard.comparePrevious"),
          overviewTitle: t("workspaceAssistant.dashboard.overviewTitle"),
          overviewEmpty: t("workspaceAssistant.dashboard.overviewEmpty"),
          overviewSummary: t("workspaceAssistant.dashboard.overviewSummary"),
          dataSource: t("workspaceAssistant.dashboard.dataSource"),
          exactCounts: t("workspaceAssistant.dashboard.exactCounts"),
          updatedAt: t("workspaceAssistant.dashboard.updatedAt"),
          totalItems: t("workspaceAssistant.dashboard.totalItems"),
          published: t("workspaceAssistant.dashboard.published"),
          readyToPublish: t("workspaceAssistant.dashboard.readyToPublish"),
          inReview: t("workspaceAssistant.dashboard.inReview"),
          inDesign: t("workspaceAssistant.dashboard.inDesign"),
          strengthsTitle: t("workspaceAssistant.dashboard.strengthsTitle"),
          recommendationsTitle: t("workspaceAssistant.dashboard.recommendationsTitle"),
          strengthPublished: t("workspaceAssistant.dashboard.strengthPublished"),
          strengthReady: t("workspaceAssistant.dashboard.strengthReady"),
          strengthNoPublished: t("workspaceAssistant.dashboard.strengthNoPublished"),
          strengthEmpty: t("workspaceAssistant.dashboard.strengthEmpty"),
          recommendReview: t("workspaceAssistant.dashboard.recommendReview"),
          recommendDesign: t("workspaceAssistant.dashboard.recommendDesign"),
          recommendBlocked: t("workspaceAssistant.dashboard.recommendBlocked"),
          recommendClear: t("workspaceAssistant.dashboard.recommendClear"),
          notReadyTitle: t("workspaceAssistant.dashboard.notReadyTitle"),
          notReadyCount: t("workspaceAssistant.dashboard.notReadyCount"),
          showingFirstFive: t("workspaceAssistant.dashboard.showingFirstFive"),
          contentTitle: t("workspaceAssistant.dashboard.contentTitle"),
          format: t("workspaceAssistant.dashboard.format"),
          status: t("workspaceAssistant.dashboard.status"),
          plannedDate: t("workspaceAssistant.dashboard.plannedDate"),
          openItem: t("workspaceAssistant.dashboard.openItem"),
          emptyNotReady: t("workspaceAssistant.dashboard.emptyNotReady"),
          compareTitle: t("workspaceAssistant.dashboard.compareTitle"),
          currentMonth: t("workspaceAssistant.dashboard.currentMonth"),
          previousMonth: t("workspaceAssistant.dashboard.previousMonth"),
          noPreviousData: t("workspaceAssistant.dashboard.noPreviousData"),
          closeComparison: t("workspaceAssistant.dashboard.closeComparison"),
          toolsAndKnowledge: t("workspaceAssistant.dashboard.toolsAndKnowledge"),
          advancedOptions: t("workspaceAssistant.dashboard.advancedOptions"),
          messageLabel: t("workspaceAssistant.dashboard.messageLabel"),
          model: t("workspaceAssistant.model"),
          composerTitle: t("workspaceAssistant.dashboard.composerTitle"),
          composerDescription: t("workspaceAssistant.dashboard.composerDescription"),
          contentReference: t("workspaceAssistant.contentReference"),
          contentReferenceHint: t("workspaceAssistant.contentReferenceHint"),
          referenceAttached: t("workspaceAssistant.dashboard.referenceAttached"),
          notReadyHelp: t("workspaceAssistant.dashboard.notReadyHelp"),
          send: t("workspaceAssistant.send"),
          responseLanguage: t("workspaceAssistant.responseLanguage"),
          languageArabic: t("workspaceAssistant.languageArabic"),
          languageEnglish: t("workspaceAssistant.languageEnglish"),
          mode: t("workspaceAssistant.mode"),
          modeAsk: t("workspaceAssistant.modeAsk"),
          modePlan: t("workspaceAssistant.modePlan"),
          modeApply: t("workspaceAssistant.modeApply"),
          promptSearch: t("workspaceAssistant.dashboard.promptSearch"),
          promptCategoryAll: t("workspaceAssistant.dashboard.promptCategoryAll"),
          promptCategoryAnalysis: t("workspaceAssistant.dashboard.promptCategoryAnalysis"),
          promptCategoryCalendar: t("workspaceAssistant.dashboard.promptCategoryCalendar"),
          promptCategoryFormats: t("workspaceAssistant.dashboard.promptCategoryFormats"),
          promptCategoryAudience: t("workspaceAssistant.dashboard.promptCategoryAudience"),
          promptCategoryCreative: t("workspaceAssistant.dashboard.promptCategoryCreative"),
          promptCategoryReports: t("workspaceAssistant.dashboard.promptCategoryReports"),
          promptCategoryFavorites: t("workspaceAssistant.dashboard.promptCategoryFavorites"),
          favoritePrompt: t("workspaceAssistant.dashboard.favoritePrompt"),
          removeFavoritePrompt: t("workspaceAssistant.dashboard.removeFavoritePrompt"),
          showAllPrompts: t("workspaceAssistant.showAllPrompts"),
          showFewerPrompts: t("workspaceAssistant.showFewerPrompts"),
          noPromptResults: t("workspaceAssistant.dashboard.noPromptResults"),
          recentConversations: t("workspaceAssistant.dashboard.recentConversations"),
          showConversationHistory: t("workspaceAssistant.dashboard.showConversationHistory"),
          noRecentConversations: t("workspaceAssistant.dashboard.noRecentConversations"),
          formatDistributionTitle: t("workspaceAssistant.dashboard.formatDistributionTitle"),
          dailyDistributionTitle: t("workspaceAssistant.dashboard.dailyDistributionTitle"),
          otherStatus: t("workspaceAssistant.dashboard.otherStatus"),
          activeDates: t("workspaceAssistant.dashboard.activeDates"),
          formatVariety: t("workspaceAssistant.dashboard.formatVariety"),
          opportunitiesTitle: t("workspaceAssistant.dashboard.opportunitiesTitle"),
          executionTitle: t("workspaceAssistant.dashboard.executionTitle"),
          openNotReadyList: t("workspaceAssistant.dashboard.openNotReadyList"),
          noChartData: t("workspaceAssistant.dashboard.noChartData"),
        }}
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
          promptsLoading: t("workspaceAssistant.promptsLoading"),
          promptsLoadError: t("workspaceAssistant.promptsLoadError"),
          retry: t("workspaceAssistant.retry"),
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
        itemHrefBase={`/app/a/${encodeURIComponent(agencySlug)}/w/${encodeURIComponent(workspace.slug)}/planning`}
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
