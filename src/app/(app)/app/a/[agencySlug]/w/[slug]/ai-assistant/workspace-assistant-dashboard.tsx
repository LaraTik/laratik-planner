"use client";

import { useRef, useState, type FormEventHandler } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Lightbulb,
  Library,
  MessageSquare,
  Paperclip,
  Pencil,
  Search,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { DirAwareInput } from "@/components/forms/dir-aware-textarea";
import { Button } from "@/components/ui/button";
import type { AssistantPromptParameter } from "@/features/workspace-assistant";
import type { AssistantConversationSummary } from "./assistant-history-panel";

export type WorkspaceAssistantMonthSnapshot = {
  month: string;
  totalItems: number;
  statusCounts: Record<string, number>;
  notReadyCount: number;
  notReadyItems: {
    id: string;
    title: string;
    format: string;
    status: string;
    plannedPublishAt: string;
  }[];
  formatCounts: { format: string; count: number }[];
  dailyCounts: { date: string; statusCounts: Record<string, number> }[];
  retrievedAt: string;
};

export type WorkspaceAssistantDashboardLabels = {
  heroTitle: string;
  heroDescription: string;
  quickContentAnalysis: string;
  quickContentAnalysisPrompt: string;
  quickSuggestions: string;
  quickSuggestionsPrompt: string;
  quickPlanImprovement: string;
  quickPlanImprovementPrompt: string;
  quickReadyDrafts: string;
  quickReadyDraftsPrompt: string;
  addKnowledge: string;
  searchKnowledge: string;
  openPromptLibrary: string;
  quickActions: string;
  promptCardsTitle: string;
  promptCardsDescription: string;
  heroPlaceholder: string;
  monthSummaryTitle: string;
  monthLabel: string;
  generateReport: string;
  comparePrevious: string;
  overviewTitle: string;
  overviewEmpty: string;
  overviewSummary: string;
  dataSource: string;
  exactCounts: string;
  updatedAt: string;
  totalItems: string;
  published: string;
  readyToPublish: string;
  inReview: string;
  inDesign: string;
  strengthsTitle: string;
  recommendationsTitle: string;
  strengthPublished: string;
  strengthReady: string;
  strengthNoPublished: string;
  strengthEmpty: string;
  recommendReview: string;
  recommendDesign: string;
  recommendBlocked: string;
  recommendClear: string;
  notReadyTitle: string;
  notReadyCount: string;
  showingFirstFive: string;
  contentTitle: string;
  format: string;
  status: string;
  plannedDate: string;
  openItem: string;
  emptyNotReady: string;
  compareTitle: string;
  currentMonth: string;
  previousMonth: string;
  noPreviousData: string;
  closeComparison: string;
  toolsAndKnowledge: string;
  advancedOptions: string;
  messageLabel: string;
  model: string;
  composerTitle: string;
  composerDescription: string;
  contentReference: string;
  contentReferenceHint: string;
  referenceAttached: string;
  notReadyHelp: string;
  send: string;
  responseLanguage: string;
  languageArabic: string;
  languageEnglish: string;
  mode: string;
  modeAsk: string;
  modePlan: string;
  modeApply: string;
  promptSearch: string;
  promptCategoryAll: string;
  promptCategoryAnalysis: string;
  promptCategoryCalendar: string;
  promptCategoryFormats: string;
  promptCategoryAudience: string;
  promptCategoryCreative: string;
  promptCategoryReports: string;
  promptCategoryFavorites: string;
  favoritePrompt: string;
  removeFavoritePrompt: string;
  showAllPrompts: string;
  showFewerPrompts: string;
  noPromptResults: string;
  recentConversations: string;
  showConversationHistory: string;
  noRecentConversations: string;
  formatDistributionTitle: string;
  dailyDistributionTitle: string;
  otherStatus: string;
  activeDates: string;
  formatVariety: string;
  opportunitiesTitle: string;
  executionTitle: string;
  openNotReadyList: string;
  noChartData: string;
};

type DashboardPrompt = {
  id: string;
  name: string;
  purpose: string;
  goal: string;
  tags: string[];
};

type DashboardContentCandidate = {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedPublishAt: string;
  revision: number;
};

function valueFor(statusCounts: Record<string, number>, statuses: string[]) {
  return statuses.reduce((total, status) => total + (statusCounts[status] ?? 0), 0);
}

function fillCount(template: string, count: number, locale: string) {
  return template.replace("{count}", new Intl.NumberFormat(locale).format(count));
}

function monthName(month: string, locale: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function WorkspaceAssistantDashboard({
  workspaceSlug,
  workspaceTimezone,
  locale,
  month,
  snapshot,
  previousSnapshot,
  prompts,
  labels,
  draft,
  busy,
  canSubmit,
  promptParameters,
  promptParameterValues,
  promptParameterLabels,
  onPromptParameterValueChange,
  onDraftChange,
  contentItemReference,
  onContentReferenceChange,
  contentReferenceAttached,
  contentCandidates,
  contentReferenceNotFound,
  contentReferenceLabels,
  onSelectContentCandidate,
  onSubmit,
  onMonthChange,
  onGenerateReport,
  onSelectPrompt,
  onOpenKnowledge,
  onOpenTools,
  recentConversations,
  currentConversationId,
  onOpenConversation,
  onShowConversationHistory,
  showComposer,
  responseLocale,
  onResponseLocaleChange,
  mode,
  onModeChange,
  selectedModel,
  permittedModels,
  onModelChange,
  formatLabels,
  statusLabels,
  itemHrefBase,
}: {
  workspaceSlug: string;
  workspaceTimezone: string;
  locale: string;
  month: string;
  snapshot: WorkspaceAssistantMonthSnapshot;
  previousSnapshot: WorkspaceAssistantMonthSnapshot;
  prompts: DashboardPrompt[];
  labels: WorkspaceAssistantDashboardLabels;
  draft: string;
  busy: boolean;
  canSubmit: boolean;
  promptParameters: AssistantPromptParameter[];
  promptParameterValues: Record<string, string>;
  promptParameterLabels: {
    title: string;
    invalid: string;
    missing: string;
    resolved: string;
    optional: string;
  };
  onPromptParameterValueChange: (key: string, value: string) => void;
  onDraftChange: (value: string) => void;
  contentItemReference: string;
  onContentReferenceChange: (value: string) => void;
  contentReferenceAttached: boolean;
  contentCandidates: DashboardContentCandidate[];
  contentReferenceNotFound: boolean;
  contentReferenceLabels: {
    notFound: string;
    choose: string;
    use: string;
  };
  onSelectContentCandidate: (candidate: DashboardContentCandidate) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onMonthChange: (month: string) => void;
  onGenerateReport: () => void;
  onSelectPrompt: (id: string) => void;
  onOpenKnowledge: () => void;
  onOpenTools: () => void;
  recentConversations: AssistantConversationSummary[];
  currentConversationId: string | null;
  onOpenConversation: (id: string) => void;
  onShowConversationHistory: () => void;
  showComposer: boolean;
  responseLocale: "ar" | "en";
  onResponseLocaleChange: (locale: "ar" | "en") => void;
  mode: "ask" | "plan" | "apply";
  onModeChange: (mode: "ask" | "plan" | "apply") => void;
  selectedModel: string;
  permittedModels: string[];
  onModelChange: (model: string) => void;
  formatLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  itemHrefBase: string;
}) {
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [promptSearch, setPromptSearch] = useState("");
  const [promptCategory, setPromptCategory] = useState("all");
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [favoritePromptIds, setFavoritePromptIds] = useState<string[]>([]);
  const monthPickerRef = useRef<HTMLInputElement>(null);
  const numberFormat = new Intl.NumberFormat(locale);
  const published = snapshot.statusCounts.published ?? 0;
  const ready = snapshot.statusCounts.ready_to_publish ?? 0;
  const inReview = valueFor(snapshot.statusCounts, [
    "content_review",
    "creative_review",
    "changes_requested",
  ]);
  const inDesign = snapshot.statusCounts.in_design ?? 0;
  const blocked = snapshot.statusCounts.blocked ?? 0;
  const strengths = [
    ...(published ? [fillCount(labels.strengthPublished, published, locale)] : []),
    ...(ready ? [fillCount(labels.strengthReady, ready, locale)] : []),
    ...(!published && !ready && snapshot.totalItems > 0 ? [labels.strengthNoPublished] : []),
    ...(snapshot.totalItems === 0 ? [labels.strengthEmpty] : []),
  ];
  const recommendations = [
    ...(inReview ? [fillCount(labels.recommendReview, inReview, locale)] : []),
    ...(inDesign ? [fillCount(labels.recommendDesign, inDesign, locale)] : []),
    ...(blocked ? [fillCount(labels.recommendBlocked, blocked, locale)] : []),
    ...(!inReview && !inDesign && !blocked ? [labels.recommendClear] : []),
  ];
  const metrics = [
    { label: labels.inReview, value: inReview, icon: Search, tone: "text-primary" },
    { label: labels.inDesign, value: inDesign, icon: Pencil, tone: "text-primary" },
    { label: labels.readyToPublish, value: ready, icon: Clock3, tone: "text-warning" },
    { label: labels.published, value: published, icon: CheckCircle2, tone: "text-success" },
  ];
  const promptCategories = [
    { id: "all", label: labels.promptCategoryAll },
    { id: "analysis", label: labels.promptCategoryAnalysis },
    { id: "formats", label: labels.promptCategoryFormats },
    { id: "calendar", label: labels.promptCategoryCalendar },
    { id: "audience", label: labels.promptCategoryAudience },
    { id: "creative", label: labels.promptCategoryCreative },
    { id: "reports", label: labels.promptCategoryReports },
    { id: "favorites", label: labels.promptCategoryFavorites },
  ];
  const searchedPrompts = prompts.filter((prompt) => {
    const query = promptSearch.trim().toLocaleLowerCase(locale);
    const matchesSearch =
      !query ||
      [prompt.name, prompt.purpose, prompt.goal, ...prompt.tags]
        .join(" ")
        .toLocaleLowerCase(locale)
        .includes(query);
    const id = prompt.id.toLocaleLowerCase(locale);
    const matchesCategory =
      promptCategory === "all" ||
      (promptCategory === "analysis" && /(review|summary|status|missing)/.test(id)) ||
      (promptCategory === "calendar" && /(schedule|calendar|weekly|quiet|busy|half)/.test(id)) ||
      (promptCategory === "formats" && /(format|content-mix|diversity)/.test(id)) ||
      (promptCategory === "audience" && /(audience|channel|goal|target)/.test(id)) ||
      (promptCategory === "creative" && /(creative|ideas|alternatives|questions)/.test(id)) ||
      (promptCategory === "reports" && /(manager|report|executive)/.test(id)) ||
      (promptCategory === "favorites" && favoritePromptIds.includes(prompt.id));
    return matchesSearch && matchesCategory;
  });
  const visiblePrompts = showAllPrompts ? searchedPrompts : searchedPrompts.slice(0, 8);
  const formatTotal = snapshot.formatCounts.reduce((total, item) => total + item.count, 0);
  const sortedFormatCounts = snapshot.formatCounts
    .slice()
    .sort((left, right) => right.count - left.count);
  const formatPalette = [
    "var(--chart-series-1)",
    "var(--chart-series-2)",
    "var(--chart-series-3)",
    "var(--chart-series-4)",
    "var(--chart-series-5)",
    "var(--chart-series-6)",
  ];
  let formatPosition = 0;
  const formatGradient = snapshot.formatCounts.length
    ? `conic-gradient(${sortedFormatCounts
        .map((item, index) => {
          const start = formatPosition;
          formatPosition += (item.count / Math.max(formatTotal, 1)) * 100;
          return `${formatPalette[index % formatPalette.length]} ${start}% ${formatPosition}%`;
        })
        .join(", ")})`
    : "conic-gradient(var(--border) 0% 100%)";
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year || 2000, monthNumber || 1, 0)).getUTCDate();
  const dailyByDate = new Map(
    snapshot.dailyCounts.map((entry) => [entry.date, entry.statusCounts]),
  );
  const dailyCounts = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const statusCounts = dailyByDate.get(date) ?? {};
    return {
      date,
      day: index + 1,
      statusCounts,
      count: Object.values(statusCounts).reduce((total, count) => total + count, 0),
    };
  });
  const dailyMax = Math.max(1, ...dailyCounts.map((day) => day.count));
  const activeDates = snapshot.dailyCounts.length;
  const statusSegments = (counts: Record<string, number>) => {
    const reviewCount = valueFor(counts, [
      "content_review",
      "creative_review",
      "changes_requested",
    ]);
    const publishedCount = counts.published ?? 0;
    const readyCount = counts.ready_to_publish ?? 0;
    const otherCount = Math.max(
      0,
      Object.values(counts).reduce((total, count) => total + count, 0) -
        publishedCount -
        readyCount -
        reviewCount,
    );
    return [
      { value: publishedCount, color: "var(--chart-series-1)" },
      { value: readyCount, color: "var(--chart-series-3)" },
      { value: reviewCount, color: "var(--chart-series-2)" },
      { value: otherCount, color: "var(--chart-series-4)" },
    ];
  };

  return (
    <div className="space-y-4" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="border-border from-primary-subtle via-surface to-surface overflow-hidden rounded-[var(--radius-card)] border bg-gradient-to-br p-4 sm:p-6 lg:p-7">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="bg-primary/5 relative hidden h-24 w-28 shrink-0 items-center justify-center rounded-3xl sm:flex">
            <span className="text-primary absolute end-3 top-3">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="bg-primary-subtle absolute inset-2 rounded-[38%]" aria-hidden="true" />
            <span className="bg-primary shadow-primary/20 relative flex h-16 w-16 flex-col items-center justify-center gap-2 rounded-[1.4rem] text-white shadow-lg">
              <span className="flex items-center gap-3" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
              <span className="h-1 w-5 rounded-full bg-white/80" aria-hidden="true" />
            </span>
            <span className="text-primary absolute start-3 bottom-2">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
              {labels.heroTitle}
            </h1>
            <p className="text-body text-fg-secondary mt-2 max-w-2xl">{labels.heroDescription}</p>
            <div
              className="mt-4 flex flex-wrap gap-2"
              role="group"
              aria-label={labels.quickActions}
            >
              {[
                {
                  label: labels.quickContentAnalysis,
                  prompt: labels.quickContentAnalysisPrompt,
                  icon: Lightbulb,
                  color: "text-primary",
                },
                {
                  label: labels.quickSuggestions,
                  prompt: labels.quickSuggestionsPrompt,
                  icon: Sparkles,
                  color: "text-warning",
                },
                {
                  label: labels.quickPlanImprovement,
                  prompt: labels.quickPlanImprovementPrompt,
                  icon: BarChart3,
                  color: "text-success",
                },
                {
                  label: labels.quickReadyDrafts,
                  prompt: labels.quickReadyDraftsPrompt,
                  icon: Pencil,
                  color: "text-primary",
                },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      onDraftChange(action.prompt);
                      window.setTimeout(() => {
                        const input = document.getElementById(
                          `assistant-hero-message-${workspaceSlug}`,
                        );
                        input?.scrollIntoView({ behavior: "smooth", block: "center" });
                        input?.focus();
                      }, 0);
                    }}
                    className="border-border bg-surface/90 hover:bg-surface focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-start transition focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Icon className={`h-4 w-4 ${action.color}`} aria-hidden="true" />
                    <span className="text-label text-fg-primary font-semibold">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {showComposer ? (
        <section
          className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5"
          aria-labelledby="assistant-composer-title"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2
                id="assistant-composer-title"
                className="text-title-card text-fg-primary font-semibold"
              >
                {labels.composerTitle}
              </h2>
              <p className="text-label text-fg-secondary mt-1">{labels.composerDescription}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  document
                    .getElementById("assistant-prompts-title")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <Library className="h-4 w-4" aria-hidden="true" />
                {labels.openPromptLibrary}
              </Button>
              <Button type="button" variant="outline" onClick={onOpenKnowledge}>
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                {labels.addKnowledge}
              </Button>
            </div>
          </div>
          <form
            className="border-border bg-surface-subtle flex items-center gap-2 rounded-[var(--radius-control)] border p-2"
            onSubmit={onSubmit}
          >
            <label className="sr-only" htmlFor={`assistant-hero-message-${workspaceSlug}`}>
              {labels.messageLabel}
            </label>
            <DirAwareInput
              id={`assistant-hero-message-${workspaceSlug}`}
              locale={locale}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={labels.heroPlaceholder}
              maxLength={1_000}
              className="text-body min-h-11 min-w-0 flex-1 border-0 bg-transparent px-2 focus-visible:ring-0"
              disabled={busy}
            />
            <Button
              type="submit"
              disabled={busy || !canSubmit || !draft.trim()}
              aria-label={labels.send}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{labels.send}</span>
            </Button>
          </form>
          <label className="text-label text-fg-secondary mt-3 grid gap-1">
            <span className="flex items-center gap-2">
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              {labels.contentReference}
              {contentReferenceAttached ? (
                <span className="text-success font-semibold">{labels.referenceAttached}</span>
              ) : null}
            </span>
            <DirAwareInput
              locale={locale}
              value={contentItemReference}
              onChange={(event) => onContentReferenceChange(event.target.value)}
              data-testid="assistant-dashboard-content-reference"
              placeholder={labels.contentReferenceHint}
              maxLength={500}
              className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-3"
              disabled={busy}
            />
          </label>
          {contentReferenceNotFound ? (
            <p role="alert" className="text-body text-danger mt-3">
              {contentReferenceLabels.notFound}
            </p>
          ) : null}
          {contentCandidates.length ? (
            <section
              className="border-border mt-3 rounded-[var(--radius-control)] border p-3"
              aria-label={contentReferenceLabels.choose}
              data-testid="assistant-dashboard-reference-resolution"
            >
              <h3 className="text-body text-fg-primary font-semibold">
                {contentReferenceLabels.choose}
              </h3>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {contentCandidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="bg-surface-subtle rounded-[var(--radius-control)] p-2"
                  >
                    <p className="text-body text-fg-primary font-medium">{candidate.title}</p>
                    <p className="text-label text-fg-secondary mt-1">
                      {candidate.format} · {candidate.status} ·{" "}
                      {candidate.plannedPublishAt.slice(0, 10)}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      onClick={() => onSelectContentCandidate(candidate)}
                    >
                      {contentReferenceLabels.use}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {promptParameters.length ? (
            <fieldset
              className="border-border mt-3 grid gap-3 rounded-[var(--radius-control)] border p-3"
              data-testid="assistant-dashboard-prompt-parameters"
            >
              <legend className="text-body text-fg-primary px-1 font-semibold">
                {promptParameterLabels.title}
              </legend>
              {promptParameters.map((parameter) => {
                const value = promptParameterValues[parameter.key] ?? parameter.defaultValue ?? "";
                const invalidMonth =
                  parameter.type === "month" &&
                  Boolean(value) &&
                  !/^\\d{4}-(0[1-9]|1[0-2])$/.test(value);
                const missing = parameter.required && !value.trim();
                const state = invalidMonth
                  ? "invalid"
                  : missing
                    ? "missing"
                    : value
                      ? "ready"
                      : "optional";
                const stateLabel = invalidMonth
                  ? promptParameterLabels.invalid
                  : missing
                    ? promptParameterLabels.missing
                    : value
                      ? promptParameterLabels.resolved
                      : promptParameterLabels.optional;
                return (
                  <label
                    key={parameter.key}
                    className="text-label text-fg-secondary grid gap-1"
                    data-parameter-state={state}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{parameter.label}</span>
                      <span
                        className={
                          state === "invalid"
                            ? "text-danger"
                            : state === "missing"
                              ? "text-warning"
                              : state === "ready"
                                ? "text-success"
                                : "text-fg-muted"
                        }
                      >
                        {stateLabel}
                      </span>
                    </span>
                    <DirAwareInput
                      locale={locale}
                      type={parameter.type === "month" ? "month" : "text"}
                      value={value}
                      required={parameter.required}
                      aria-invalid={invalidMonth || missing}
                      aria-describedby={`assistant-prompt-param-${parameter.key}-state`}
                      onChange={(event) =>
                        onPromptParameterValueChange(parameter.key, event.target.value)
                      }
                      className={`text-body bg-surface min-h-11 rounded-[var(--radius-control)] border px-3 ${state === "invalid" ? "border-danger" : state === "missing" ? "border-warning" : state === "ready" ? "border-success" : "border-border"}`}
                    />
                    <span
                      id={`assistant-prompt-param-${parameter.key}-state`}
                      className="text-label text-fg-muted"
                      role={invalidMonth || missing ? "alert" : "status"}
                    >
                      {stateLabel}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-label text-fg-secondary grid gap-1">
              {labels.responseLanguage}
              <select
                value={responseLocale}
                onChange={(event) => onResponseLocaleChange(event.target.value as "ar" | "en")}
                className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-3"
              >
                <option value="ar">{labels.languageArabic}</option>
                <option value="en">{labels.languageEnglish}</option>
              </select>
            </label>
            <label className="text-label text-fg-secondary grid gap-1">
              {labels.mode}
              <select
                value={mode}
                onChange={(event) => onModeChange(event.target.value as "ask" | "plan" | "apply")}
                data-testid="assistant-dashboard-mode"
                className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-3"
              >
                <option value="ask">{labels.modeAsk}</option>
                <option value="plan">{labels.modePlan}</option>
                <option value="apply">{labels.modeApply}</option>
              </select>
            </label>
            <label className="text-label text-fg-secondary grid gap-1">
              {labels.model}
              <select
                value={selectedModel}
                onChange={(event) => onModelChange(event.target.value)}
                className="border-border bg-surface text-body min-h-11 max-w-56 rounded-[var(--radius-control)] border px-3"
              >
                {permittedModels.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {prompts.slice(0, 3).map((prompt) => (
                <button
                  type="button"
                  key={prompt.id}
                  disabled={busy}
                  onClick={() => onSelectPrompt(prompt.id)}
                  className="border-border bg-surface text-label text-fg-secondary hover:text-primary min-h-10 rounded-full border px-3 py-2 transition disabled:opacity-50"
                >
                  {prompt.name}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5"
        aria-labelledby="assistant-prompts-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="assistant-prompts-title"
              className="text-title-card text-fg-primary font-semibold"
            >
              {labels.promptCardsTitle}
            </h2>
            <p className="text-label text-fg-secondary mt-1">{labels.promptCardsDescription}</p>
          </div>
          <label className="border-border flex min-h-11 min-w-52 items-center gap-2 rounded-[var(--radius-control)] border px-3">
            <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
            <DirAwareInput
              locale={locale}
              value={promptSearch}
              onChange={(event) => setPromptSearch(event.target.value)}
              placeholder={labels.promptSearch}
              className="text-body min-h-10 min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
        </div>
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label={labels.promptCardsTitle}
        >
          {promptCategories.map((category) => (
            <button
              type="button"
              key={category.id}
              aria-pressed={promptCategory === category.id}
              onClick={() => {
                setPromptCategory(category.id);
                setShowAllPrompts(false);
              }}
              className={`text-label min-h-10 shrink-0 rounded-[var(--radius-control)] border px-3 py-2 transition ${promptCategory === category.id ? "border-primary bg-primary text-white" : "border-border bg-surface-subtle text-fg-secondary hover:text-primary"}`}
            >
              {category.label}
            </button>
          ))}
        </div>
        {visiblePrompts.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visiblePrompts.map((prompt, index) => {
              const icons = [FileText, BarChart3, CalendarDays, Lightbulb, Sparkles];
              const Icon = icons[index % icons.length] ?? Sparkles;
              return (
                <article
                  key={prompt.id}
                  className="border-border bg-surface relative flex min-h-40 flex-col rounded-[var(--radius-control)] border"
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSelectPrompt(prompt.id)}
                    className="hover:bg-primary-subtle focus-visible:ring-focus-ring flex min-h-40 flex-1 flex-col items-start rounded-[var(--radius-control)] p-3 pb-10 text-start transition focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  >
                    <span className="bg-primary-subtle text-primary flex h-9 w-9 items-center justify-center rounded-xl">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-body text-fg-primary mt-3 line-clamp-2 font-semibold">
                      {prompt.name}
                    </span>
                    <span className="text-label text-fg-secondary mt-1 line-clamp-2">
                      {prompt.purpose}
                    </span>
                    <span className="mt-auto flex flex-wrap gap-1 pt-3">
                      {prompt.tags.slice(0, 2).map((tag) => (
                        <span
                          className="bg-surface-subtle text-label rounded-full px-2 py-1"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={favoritePromptIds.includes(prompt.id)}
                    aria-label={
                      favoritePromptIds.includes(prompt.id)
                        ? labels.removeFavoritePrompt
                        : labels.favoritePrompt
                    }
                    title={
                      favoritePromptIds.includes(prompt.id)
                        ? labels.removeFavoritePrompt
                        : labels.favoritePrompt
                    }
                    onClick={() =>
                      setFavoritePromptIds((current) =>
                        current.includes(prompt.id)
                          ? current.filter((id) => id !== prompt.id)
                          : [...current, prompt.id],
                      )
                    }
                    className="text-fg-muted hover:text-primary focus-visible:ring-focus-ring absolute start-2 bottom-2 flex h-9 w-9 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Star
                      className={`h-4 w-4 ${favoritePromptIds.includes(prompt.id) ? "fill-primary text-primary" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="bg-surface-subtle text-body text-fg-secondary mt-3 rounded-[var(--radius-control)] p-4">
            {labels.noPromptResults}
          </p>
        )}
        {searchedPrompts.length > 8 ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setShowAllPrompts((current) => !current)}
          >
            {showAllPrompts ? labels.showFewerPrompts : labels.showAllPrompts}
          </Button>
        ) : null}
      </section>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5"
        aria-labelledby="assistant-recent-conversations-title"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="assistant-recent-conversations-title"
            className="text-title-card text-fg-primary font-semibold"
          >
            {labels.recentConversations}
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={onShowConversationHistory}>
            {labels.showConversationHistory}
          </Button>
        </div>
        {recentConversations.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {recentConversations.slice(0, 4).map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  aria-current={currentConversationId === conversation.id ? "page" : undefined}
                  onClick={() => onOpenConversation(conversation.id)}
                  className={`border-border hover:border-primary/50 flex min-h-16 w-full min-w-0 items-center gap-3 rounded-[var(--radius-control)] border p-3 text-start transition ${currentConversationId === conversation.id ? "bg-primary-subtle border-primary/40" : "bg-surface"}`}
                >
                  <span className="bg-primary-subtle text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <bdi
                      dir="auto"
                      className="text-body text-fg-primary block truncate font-medium"
                    >
                      {conversation.title}
                    </bdi>
                    <time
                      className="text-label text-fg-muted mt-1 block"
                      dateTime={conversation.updatedAt}
                    >
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeZone: workspaceTimezone,
                      }).format(new Date(conversation.updatedAt))}
                    </time>
                  </span>
                  <ArrowUpRight className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bg-surface-subtle text-body text-fg-secondary mt-3 rounded-[var(--radius-control)] p-4">
            {labels.noRecentConversations}
          </p>
        )}
      </section>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5"
        aria-labelledby="assistant-month-summary-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="assistant-month-summary-title"
              className="text-title-card text-fg-primary font-semibold"
            >
              {labels.monthSummaryTitle}
            </h2>
            <p className="text-label text-fg-secondary mt-1">{monthName(month, locale)}</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="text-label text-fg-secondary grid gap-1">
              <span>{labels.monthLabel}</span>
              <button
                type="button"
                aria-label={`${labels.monthLabel}: ${monthName(month, locale)}`}
                data-testid="assistant-dashboard-month-picker"
                onClick={() => {
                  const picker = monthPickerRef.current;
                  if (!picker) return;
                  if (typeof picker.showPicker === "function") picker.showPicker();
                  else picker.click();
                }}
                className="border-border bg-surface text-body focus-visible:ring-focus-ring flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:outline-none"
              >
                <span>{monthName(month, locale)}</span>
                <CalendarDays className="text-fg-muted h-4 w-4" aria-hidden="true" />
              </button>
              <input
                ref={monthPickerRef}
                type="month"
                value={month}
                onChange={(event) => onMonthChange(event.target.value)}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
            <Button type="button" onClick={onGenerateReport} disabled={busy}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {labels.generateReport}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setComparisonOpen((open) => !open)}
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              {comparisonOpen ? labels.closeComparison : labels.comparePrevious}
            </Button>
          </div>
        </div>

        <div className="border-primary bg-primary-subtle/60 mt-4 rounded-[var(--radius-control)] border-s-4 p-4">
          <div className="flex items-start gap-3">
            <span className="bg-surface text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-body text-fg-primary font-semibold">{labels.overviewTitle}</h3>
              <p className="text-body text-fg-secondary mt-1">
                {snapshot.totalItems === 0
                  ? labels.overviewEmpty
                  : labels.overviewSummary
                      .replace("{total}", numberFormat.format(snapshot.totalItems))
                      .replace("{ready}", numberFormat.format(ready))
                      .replace("{review}", numberFormat.format(inReview))}
              </p>
              <div className="text-label text-fg-muted mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <span>{labels.dataSource}</span>
                <span>{labels.exactCounts}</span>
                <span>{labels.updatedAt}</span>
                <time dateTime={snapshot.retrievedAt}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: workspaceTimezone,
                  }).format(new Date(snapshot.retrievedAt))}
                </time>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                className="border-border bg-surface-subtle flex min-h-24 items-center gap-3 rounded-[var(--radius-control)] border p-3"
                key={metric.label}
              >
                <span className="bg-primary-subtle flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <Icon className={`h-5 w-5 ${metric.tone}`} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-title-card text-fg-primary font-semibold">
                    {numberFormat.format(metric.value)}
                  </p>
                  <p className="text-label text-fg-secondary">{metric.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <section
            className="border-border bg-surface rounded-[var(--radius-control)] border p-4"
            aria-labelledby="assistant-daily-distribution-title"
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="text-primary h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-daily-distribution-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.dailyDistributionTitle}
              </h3>
            </div>
            {snapshot.totalItems ? (
              <>
                <div
                  className="border-border mt-4 flex h-32 items-end gap-1 border-b px-1"
                  role="img"
                  aria-label={`${labels.dailyDistributionTitle}: ${numberFormat.format(snapshot.totalItems)} ${labels.totalItems}`}
                >
                  {dailyCounts.map((day) => {
                    const segments = statusSegments(day.statusCounts);
                    const dayLabel = new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(new Date(`${day.date}T12:00:00.000Z`));
                    return (
                      <div
                        key={day.date}
                        className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
                        title={`${dayLabel}: ${numberFormat.format(day.count)}`}
                      >
                        {day.count ? (
                          <div
                            className="flex w-full max-w-3 flex-col-reverse overflow-hidden rounded-t-sm"
                            style={{ height: `${Math.max(5, (day.count / dailyMax) * 100)}%` }}
                          >
                            {segments.map((segment, index) =>
                              segment.value ? (
                                <span
                                  key={index}
                                  className="block min-h-[2px]"
                                  style={{
                                    height: `${(segment.value / day.count) * 100}%`,
                                    backgroundColor: segment.color,
                                  }}
                                />
                              ) : null,
                            )}
                          </div>
                        ) : null}
                        {day.day === 1 || day.day % 4 === 1 || day.day === daysInMonth ? (
                          <span className="text-label text-fg-muted absolute -bottom-5 text-[10px]">
                            {numberFormat.format(day.day)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2">
                  {[
                    { label: labels.published, color: "var(--chart-series-1)" },
                    { label: labels.readyToPublish, color: "var(--chart-series-3)" },
                    { label: labels.inReview, color: "var(--chart-series-2)" },
                    { label: labels.otherStatus, color: "var(--chart-series-4)" },
                  ].map((item) => (
                    <span
                      className="text-label text-fg-secondary inline-flex items-center gap-2"
                      key={item.label}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.label}
                    </span>
                  ))}
                </div>
                <ul className="sr-only">
                  {snapshot.dailyCounts.map((day) => (
                    <li key={day.date}>
                      {day.date}:{" "}
                      {numberFormat.format(
                        Object.values(day.statusCounts).reduce((sum, count) => sum + count, 0),
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="bg-surface-subtle text-body text-fg-secondary mt-3 rounded-lg p-3">
                {labels.noChartData}
              </p>
            )}
          </section>

          <section
            className="border-border bg-surface rounded-[var(--radius-control)] border p-4"
            aria-labelledby="assistant-format-distribution-title"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-format-distribution-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.formatDistributionTitle}
              </h3>
            </div>
            {formatTotal ? (
              <div className="mt-4 grid items-center gap-4 sm:grid-cols-[minmax(8rem,0.8fr)_1fr]">
                <div
                  className="mx-auto flex h-36 w-36 items-center justify-center rounded-full"
                  style={{ background: formatGradient }}
                  role="img"
                  aria-label={`${labels.formatDistributionTitle}: ${numberFormat.format(formatTotal)} ${labels.totalItems}`}
                >
                  <span className="bg-surface text-title-card text-fg-primary flex h-24 w-24 items-center justify-center rounded-full font-semibold">
                    {numberFormat.format(formatTotal)}
                  </span>
                </div>
                <ul className="space-y-2">
                  {sortedFormatCounts.map((item, index) => (
                    <li
                      className="text-label text-fg-secondary flex items-center gap-2"
                      key={item.format}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: formatPalette[index % formatPalette.length] }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {formatLabels[item.format] ?? item.format}
                      </span>
                      <span className="text-fg-primary font-semibold">
                        {numberFormat.format(Math.round((item.count / formatTotal) * 100))}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="bg-surface-subtle text-body text-fg-secondary mt-3 rounded-lg p-3">
                {labels.noChartData}
              </p>
            )}
          </section>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section
            className="border-success bg-success-subtle/50 rounded-[var(--radius-control)] border-s-4 p-4"
            aria-labelledby="assistant-strengths-title"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-success h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-strengths-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.strengthsTitle}
              </h3>
            </div>
            <ul className="mt-3 space-y-2">
              {strengths.map((strength) => (
                <li className="text-body text-fg-secondary" key={strength}>
                  {strength}
                </li>
              ))}
            </ul>
          </section>
          <section
            className="border-primary bg-primary-subtle/50 rounded-[var(--radius-control)] border-s-4 p-4"
            aria-labelledby="assistant-recommendations-title"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="text-primary h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-recommendations-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.recommendationsTitle}
              </h3>
            </div>
            <ul className="mt-3 space-y-2">
              {recommendations.map((recommendation, index) => (
                <li
                  className="text-body text-fg-secondary flex items-start gap-2"
                  key={recommendation}
                >
                  <span className="bg-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <span>{recommendation}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section
            className="border-warning bg-warning-subtle/50 rounded-[var(--radius-control)] border-s-4 p-4"
            aria-labelledby="assistant-opportunities-title"
          >
            <div className="flex items-center gap-2">
              <Activity className="text-warning h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-opportunities-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.opportunitiesTitle}
              </h3>
            </div>
            <ul className="text-body text-fg-secondary mt-3 space-y-2">
              <li>{fillCount(labels.activeDates, activeDates, locale)}</li>
              <li>{fillCount(labels.formatVariety, snapshot.formatCounts.length, locale)}</li>
            </ul>
          </section>
          <section
            className="border-primary bg-primary-subtle/50 rounded-[var(--radius-control)] border-s-4 p-4"
            aria-labelledby="assistant-execution-title"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-execution-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.executionTitle}
              </h3>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="#assistant-not-ready-title"
                className="border-border bg-surface text-label text-fg-primary hover:border-primary inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2"
              >
                <span className="bg-primary flex h-6 w-6 items-center justify-center rounded-full text-white">
                  {numberFormat.format(snapshot.notReadyCount)}
                </span>
                {labels.openNotReadyList}
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Button type="button" variant="outline" onClick={onOpenTools}>
                <Library className="h-4 w-4" aria-hidden="true" />
                {labels.toolsAndKnowledge}
              </Button>
              <Button type="button" variant="outline" onClick={onOpenKnowledge}>
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                {labels.searchKnowledge}
              </Button>
            </div>
          </section>
        </div>

        {comparisonOpen ? (
          <section
            className="border-border bg-surface-subtle mt-3 rounded-[var(--radius-control)] border p-4"
            aria-labelledby="assistant-comparison-title"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-primary h-5 w-5" aria-hidden="true" />
              <h3
                id="assistant-comparison-title"
                className="text-body text-fg-primary font-semibold"
              >
                {labels.compareTitle}
              </h3>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                { label: labels.currentMonth, data: snapshot },
                { label: labels.previousMonth, data: previousSnapshot },
              ].map(({ label, data }) => (
                <div
                  className="border-border bg-surface rounded-[var(--radius-control)] border p-3"
                  key={label}
                >
                  <p className="text-label text-fg-secondary">
                    {label} · {monthName(data.month, locale)}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    {[
                      [labels.totalItems, data.totalItems],
                      [labels.published, data.statusCounts.published ?? 0],
                      [labels.readyToPublish, data.statusCounts.ready_to_publish ?? 0],
                      [
                        labels.inReview,
                        valueFor(data.statusCounts, [
                          "content_review",
                          "creative_review",
                          "changes_requested",
                        ]),
                      ],
                    ].map(([name, value]) => (
                      <div className="bg-surface-subtle rounded-lg p-2" key={name}>
                        <dt className="text-label text-fg-secondary">{name}</dt>
                        <dd className="text-body text-fg-primary mt-1 font-semibold">
                          {numberFormat.format(Number(value))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {data.totalItems === 0 && label === labels.previousMonth ? (
                    <p className="text-label text-fg-muted mt-2">{labels.noPreviousData}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <section
        className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5"
        aria-labelledby="assistant-not-ready-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="assistant-not-ready-title"
              className="text-title-card text-fg-primary font-semibold"
            >
              {labels.notReadyTitle}{" "}
              <span className="text-fg-muted">({numberFormat.format(snapshot.notReadyCount)})</span>
            </h2>
            <p className="text-label text-fg-secondary mt-1">{labels.notReadyHelp}</p>
          </div>
          <span className="text-label text-fg-muted">{labels.showingFirstFive}</span>
        </div>
        {snapshot.notReadyItems.length ? (
          <div className="border-border mt-3 overflow-x-auto rounded-[var(--radius-control)] border">
            <table className="w-full min-w-[42rem] border-collapse text-start">
              <thead className="bg-surface-subtle">
                <tr>
                  {[
                    labels.contentTitle,
                    labels.format,
                    labels.status,
                    labels.plannedDate,
                    labels.openItem,
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="text-label text-fg-secondary px-3 py-2 font-semibold"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.notReadyItems.map((item) => (
                  <tr className="border-border border-t" key={item.id}>
                    <td className="text-body text-fg-primary max-w-64 px-3 py-2 font-medium">
                      <Link
                        className="hover:text-primary line-clamp-2"
                        href={`${itemHrefBase}/${item.id}`}
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="text-label text-fg-secondary px-3 py-2">
                      {formatLabels[item.format] ?? item.format}
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-warning-subtle text-warning text-label inline-flex rounded-full px-2 py-1">
                        {statusLabels[item.status] ?? item.status}
                      </span>
                    </td>
                    <td className="text-label text-fg-secondary px-3 py-2">
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeZone: workspaceTimezone,
                      }).format(new Date(item.plannedPublishAt))}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`${itemHrefBase}/${item.id}`}
                        aria-label={`${labels.openItem}: ${item.title}`}
                        className="text-primary inline-flex min-h-9 items-center gap-1 rounded px-2 hover:underline"
                      >
                        {labels.openItem}
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bg-surface-subtle text-body text-fg-secondary mt-3 rounded-[var(--radius-control)] p-4">
            {labels.emptyNotReady}
          </p>
        )}
      </section>
    </div>
  );
}
