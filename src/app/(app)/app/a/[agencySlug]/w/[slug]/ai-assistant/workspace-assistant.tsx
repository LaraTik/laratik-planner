"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  Copy,
  History,
  Library,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DirAwareInput } from "@/components/forms/dir-aware-textarea";
import { DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_ASSISTANT_RESPONSE_LOCALE,
  getBuiltInAssistantPrompts,
  type AssistantPromptParameter,
  type AssistantResponseLocale,
} from "@/features/workspace-assistant";
import { getAiModelDefinition } from "@/lib/ai/model-registry";
import {
  AssistantHistoryPanel,
  type AssistantConversationSummary,
} from "./assistant-history-panel";
import { AssistantMarkdown } from "./assistant-markdown";
import { AssistantResponsePanel } from "./assistant-response-panel";
import type { AssistantProposal, AssistantReply } from "./assistant-ui-types";
import {
  WorkspaceAssistantDashboard,
  type WorkspaceAssistantDashboardLabels,
  type WorkspaceAssistantMonthSnapshot,
} from "./workspace-assistant-dashboard";

type Labels = {
  emptyTitle: string;
  emptyDescription: string;
  summarize: string;
  findGaps: string;
  improve: string;
  placeholder: string;
  model: string;
  send: string;
  sending: string;
  assistant: string;
  you: string;
  evidence: string;
  source: string;
  capturedAt: string;
  itemCount: string;
  boundedData: string;
  completeData: string;
  limitations: string;
  error: string;
  privacy: string;
  readOnly: string;
  conversations: string;
  newConversation: string;
  searchConversations: string;
  rename: string;
  archive: string;
  renamePrompt: string;
  reasoning: string;
  reasoningLow: string;
  reasoningMedium: string;
  reasoningHigh: string;
  reasoningExtraHigh: string;
  reasoningMax: string;
  promptLibrary: string;
  createPrompt: string;
  promptName: string;
  promptPurpose: string;
  promptGoal: string;
  promptInstructions: string;
  promptTags: string;
  promptScope: string;
  promptPrivate: string;
  promptWorkspace: string;
  promptAgency: string;
  savePrompt: string;
  runPrompt: string;
  promptParameters: string;
  promptParametersHelp: string;
  promptParameterAdd: string;
  promptParameterRemove: string;
  promptParameterKey: string;
  promptParameterLabel: string;
  promptParameterType: string;
  promptParameterText: string;
  promptParameterMonth: string;
  promptParameterReference: string;
  promptParameterRequired: string;
  promptParameterDefault: string;
  promptParameterMissing: string;
  promptParameterInvalid: string;
  promptParameterResolved: string;
  promptParameterOptional: string;
  editPrompt: string;
  publishPrompt: string;
  promptPending: string;
  promptError: string;
  promptsLoading: string;
  promptsLoadError: string;
  retry: string;
  dismiss: string;
  showAllPrompts: string;
  showFewerPrompts: string;
  searchPrompts: string;
  archivePrompt: string;
  archivedConversations: string;
  activeConversations: string;
  restoreConversation: string;
  planPeriod: string;
  deleteConversation: string;
  confirmDelete: string;
  contentReference: string;
  contentReferenceHint: string;
  contentReferenceNotFound: string;
  chooseContentReference: string;
  useContentReference: string;
  selectedContent: string;
  reviewedPlan: string;
  proposedEdits: string;
  before: string;
  after: string;
  applyEdit: string;
  selectProposal: string;
  applySelectedEdits: string;
  applyingSelectedEdits: string;
  applyingEdit: string;
  rejectEdit: string;
  editApplied: string;
  editRejected: string;
  editStale: string;
  editExpired: string;
  editStatusError: string;
  activityContext: string;
  activitySkills: string;
  activityAnalysis: string;
  activityProvider: string;
  activityWriting: string;
  activityValidated: string;
  activityComplete: string;
  activityFailed: string;
  activityCancelled: string;
  runResultUnavailable: string;
  activityToolRunning: string;
  activityToolCompleted: string;
  activityToolFailed: string;
  activityToolPlanSummary: string;
  activityToolSchedule: string;
  activityToolContentMix: string;
  activityToolItems: string;
  activityToolSelectedItem: string;
  activityToolBrand: string;
  activityToolWorkload: string;
  stop: string;
  mode: string;
  modeAsk: string;
  modePlan: string;
  modeApply: string;
  modeAskDescription: string;
  modePlanDescription: string;
  modeApplyDescription: string;
  assistantHistory: string;
  toolsAndContext: string;
  responseLanguage: string;
  languageArabic: string;
  languageEnglish: string;
  pinConversation: string;
  unpinConversation: string;
  pinnedConversation: string;
  noConversations: string;
  noSearchResults: string;
  copyResponse: string;
  responseCopied: string;
  regenerateResponse: string;
  activityTimeline: string;
  conversationRestored: string;
  findings: string;
  recommendations: string;
  hideHistory: string;
  showHistory: string;
};

const assistantModelPreferenceEvent = "planner-assistant-model-preference";
const assistantModelPreferenceCache = new Map<string, string>();

function subscribeAssistantModelPreference(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(assistantModelPreferenceEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(assistantModelPreferenceEvent, onChange);
  };
}

function readAssistantModelPreference(key: string, permittedModels: string[], fallback: string) {
  let value: string | null = assistantModelPreferenceCache.get(key) ?? null;
  try {
    value ??= window.localStorage.getItem(key);
  } catch {
    // Use the in-memory preference cache when browser storage is unavailable.
  }
  return value && permittedModels.includes(value) ? value : fallback;
}

function saveAssistantModelPreference(key: string, model: string) {
  assistantModelPreferenceCache.set(key, model);
  try {
    window.localStorage.setItem(key, model);
  } catch {
    // The in-memory cache still preserves this tab's preference.
  }
  window.dispatchEvent(new Event(assistantModelPreferenceEvent));
}

type Message = { role: "user" | "assistant"; content: string };
type Conversation = AssistantConversationSummary;
type Prompt = {
  id: string;
  scope: "private" | "workspace" | "agency" | "builtin";
  status: "draft" | "pending_approval" | "published" | "archived";
  name: string;
  purpose: string;
  goal: string;
  instructions: string;
  tags: string[];
  parameters: AssistantPromptParameter[];
  ownerId: string | null;
  canEdit: boolean;
  canPublish: boolean;
};
type ContentCandidate = {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedPublishAt: string;
  revision: number;
};
type AssistantActivity =
  | "context_resolved"
  | "skills_selected"
  | "plan_analyzed"
  | "provider_started"
  | "response_delta"
  | "response_validated"
  | "complete"
  | "run_failed"
  | "run_cancelled"
  | { kind: "tool"; name: string; status: "started" | "completed" | "failed" };

function storedRunEventToActivity(event: {
  type: string;
  detail: unknown;
}): AssistantActivity | null {
  if (event.type === "run_started") return null;
  if (event.type === "run_completed") return "complete";
  if (event.type === "run_failed" || event.type === "run_cancelled") return event.type;
  if (event.type.startsWith("tool_")) {
    const detail = event.detail as { toolName?: unknown } | null;
    if (typeof detail?.toolName !== "string") return null;
    const status = event.type.slice("tool_".length);
    if (status !== "started" && status !== "completed" && status !== "failed") return null;
    return { kind: "tool", name: detail.toolName, status };
  }
  if (
    event.type === "context_resolved" ||
    event.type === "skills_selected" ||
    event.type === "plan_analyzed" ||
    event.type === "provider_started" ||
    event.type === "response_validated"
  ) {
    return event.type;
  }
  return null;
}

async function readAssistantEventStream(
  response: Response,
  onActivity: (event: AssistantActivity) => void,
  onAssistantText: (text: string) => void,
  onRunId: (runId: string) => void,
): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error("assistant_stream_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: Record<string, unknown> | null = null;
  const processFrame = (frame: string) => {
    const eventName = frame
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice(6)
      .trim();
    const data = frame
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!eventName || !data) return;
    const payload = JSON.parse(data) as Record<string, unknown>;
    if (eventName === "failed") {
      if (payload.code === "assistant_run_cancelled") {
        onActivity("run_cancelled");
        throw new Error("assistant_run_cancelled");
      }
      throw new Error("assistant_stream_failed");
    }
    if (eventName === "run_started" && typeof payload.runId === "string") {
      onRunId(payload.runId);
      return;
    }
    if (eventName === "complete") {
      const candidate = payload.result;
      if (!candidate || typeof candidate !== "object") throw new Error("assistant_stream_invalid");
      result = candidate as Record<string, unknown>;
      if (typeof result.runId === "string") onRunId(result.runId);
      onActivity("complete");
      return;
    }
    if (eventName === "assistant_text" && typeof payload.text === "string") {
      onAssistantText(payload.text);
      return;
    }
    if (
      ["tool_started", "tool_completed", "tool_failed"].includes(eventName) &&
      typeof payload.toolName === "string"
    ) {
      onActivity({
        kind: "tool",
        name: payload.toolName,
        status: eventName.slice("tool_".length) as "started" | "completed" | "failed",
      });
      return;
    }
    if (
      [
        "context_resolved",
        "skills_selected",
        "plan_analyzed",
        "provider_started",
        "response_delta",
        "response_validated",
        "run_failed",
        "run_cancelled",
      ].includes(eventName)
    ) {
      onActivity(eventName as AssistantActivity);
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
      let delimiter = buffer.indexOf("\n\n");
      while (delimiter >= 0) {
        processFrame(buffer.slice(0, delimiter));
        buffer = buffer.slice(delimiter + 2);
        delimiter = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
    if (buffer.trim()) processFrame(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new Error("assistant_stream_incomplete");
  return result;
}

export function WorkspaceAssistant({
  workspaceSlug,
  workspaceTimezone,
  locale,
  model,
  permittedModels,
  preferenceScope,
  currentMonth,
  canManageWorkspace,
  labels,
  dashboardLabels,
  dashboardSnapshot,
  previousDashboardSnapshot,
  statusLabels,
  formatLabels,
  itemHrefBase,
  knowledgeLibrary,
}: {
  workspaceSlug: string;
  workspaceTimezone: string;
  locale: string;
  model: string;
  permittedModels: string[];
  preferenceScope: string;
  currentMonth: string;
  canManageWorkspace: boolean;
  labels: Labels;
  dashboardLabels: WorkspaceAssistantDashboardLabels;
  dashboardSnapshot: WorkspaceAssistantMonthSnapshot;
  previousDashboardSnapshot: WorkspaceAssistantMonthSnapshot;
  statusLabels: Record<string, string>;
  formatLabels: Record<string, string>;
  itemHrefBase: string;
  knowledgeLibrary?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allowedModels = useMemo(
    () => (permittedModels.includes(model) ? permittedModels : [model]),
    [permittedModels, model],
  );
  const preferenceKey = `planner-assistant-model:${preferenceScope}`;
  const readModelSnapshot = useCallback(
    () => readAssistantModelPreference(preferenceKey, allowedModels, model),
    [preferenceKey, allowedModels, model],
  );
  const readModelServerSnapshot = useCallback(() => model, [model]);
  const selectedModel = useSyncExternalStore(
    subscribeAssistantModelPreference,
    readModelSnapshot,
    readModelServerSnapshot,
  );
  const modelCapabilities = getAiModelDefinition(selectedModel);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [archivedView, setArchivedView] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loadedPromptWorkspaceSlug, setLoadedPromptWorkspaceSlug] = useState<string | null>(null);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptsLoadError, setPromptsLoadError] = useState(false);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
  const [promptSearch, setPromptSearch] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [promptFormOpen, setPromptFormOpen] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptScope, setPromptScope] = useState<Prompt["scope"]>("private");
  const [promptName, setPromptName] = useState("");
  const [promptPurpose, setPromptPurpose] = useState("");
  const [promptGoal, setPromptGoal] = useState("");
  const [promptInstructions, setPromptInstructions] = useState("");
  const [promptTags, setPromptTags] = useState("");
  const [promptParameterDefinitions, setPromptParameterDefinitions] = useState<
    AssistantPromptParameter[]
  >([]);
  const [activePrompt, setActivePrompt] = useState<Prompt | null>(null);
  const [promptParameterValues, setPromptParameterValues] = useState<Record<string, string>>({});
  const [promptSaveError, setPromptSaveError] = useState(false);
  const [search, setSearch] = useState("");
  const requestedMonth = searchParams.get("month") ?? "";
  const requestedYear = Number(requestedMonth.slice(0, 4));
  const month =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) && requestedYear >= 1000 && requestedYear <= 9998
      ? requestedMonth
      : currentMonth;
  const [reasoningEffort, setReasoningEffort] = useState<
    "low" | "medium" | "high" | "xhigh" | "max"
  >("medium");
  const [mode, setMode] = useState<"ask" | "plan" | "apply">("ask");
  const [responseLocale, setResponseLocale] = useState<AssistantResponseLocale>(
    DEFAULT_ASSISTANT_RESPONSE_LOCALE,
  );
  const [draft, setDraft] = useState("");
  const [contentItemReference, setContentItemReference] = useState("");
  const [selectedContentItemId, setSelectedContentItemId] = useState<string | null>(null);
  const [contentCandidates, setContentCandidates] = useState<ContentCandidate[]>([]);
  const [contentReferenceNotFound, setContentReferenceNotFound] = useState(false);
  const [activity, setActivity] = useState<AssistantActivity[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [runOutputUnavailable, setRunOutputUnavailable] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [proposalError, setProposalError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copiedResponseIndex, setCopiedResponseIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const promptRequestRef = useRef<{
    workspaceSlug: string;
    promise: Promise<void>;
  } | null>(null);
  const activeRunStorageKey = `planner-assistant-run:${workspaceSlug}`;
  const inputId = useId();

  async function refreshVisibleConversations() {
    const response = await fetch(
      `/api/ai/workspace-assistant?workspaceSlug=${encodeURIComponent(workspaceSlug)}${archivedView ? "&archived=true" : ""}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: Conversation[] };
    setConversations(data.conversations);
  }

  const refreshPrompts = useCallback(() => {
    const existingRequest = promptRequestRef.current;
    if (existingRequest?.workspaceSlug === workspaceSlug) return existingRequest.promise;

    setPromptsLoading(true);
    setPromptsLoadError(false);
    const requestRecord: { workspaceSlug: string; promise: Promise<void> } = {
      workspaceSlug,
      promise: Promise.resolve(),
    };
    const request = (async () => {
      try {
        const response = await fetch(
          `/api/ai/workspace-assistant/prompts?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("assistant_prompt_list_failed");
        const data = (await response.json()) as { prompts: Prompt[] };
        if (promptRequestRef.current !== requestRecord) return;
        setPrompts(data.prompts);
        setLoadedPromptWorkspaceSlug(workspaceSlug);
      } catch {
        if (promptRequestRef.current === requestRecord) setPromptsLoadError(true);
      } finally {
        if (promptRequestRef.current === requestRecord) {
          setPromptsLoading(false);
          promptRequestRef.current = null;
        }
      }
    })();
    requestRecord.promise = request;
    promptRequestRef.current = requestRecord;
    return request;
  }, [workspaceSlug]);

  const rememberActiveRun = useCallback(
    (runId: string | null) => {
      activeRunIdRef.current = runId;
      setActiveRunId(runId);
      if (runId) window.sessionStorage.setItem(activeRunStorageKey, runId);
      else window.sessionStorage.removeItem(activeRunStorageKey);
    },
    [activeRunStorageKey],
  );

  async function changeMode(nextMode: "ask" | "plan" | "apply") {
    const previousMode = mode;
    setMode(nextMode);
    if (!conversationId) return;
    const response = await fetch(
      `/api/ai/workspace-assistant/${conversationId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      },
    );
    if (!response.ok) {
      setMode(previousMode);
      setError(true);
    }
  }

  function changeModel(nextModel: string) {
    if (!allowedModels.includes(nextModel)) return;
    saveAssistantModelPreference(preferenceKey, nextModel);
    const nextDefinition = getAiModelDefinition(nextModel);
    if (!nextDefinition?.reasoningEfforts.includes(reasoningEffort)) {
      setReasoningEffort("medium");
    }
  }

  function changeContentReference(value: string) {
    setContentItemReference(value);
    setSelectedContentItemId(null);
    setContentCandidates([]);
    setContentReferenceNotFound(false);
  }

  async function changeResponseLocale(nextLocale: AssistantResponseLocale) {
    if (nextLocale === responseLocale) return;
    if (!conversationId) {
      setResponseLocale(nextLocale);
      return;
    }
    const response = await fetch(
      `/api/ai/workspace-assistant/${conversationId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseLocale: nextLocale }),
      },
    );
    if (response.ok) setResponseLocale(nextLocale);
    else setError(true);
  }

  async function toggleConversationPin(id: string, pinned: boolean) {
    const response = await fetch(
      `/api/ai/workspace-assistant/${id}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      },
    );
    if (response.ok) void refreshVisibleConversations();
  }

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/ai/workspace-assistant?workspaceSlug=${encodeURIComponent(workspaceSlug)}${archivedView ? "&archived=true" : ""}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { conversations: Conversation[] };
        if (!cancelled) setConversations(data.conversations);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, archivedView]);

  useEffect(() => {
    if (loadedPromptWorkspaceSlug !== workspaceSlug) void refreshPrompts();
  }, [loadedPromptWorkspaceSlug, workspaceSlug, refreshPrompts]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(Date.now());
    updateTime();
    const intervalId = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const storedRunId = window.sessionStorage.getItem(activeRunStorageKey);
    if (!storedRunId || !/^[0-9a-f-]{36}$/i.test(storedRunId)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cursor = 0;
    let isFirstPage = true;
    activeRunIdRef.current = storedRunId;

    async function replayActivity() {
      try {
        const response = await fetch(
          `/api/ai/workspace-assistant/runs/${storedRunId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}&after=${cursor}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("assistant_run_not_found");
        const payload = (await response.json()) as {
          run: {
            status: string;
            events: { sequence: number; type: string; detail: unknown }[];
            nextSequence: number;
          };
        };
        if (cancelled) return;
        rememberActiveRun(storedRunId);
        setBusy(true);
        const recovered = payload.run.events
          .map(storedRunEventToActivity)
          .filter((event): event is AssistantActivity => event !== null);
        setActivity((current) => (isFirstPage ? recovered : [...current, ...recovered]));
        isFirstPage = false;
        cursor = payload.run.nextSequence;
        if (payload.run.status === "running") {
          timer = setTimeout(() => void replayActivity(), 900);
          return;
        }
        rememberActiveRun(null);
        setBusy(false);
        if (payload.run.status === "failed") setError(true);
        if (payload.run.status === "completed") setRunOutputUnavailable(true);
      } catch {
        if (cancelled) return;
        timer = setTimeout(() => void replayActivity(), 900);
      }
    }
    void replayActivity();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunStorageKey, rememberActiveRun, workspaceSlug]);

  async function stopRun() {
    const runId = activeRunIdRef.current;
    if (!runId) return;
    const response = await fetch(`/api/ai/workspace-assistant/runs/${runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceSlug, action: "cancel" }),
    }).catch(() => null);
    if (!response?.ok) setError(true);
  }

  async function copyResponse(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedResponseIndex(index);
      window.setTimeout(() => setCopiedResponseIndex(null), 1800);
    } catch {
      setError(true);
    }
  }
  const quickPrompts = [
    [labels.summarize, "لخّص خطة هذا الشهر وأبرز نقاط قوتها بالأدلة.", "ask"],
    [labels.findGaps, "حلّل فجوات الجدولة واشرح الأدلة التي تدعم النتيجة.", "ask"],
    [labels.improve, "اقترح تحسينات عملية لخطة هذا الشهر دون تنفيذ أي تعديل.", "plan"],
  ] as const;

  async function submit(
    event?: FormEvent<HTMLFormElement>,
    selected?: string,
    promptId?: string,
    selectedMode: "ask" | "plan" | "apply" = mode,
    regenerate = false,
  ) {
    event?.preventDefault();
    const message = (selected ?? draft).trim();
    if (!message || busy) return;
    const effectivePromptId = promptId ?? (selected === undefined ? selectedPromptId : undefined);
    const effectivePrompt = activePrompt?.id === effectivePromptId ? activePrompt : null;
    if (
      effectivePrompt?.parameters.some((parameter) => {
        const value = (promptParameterValues[parameter.key] ?? parameter.defaultValue ?? "").trim();
        return (
          (parameter.required && !value) ||
          (parameter.type === "month" && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
        );
      })
    ) {
      return;
    }
    const historyMessages = regenerate ? messages.slice(0, -2) : messages;
    const nextMessages = [...historyMessages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setDraft("");
    setBusy(true);
    setError(false);
    setSelectedProposalIds([]);
    setReply(null);
    setActivity([]);
    setRunOutputUnavailable(false);
    rememberActiveRun(null);
    setStreamingText("");
    const abortController = new AbortController();
    activeRequest.current = abortController;
    try {
      if (conversationId && selectedMode !== mode) {
        const modeResponse = await fetch(
          `/api/ai/workspace-assistant/${conversationId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: selectedMode }),
          },
        );
        if (!modeResponse.ok) throw new Error("conversation_mode_update_failed");
      }
      setMode(selectedMode);
      const response = await fetch("/api/ai/workspace-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        signal: abortController.signal,
        body: JSON.stringify({
          workspaceSlug,
          message,
          month,
          mode: selectedMode,
          model: selectedModel,
          responseLocale,
          history: historyMessages.slice(-8),
          ...(selectedContentItemId || contentItemReference.trim()
            ? { contentItemReference: selectedContentItemId ?? contentItemReference.trim() }
            : {}),
          ...(conversationId ? { conversationId } : {}),
          ...(effectivePromptId ? { promptId: effectivePromptId } : {}),
          ...(effectivePrompt?.parameters.length
            ? { promptParameters: promptParameterValues }
            : {}),
          ...(modelCapabilities?.reasoningEfforts.length ? { reasoningEffort } : {}),
        }),
      });
      const data = (
        (response.headers.get("content-type") ?? "").includes("text/event-stream")
          ? await readAssistantEventStream(
              response,
              (event) =>
                setActivity((current) =>
                  current.at(-1) === event ? current : [...current, event],
                ),
              (text) => setStreamingText((current) => current + text),
              (runId) => rememberActiveRun(runId),
            )
          : ((await response.json()) as
              | (AssistantReply & { conversationId: string; runId?: string })
              | {
                  error?: string;
                  resolution?:
                    | { status: "ambiguous"; candidates: ContentCandidate[] }
                    | { status: "not_found" };
                })
      ) as
        | (AssistantReply & { conversationId: string; runId?: string })
        | {
            error?: string;
            resolution?:
              { status: "ambiguous"; candidates: ContentCandidate[] } | { status: "not_found" };
          };
      if (response.ok && "resolution" in data && data.resolution) {
        setMessages(messages);
        setDraft(message);
        setContentCandidates(
          data.resolution.status === "ambiguous" ? data.resolution.candidates : [],
        );
        setContentReferenceNotFound(data.resolution.status === "not_found");
        return;
      }
      if (!response.ok || !("answer" in data)) throw new Error("assistant_request_failed");
      if ("runId" in data && data.runId) rememberActiveRun(data.runId);
      setConversationId(data.conversationId);
      if (data.reviewedPlanMonth) changeDashboardMonth(data.reviewedPlanMonth);
      setReply(data);
      setStreamingText("");
      setMessages([...nextMessages, { role: "assistant", content: data.answer.answer }]);
      rememberActiveRun(null);
      setContentCandidates([]);
      setContentReferenceNotFound(false);
      setContentItemReference("");
      setSelectedContentItemId(null);
      setSelectedPromptId(null);
      setActivePrompt(null);
      setPromptParameterValues({});
      void refreshVisibleConversations();
    } catch (caught) {
      if (caught instanceof Error && caught.message === "assistant_run_cancelled") {
        setActivity((current) =>
          current.includes("run_cancelled") ? current : [...current, "run_cancelled"],
        );
        setError(false);
        setStreamingText("");
        rememberActiveRun(null);
      } else if (abortController.signal.aborted) {
        setMessages(messages);
        setDraft(message);
        setStreamingText("");
      } else {
        setError(true);
        setMessages(nextMessages);
        setStreamingText("");
      }
    } finally {
      if (activeRequest.current === abortController) activeRequest.current = null;
      setBusy(false);
    }
  }

  async function openConversation(id: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/ai/workspace-assistant/${id}?workspaceSlug=${encodeURIComponent(workspaceSlug)}${archivedView ? "&archived=true" : ""}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("conversation_load_failed");
      const data = (await response.json()) as {
        conversation: {
          id: string;
          mode: "ask" | "plan" | "apply";
          responseLocale: AssistantResponseLocale;
          messages: { role: string; content: string; metadata: Record<string, unknown> | null }[];
          proposals: AssistantProposal[];
        };
      };
      setConversationId(data.conversation.id);
      setMode(data.conversation.mode);
      setResponseLocale(data.conversation.responseLocale);
      setContentItemReference("");
      setSelectedContentItemId(null);
      setStreamingText("");
      setMessages(
        data.conversation.messages
          .filter(
            (item): item is typeof item & { role: "user" | "assistant" } =>
              item.role === "user" || item.role === "assistant",
          )
          .map(({ role, content }) => ({ role, content })),
      );
      setReply(
        data.conversation.proposals.length
          ? {
              answer: {
                answer: "",
                findings: [],
                recommendations: [],
                proposedChanges: [],
                limitations: [],
              },
              evidence: [],
              deterministicFindings: [],
              proposals: data.conversation.proposals,
            }
          : null,
      );
      setError(false);
      setMobileHistoryOpen(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function beginPrompt(prompt?: Prompt) {
    setEditingPromptId(prompt?.id ?? null);
    setPromptScope(prompt?.scope ?? "private");
    setPromptName(prompt?.name ?? "");
    setPromptPurpose(prompt?.purpose ?? "");
    setPromptGoal(prompt?.goal ?? "");
    setPromptInstructions(prompt?.instructions ?? "");
    setPromptTags(prompt?.tags.join(", ") ?? "");
    setPromptParameterDefinitions(prompt?.parameters ?? []);
    setPromptSaveError(false);
    setPromptFormOpen(true);
  }

  async function savePrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = {
      name: promptName,
      purpose: promptPurpose,
      goal: promptGoal,
      instructions: promptInstructions,
      tags: promptTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      parameters: promptParameterDefinitions,
    };
    if (
      promptParameterDefinitions.some(
        (parameter) => !parameter.key.trim() || !parameter.label.trim(),
      )
    ) {
      setPromptSaveError(true);
      return;
    }
    try {
      const url = editingPromptId
        ? `/api/ai/workspace-assistant/prompts/${editingPromptId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`
        : "/api/ai/workspace-assistant/prompts";
      const response = await fetch(url, {
        method: editingPromptId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingPromptId
            ? { action: "save", prompt }
            : { workspaceSlug, prompt: { ...prompt, scope: promptScope } },
        ),
      });
      if (!response.ok) throw new Error("prompt_save_failed");
      setPromptFormOpen(false);
      await refreshPrompts();
    } catch {
      setPromptSaveError(true);
    }
  }

  async function publishPrompt(promptId: string) {
    const response = await fetch(
      `/api/ai/workspace-assistant/prompts/${promptId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      },
    );
    if (response.ok) await refreshPrompts();
    else setPromptSaveError(true);
  }

  async function archivePrompt(promptId: string) {
    const response = await fetch(
      `/api/ai/workspace-assistant/prompts/${promptId}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      { method: "DELETE" },
    );
    if (response.ok) await refreshPrompts();
    else setPromptSaveError(true);
  }

  async function renameConversation(id: string, currentTitle: string) {
    const title = window.prompt(labels.renamePrompt, currentTitle)?.trim();
    if (!title) return;
    const response = await fetch(
      `/api/ai/workspace-assistant/${id}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    if (response.ok) void refreshVisibleConversations();
  }

  async function archiveConversation(id: string) {
    const response = await fetch(
      `/api/ai/workspace-assistant/${id}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      },
    );
    if (response.ok) {
      if (conversationId === id) startNewConversation();
      void refreshVisibleConversations();
    }
  }

  async function deleteConversation(id: string) {
    if (!window.confirm(labels.confirmDelete)) return;
    const response = await fetch(
      `/api/ai/workspace-assistant/${id}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      { method: "DELETE" },
    );
    if (response.ok) {
      if (conversationId === id) startNewConversation();
      void refreshVisibleConversations();
    }
  }

  async function restoreConversation(id: string) {
    const response = await fetch(
      `/api/ai/workspace-assistant/${id}?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      },
    );
    if (response.ok) {
      if (conversationId === id) startNewConversation();
      void refreshVisibleConversations();
    }
  }

  async function decideProposal(proposalId: string, decision: "apply" | "reject") {
    setProposalError(false);
    setReply((current) =>
      current
        ? {
            ...current,
            proposals: current.proposals.map((proposal) =>
              proposal.id === proposalId ? { ...proposal, status: "applying" } : proposal,
            ),
          }
        : current,
    );
    try {
      const response = await fetch(`/api/ai/workspace-assistant/proposals/${proposalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSlug, decision }),
      });
      const result = (await response.json()) as { status?: AssistantProposal["status"] };
      if (!response.ok || !result.status) throw new Error("proposal_decision_failed");
      const status = result.status === "already_applied" ? "applied" : result.status;
      setReply((current) =>
        current
          ? {
              ...current,
              proposals: current.proposals.map((proposal) =>
                proposal.id === proposalId ? { ...proposal, status } : proposal,
              ),
            }
          : current,
      );
    } catch {
      setProposalError(true);
      setReply((current) =>
        current
          ? {
              ...current,
              proposals: current.proposals.map((proposal) =>
                proposal.id === proposalId ? { ...proposal, status: "proposed" } : proposal,
              ),
            }
          : current,
      );
    }
  }

  async function applySelectedProposals(proposalIds: string[]) {
    if (proposalIds.length < 2 || proposalIds.length > 10 || mode !== "apply") return;
    setProposalError(false);
    setReply((current) =>
      current
        ? {
            ...current,
            proposals: current.proposals.map((proposal) =>
              proposalIds.includes(proposal.id) ? { ...proposal, status: "applying" } : proposal,
            ),
          }
        : current,
    );
    try {
      const response = await fetch("/api/ai/workspace-assistant/proposals/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSlug, proposalIds }),
      });
      const result = (await response.json()) as {
        status?: AssistantProposal["status"] | "conflict" | "invalid_batch";
        proposalStatuses?: Array<{ id: string; status: AssistantProposal["status"] }>;
      };
      if (!response.ok || !result.status) throw new Error("proposal_batch_failed");
      if (result.status === "invalid_batch") throw new Error("proposal_batch_invalid");
      if (result.status === "conflict") {
        if (!result.proposalStatuses) throw new Error("proposal_batch_conflict_state_missing");
        const statuses = new Map(
          result.proposalStatuses.map(({ id, status }) => [id, status] as const),
        );
        setReply((current) =>
          current
            ? {
                ...current,
                proposals: current.proposals.map((proposal) => ({
                  ...proposal,
                  status: statuses.get(proposal.id) ?? proposal.status,
                })),
              }
            : current,
        );
        setSelectedProposalIds([]);
        return;
      }
      const status = result.status === "already_applied" ? "applied" : result.status;
      setReply((current) =>
        current
          ? {
              ...current,
              proposals: current.proposals.map((proposal) =>
                proposalIds.includes(proposal.id) ? { ...proposal, status } : proposal,
              ),
            }
          : current,
      );
      setSelectedProposalIds([]);
    } catch {
      setProposalError(true);
      setReply((current) =>
        current
          ? {
              ...current,
              proposals: current.proposals.map((proposal) =>
                proposalIds.includes(proposal.id) ? { ...proposal, status: "proposed" } : proposal,
              ),
            }
          : current,
      );
    }
  }

  function startNewConversation() {
    rememberActiveRun(null);
    setConversationId(null);
    setArchivedView(false);
    setSelectedPromptId(null);
    setActivePrompt(null);
    setPromptParameterValues({});
    setMessages([]);
    setSelectedProposalIds([]);
    setReply(null);
    setRunOutputUnavailable(false);
    setProposalError(false);
    setDraft("");
    setStreamingText("");
    setContentItemReference("");
    setSelectedContentItemId(null);
    setContentCandidates([]);
    setContentReferenceNotFound(false);
    setMode("ask");
    setResponseLocale(DEFAULT_ASSISTANT_RESPONSE_LOCALE);
    setMobileHistoryOpen(false);
    setError(false);
  }

  const promptParametersReady =
    activePrompt?.id !== selectedPromptId ||
    activePrompt.parameters.every((parameter) => {
      const value = (promptParameterValues[parameter.key] ?? parameter.defaultValue ?? "").trim();
      return (
        (!parameter.required || Boolean(value)) &&
        (parameter.type !== "month" || !value || /^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      );
    });
  const builtInPrompts: Prompt[] = getBuiltInAssistantPrompts(locale).map((prompt) => ({
    ...prompt,
    scope: "builtin",
    status: "published",
    ownerId: null,
    parameters: prompt.parameters ?? [],
    canEdit: false,
    canPublish: false,
  }));
  const workspacePrompts = loadedPromptWorkspaceSlug === workspaceSlug ? prompts : [];
  const displayedPrompts = [...workspacePrompts, ...builtInPrompts];
  function changeDashboardMonth(nextMonth: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMonth)) return;
    const query = new URLSearchParams(searchParams.toString());
    if (nextMonth === currentMonth) query.delete("month");
    else query.set("month", nextMonth);
    const queryString = query.toString();
    router.replace(`${pathname}${queryString ? `?${queryString}` : ""}`, { scroll: false });
  }
  function selectDashboardPrompt(promptId: string) {
    const prompt = displayedPrompts.find((item) => item.id === promptId);
    if (!prompt) return;
    setSelectedPromptId(prompt.id);
    setActivePrompt(prompt);
    setPromptParameterValues(
      Object.fromEntries(
        prompt.parameters
          .filter((parameter) => parameter.defaultValue)
          .map((parameter) => [parameter.key, parameter.defaultValue ?? ""]),
      ),
    );
    setDraft(prompt.goal);
    setMode("ask");
  }
  const filteredPrompts = displayedPrompts.filter((prompt) => {
    const query = promptSearch.trim().toLocaleLowerCase(locale);
    return (
      !query ||
      [prompt.name, prompt.purpose, prompt.goal, ...prompt.tags]
        .join(" ")
        .toLocaleLowerCase(locale)
        .includes(query)
    );
  });
  const promptsToDisplay =
    showAllPrompts || promptSearch.trim() ? filteredPrompts : filteredPrompts.slice(0, 6);
  const showDashboardComposer = !conversationId && messages.length === 0;
  const selectedProposals =
    reply?.proposals.filter((proposal) => selectedProposalIds.includes(proposal.id)) ?? [];
  const canApplySelectedProposals =
    selectedProposals.length >= 2 &&
    selectedProposals.length <= 10 &&
    new Set(selectedProposals.map((proposal) => proposal.contentItemId)).size <= 5 &&
    selectedProposals.every((proposal, index) =>
      selectedProposals
        .slice(index + 1)
        .every(
          (other) =>
            other.contentItemId !== proposal.contentItemId || other.field !== proposal.field,
        ),
    ) &&
    selectedProposals.every(
      (proposal) =>
        proposal.status === "proposed" &&
        currentTime > 0 &&
        new Date(proposal.expiresAt).getTime() > currentTime,
    );

  return (
    <section className="space-y-4" aria-label={labels.assistant}>
      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="max-h-[85vh] w-[min(64rem,calc(100vw-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{labels.toolsAndContext}</DialogTitle>
            <DialogDescription>{labels.emptyDescription}</DialogDescription>
          </DialogHeader>
          <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-title-card text-fg-primary font-semibold">
                  {labels.promptLibrary}
                </h2>
                <p className="text-label text-fg-secondary mt-1">{labels.emptyDescription}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => beginPrompt()}>
                {labels.createPrompt}
              </Button>
            </div>
            <div className="border-border mt-3 flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-3">
              <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
              <DirAwareInput
                locale={locale}
                value={promptSearch}
                onChange={(event) => setPromptSearch(event.target.value)}
                placeholder={labels.searchPrompts}
                aria-label={labels.searchPrompts}
                className="text-body min-h-10 min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            {promptsLoading ? (
              <p className="text-label text-fg-muted mt-3" role="status">
                {labels.promptsLoading}
              </p>
            ) : null}
            {promptsLoadError ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2" role="alert">
                <p className="text-body text-danger">{labels.promptsLoadError}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshPrompts()}
                >
                  {labels.retry}
                </Button>
              </div>
            ) : null}
            {promptFormOpen ? (
              <form
                className="border-border mt-4 grid gap-3 border-t pt-4"
                onSubmit={(event) => void savePrompt(event)}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <PromptField
                    label={labels.promptName}
                    value={promptName}
                    onChange={setPromptName}
                    locale={locale}
                  />
                  <PromptField
                    label={labels.promptPurpose}
                    value={promptPurpose}
                    onChange={setPromptPurpose}
                    locale={locale}
                  />
                </div>
                <PromptField
                  label={labels.promptGoal}
                  value={promptGoal}
                  onChange={setPromptGoal}
                  locale={locale}
                />
                <label className="text-label text-fg-secondary grid gap-1">
                  {labels.promptInstructions}
                  <DirAwareTextarea
                    locale={locale}
                    value={promptInstructions}
                    onChange={(event) => setPromptInstructions(event.target.value)}
                    rows={4}
                    maxLength={12_000}
                    required
                    className="border-border bg-surface text-body min-h-24 rounded-[var(--radius-control)] border px-3 py-2"
                  />
                </label>
                <PromptField
                  label={labels.promptTags}
                  value={promptTags}
                  onChange={setPromptTags}
                  locale={locale}
                />
                <fieldset className="border-border grid gap-3 rounded-[var(--radius-control)] border p-3">
                  <legend className="text-body text-fg-primary px-1 font-semibold">
                    {labels.promptParameters}
                  </legend>
                  <p className="text-label text-fg-muted">{labels.promptParametersHelp}</p>
                  {promptParameterDefinitions.map((parameter, index) => (
                    <div
                      key={`${parameter.key}-${index}`}
                      className="border-border grid gap-2 rounded-[var(--radius-control)] border p-3 sm:grid-cols-2"
                    >
                      <PromptField
                        label={labels.promptParameterKey}
                        value={parameter.key}
                        onChange={(key) =>
                          setPromptParameterDefinitions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, key: key.toLowerCase().replace(/[^a-z0-9_]/g, "_") }
                                : item,
                            ),
                          )
                        }
                        locale={locale}
                      />
                      <PromptField
                        label={labels.promptParameterLabel}
                        value={parameter.label}
                        onChange={(label) =>
                          setPromptParameterDefinitions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, label } : item,
                            ),
                          )
                        }
                        locale={locale}
                      />
                      <label className="text-label text-fg-secondary grid gap-1">
                        {labels.promptParameterType}
                        <select
                          value={parameter.type}
                          onChange={(event) =>
                            setPromptParameterDefinitions((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      type: event.target.value as AssistantPromptParameter["type"],
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-3"
                        >
                          <option value="text">{labels.promptParameterText}</option>
                          <option value="month">{labels.promptParameterMonth}</option>
                          <option value="content_reference">
                            {labels.promptParameterReference}
                          </option>
                        </select>
                      </label>
                      <PromptField
                        label={labels.promptParameterDefault}
                        value={parameter.defaultValue ?? ""}
                        required={false}
                        maxLength={500}
                        onChange={(defaultValue) =>
                          setPromptParameterDefinitions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    ...(defaultValue
                                      ? { defaultValue }
                                      : { defaultValue: undefined }),
                                  }
                                : item,
                            ),
                          )
                        }
                        locale={locale}
                      />
                      <div className="flex min-h-11 items-center justify-between gap-3 sm:col-span-2">
                        <label
                          htmlFor={`prompt-parameter-required-${index}`}
                          className="text-label text-fg-secondary flex min-h-11 items-center gap-2"
                        >
                          <Checkbox
                            id={`prompt-parameter-required-${index}`}
                            checked={parameter.required}
                            onCheckedChange={(checked) =>
                              setPromptParameterDefinitions((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, required: checked === true }
                                    : item,
                                ),
                              )
                            }
                          />
                          {labels.promptParameterRequired}
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`${labels.promptParameterRemove} ${index + 1}`}
                          onClick={() =>
                            setPromptParameterDefinitions((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          {labels.promptParameterRemove}
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={promptParameterDefinitions.length >= 8}
                    onClick={() =>
                      setPromptParameterDefinitions((current) => [
                        ...current,
                        { key: "", type: "text", label: "", required: false },
                      ])
                    }
                  >
                    {labels.promptParameterAdd}
                  </Button>
                </fieldset>
                {!editingPromptId ? (
                  <label className="text-label text-fg-secondary grid gap-1">
                    {labels.promptScope}
                    <select
                      value={promptScope}
                      onChange={(event) => setPromptScope(event.target.value as Prompt["scope"])}
                      className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-3"
                    >
                      <option value="private">{labels.promptPrivate}</option>
                      {canManageWorkspace ? (
                        <option value="workspace">{labels.promptWorkspace}</option>
                      ) : null}
                      <option value="agency">{labels.promptAgency}</option>
                    </select>
                  </label>
                ) : null}
                {promptSaveError ? (
                  <p role="alert" className="text-body text-danger">
                    {labels.promptError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">{labels.savePrompt}</Button>
                  <Button type="button" variant="outline" onClick={() => setPromptFormOpen(false)}>
                    {labels.dismiss}
                  </Button>
                </div>
              </form>
            ) : null}
            {filteredPrompts.length ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {promptsToDisplay.map((prompt) => (
                  <li
                    key={prompt.id}
                    className="border-border flex flex-col rounded-[var(--radius-control)] border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-body text-fg-primary font-semibold">{prompt.name}</h3>
                        <p className="text-label text-fg-secondary mt-1">{prompt.purpose}</p>
                      </div>
                      {prompt.status === "pending_approval" ? (
                        <span className="text-label text-fg-muted">{labels.promptPending}</span>
                      ) : null}
                    </div>
                    <p className="text-label text-fg-secondary mt-2">{prompt.goal}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {prompt.tags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-surface-subtle text-label rounded-full px-2 py-1"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setSelectedPromptId(prompt.id);
                          setActivePrompt(prompt);
                          setPromptParameterValues(
                            Object.fromEntries(
                              prompt.parameters
                                .filter((parameter) => parameter.defaultValue)
                                .map((parameter) => [parameter.key, parameter.defaultValue ?? ""]),
                            ),
                          );
                          setDraft(prompt.goal);
                          setToolsOpen(false);
                        }}
                      >
                        {labels.runPrompt}
                      </Button>
                      {prompt.canEdit ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => beginPrompt(prompt)}
                          >
                            {labels.editPrompt}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void archivePrompt(prompt.id)}
                          >
                            {labels.archivePrompt}
                          </Button>
                        </>
                      ) : null}
                      {prompt.canPublish && prompt.status !== "published" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void publishPrompt(prompt.id)}
                        >
                          {labels.publishPrompt}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {filteredPrompts.length === 0 ? (
              <p className="text-body text-fg-muted bg-surface-subtle mt-4 rounded-[var(--radius-control)] p-4">
                {labels.noSearchResults}
              </p>
            ) : null}
            {!promptSearch.trim() && filteredPrompts.length > 6 ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setShowAllPrompts((current) => !current)}
              >
                {showAllPrompts ? labels.showFewerPrompts : labels.showAllPrompts}
              </Button>
            ) : null}
          </div>
          {knowledgeLibrary}
        </DialogContent>
      </Dialog>
      <WorkspaceAssistantDashboard
        workspaceSlug={workspaceSlug}
        workspaceTimezone={workspaceTimezone}
        locale={locale}
        month={month}
        snapshot={dashboardSnapshot}
        previousSnapshot={previousDashboardSnapshot}
        prompts={displayedPrompts}
        labels={dashboardLabels}
        draft={draft}
        busy={busy || archivedView}
        canSubmit={promptParametersReady && contentCandidates.length === 0}
        promptParameters={activePrompt?.id === selectedPromptId ? activePrompt.parameters : []}
        promptParameterValues={promptParameterValues}
        promptParameterLabels={{
          title: labels.promptParameters,
          invalid: labels.promptParameterInvalid,
          missing: labels.promptParameterMissing,
          resolved: labels.promptParameterResolved,
          optional: labels.promptParameterOptional,
        }}
        onPromptParameterValueChange={(key, value) =>
          setPromptParameterValues((current) => ({ ...current, [key]: value }))
        }
        onDraftChange={setDraft}
        contentItemReference={contentItemReference}
        onContentReferenceChange={changeContentReference}
        contentReferenceAttached={Boolean(selectedContentItemId)}
        contentCandidates={contentCandidates}
        contentReferenceNotFound={contentReferenceNotFound}
        contentReferenceLabels={{
          notFound: labels.contentReferenceNotFound,
          choose: labels.chooseContentReference,
          use: labels.useContentReference,
        }}
        onSelectContentCandidate={(candidate) => {
          setContentItemReference(candidate.title);
          setSelectedContentItemId(candidate.id);
          setContentCandidates([]);
          setContentReferenceNotFound(false);
        }}
        onSubmit={(event) => void submit(event)}
        onMonthChange={changeDashboardMonth}
        onGenerateReport={() => void submit(undefined, quickPrompts[0][1], undefined, "ask")}
        onSelectPrompt={selectDashboardPrompt}
        onOpenKnowledge={() => {
          setToolsOpen(true);
          window.setTimeout(() => {
            document
              .querySelector('[data-testid="assistant-knowledge-library"]')
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 180);
        }}
        onOpenTools={() => setToolsOpen(true)}
        recentConversations={archivedView ? [] : conversations}
        currentConversationId={conversationId}
        onOpenConversation={(id) => {
          setMobileHistoryOpen(false);
          void openConversation(id);
        }}
        onShowConversationHistory={() => {
          if (window.matchMedia("(min-width: 1024px)").matches) setHistoryVisible(true);
          else setMobileHistoryOpen(true);
        }}
        showComposer={showDashboardComposer}
        responseLocale={responseLocale}
        onResponseLocaleChange={(nextLocale) => void changeResponseLocale(nextLocale)}
        mode={mode}
        onModeChange={(nextMode) => void changeMode(nextMode)}
        selectedModel={selectedModel}
        permittedModels={allowedModels}
        onModelChange={changeModel}
        formatLabels={formatLabels}
        statusLabels={statusLabels}
        itemHrefBase={itemHrefBase}
      />
      <div
        className={`grid min-h-0 gap-4 ${historyVisible ? "lg:grid-cols-[minmax(0,1fr)_minmax(15rem,18rem)]" : "lg:grid-cols-1"}`}
      >
        <main className="flex min-w-0 flex-col gap-4" dir={locale === "ar" ? "rtl" : "ltr"}>
          {messages.length > 0 || conversationId ? (
            <header className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border p-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label={labels.assistantHistory}
                  title={labels.assistantHistory}
                  onClick={() => setMobileHistoryOpen(true)}
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="hidden lg:inline-flex"
                  aria-label={historyVisible ? labels.hideHistory : labels.showHistory}
                  title={historyVisible ? labels.hideHistory : labels.showHistory}
                  onClick={() => setHistoryVisible((current) => !current)}
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div className="min-w-0">
                  <h2 className="text-title-card text-fg-primary truncate font-semibold">
                    {conversationId
                      ? (conversations.find((item) => item.id === conversationId)?.title ??
                        labels.assistant)
                      : labels.newConversation}
                  </h2>
                  {conversationId && messages.length === 0 ? (
                    <p className="text-label text-fg-muted">{labels.conversationRestored}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-label text-fg-secondary flex items-center gap-2">
                  <span>{labels.responseLanguage}</span>
                  <select
                    value={responseLocale}
                    onChange={(event) =>
                      void changeResponseLocale(event.target.value as AssistantResponseLocale)
                    }
                    className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
                    aria-label={labels.responseLanguage}
                  >
                    <option value="ar">{labels.languageArabic}</option>
                    <option value="en">{labels.languageEnglish}</option>
                  </select>
                </label>
                <Button type="button" variant="outline" onClick={() => setToolsOpen(true)}>
                  <Library className="h-4 w-4" aria-hidden="true" />
                  {labels.toolsAndContext}
                </Button>
              </div>
            </header>
          ) : null}
          {messages.length > 0 || busy || reply ? (
            <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-6">
              {messages.length === 0 ? (
                <div className="mx-auto max-w-2xl py-5 text-center">
                  <span className="bg-primary-subtle text-primary mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="text-title-section text-fg-primary font-semibold">
                    {labels.emptyTitle}
                  </h2>
                  <p className="text-body text-fg-secondary mx-auto mt-2 max-w-xl">
                    {labels.emptyDescription}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {quickPrompts.map(([label, prompt, promptMode]) => (
                      <Button
                        key={label}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setMode(promptMode);
                          void submit(undefined, prompt, undefined, promptMode);
                        }}
                        disabled={busy || archivedView}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <ol className="mx-auto max-w-3xl space-y-4" aria-live="polite">
                  {messages.map((message, index) => (
                    <li
                      key={`${message.role}-${index}`}
                      className={message.role === "user" ? "ms-auto max-w-[85%]" : "max-w-[95%]"}
                    >
                      <p className="text-label text-fg-muted mb-1 font-semibold">
                        {message.role === "user" ? labels.you : labels.assistant}
                      </p>
                      <div
                        className={`text-body rounded-[var(--radius-control)] px-3 py-2 ${message.role === "user" ? "bg-primary-subtle text-fg-primary" : "bg-surface-subtle text-fg-primary"}`}
                      >
                        {message.role === "assistant" ? (
                          <AssistantMarkdown content={message.content} />
                        ) : (
                          <p className="whitespace-pre-wrap" dir="auto">
                            {message.content}
                          </p>
                        )}
                      </div>
                      {message.role === "assistant" && index === messages.length - 1 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void copyResponse(message.content, index)}
                          >
                            <Copy className="h-4 w-4" aria-hidden="true" />
                            {copiedResponseIndex === index
                              ? labels.responseCopied
                              : labels.copyResponse}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy || archivedView}
                            onClick={() =>
                              void submit(
                                undefined,
                                messages.at(-2)?.content,
                                undefined,
                                mode,
                                true,
                              )
                            }
                          >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            {labels.regenerateResponse}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {busy ? (
                    <li role="status" className="text-body text-fg-muted">
                      {labels.sending}
                    </li>
                  ) : null}
                  {busy && streamingText ? (
                    <li className="max-w-[95%]">
                      <p className="text-label text-fg-muted mb-1 font-semibold">
                        {labels.assistant}
                      </p>
                      <div
                        className="bg-surface-subtle text-body text-fg-primary rounded-[var(--radius-control)] px-3 py-2"
                        aria-label={labels.activityWriting}
                      >
                        <AssistantMarkdown content={streamingText} />
                      </div>
                    </li>
                  ) : null}
                </ol>
              )}

              {error ? (
                <p role="alert" className="text-body text-danger mt-4">
                  {labels.error}
                </p>
              ) : null}
              {activity.length ? (
                <details
                  className="border-border mx-auto mt-4 max-w-3xl rounded-[var(--radius-control)] border px-3 py-2"
                  open={busy}
                >
                  <summary className="text-label text-fg-secondary cursor-pointer font-semibold">
                    {labels.activityTimeline}
                  </summary>
                  <ol
                    className="border-border mt-2 space-y-1 border-s-2 ps-3"
                    aria-live="polite"
                    aria-label={labels.activityProvider}
                  >
                    {activity.map((event, index) => (
                      <li
                        key={`${typeof event === "string" ? event : `${event.name}-${event.status}`}-${index}`}
                        className="text-label text-fg-muted"
                      >
                        {typeof event === "object"
                          ? `${event.status === "started" ? labels.activityToolRunning : event.status === "completed" ? labels.activityToolCompleted : labels.activityToolFailed}: ${event.name === "planner_get_plan_summary" ? labels.activityToolPlanSummary : event.name === "planner_get_calendar_distribution" ? labels.activityToolSchedule : event.name === "planner_get_content_mix" ? labels.activityToolContentMix : event.name === "planner_get_workload_summary" ? labels.activityToolWorkload : event.name === "planner_list_plan_items" ? labels.activityToolItems : event.name === "planner_read_selected_content_item" ? labels.activityToolSelectedItem : event.name === "planner_get_brand_guidance" ? labels.activityToolBrand : "Planner context"}`
                          : event === "context_resolved"
                            ? labels.activityContext
                            : event === "skills_selected"
                              ? labels.activitySkills
                              : event === "plan_analyzed"
                                ? labels.activityAnalysis
                                : event === "provider_started"
                                  ? labels.activityProvider
                                  : event === "response_delta"
                                    ? labels.activityWriting
                                    : event === "response_validated"
                                      ? labels.activityValidated
                                      : event === "run_failed"
                                        ? labels.activityFailed
                                        : event === "run_cancelled"
                                          ? labels.activityCancelled
                                          : labels.activityComplete}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
              {runOutputUnavailable ? (
                <p role="status" className="text-label text-fg-muted mx-auto mt-2 max-w-3xl">
                  {labels.runResultUnavailable}
                </p>
              ) : null}

              {contentReferenceNotFound ? (
                <p role="alert" className="text-body text-danger mt-4">
                  {labels.contentReferenceNotFound}
                </p>
              ) : null}
              {contentCandidates.length ? (
                <section
                  className="border-border mx-auto mt-4 max-w-3xl rounded-[var(--radius-control)] border p-3"
                  aria-label={labels.chooseContentReference}
                >
                  <h3 className="text-body text-fg-primary font-semibold">
                    {labels.chooseContentReference}
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
                          onClick={() => {
                            setContentItemReference(candidate.title);
                            setSelectedContentItemId(candidate.id);
                            setContentCandidates([]);
                            setContentReferenceNotFound(false);
                          }}
                        >
                          {labels.useContentReference}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {reply ? (
                <AssistantResponsePanel
                  reply={reply}
                  locale={locale}
                  workspaceTimezone={workspaceTimezone}
                  currentTime={currentTime}
                  labels={labels}
                  mode={mode}
                  selectedProposalIds={selectedProposalIds}
                  selectedProposals={selectedProposals}
                  canApplySelectedProposals={canApplySelectedProposals}
                  proposalError={proposalError}
                  onSelectProposal={(proposalId, selected) =>
                    setSelectedProposalIds((current) =>
                      selected
                        ? [...new Set([...current, proposalId])]
                        : current.filter((id) => id !== proposalId),
                    )
                  }
                  onApplySelectedProposals={(proposalIds) =>
                    void applySelectedProposals(proposalIds)
                  }
                  onDecideProposal={(proposalId, decision) =>
                    void decideProposal(proposalId, decision)
                  }
                />
              ) : null}
            </div>
          ) : null}
          <details className="border-border bg-surface rounded-[var(--radius-card)] border p-3">
            <summary className="text-label text-fg-secondary cursor-pointer font-semibold">
              {dashboardLabels.advancedOptions}
            </summary>
            <form
              className="border-border bg-surface flex flex-wrap items-end gap-2 rounded-[var(--radius-card)] border p-3"
              onSubmit={(event) => void submit(event)}
            >
              <label className="text-label text-fg-secondary flex min-w-36 flex-col gap-1">
                <span>{labels.mode}</span>
                <select
                  value={mode}
                  onChange={(event) => void changeMode(event.target.value as typeof mode)}
                  className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
                  disabled={busy || archivedView}
                  aria-describedby="workspace-assistant-mode-description"
                  data-testid="assistant-mode"
                >
                  <option value="ask">{labels.modeAsk}</option>
                  <option value="plan">{labels.modePlan}</option>
                  <option value="apply">{labels.modeApply}</option>
                </select>
              </label>
              <label className="text-label text-fg-secondary flex min-w-36 flex-col gap-1">
                <span>{labels.contentReference}</span>
                <DirAwareInput
                  locale={locale}
                  value={contentItemReference}
                  onChange={(event) => changeContentReference(event.target.value)}
                  placeholder={labels.contentReferenceHint}
                  maxLength={500}
                  className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
                  disabled={busy || archivedView}
                />
              </label>
              <label className="text-label text-fg-secondary flex shrink-0 flex-col gap-1">
                <span>{labels.planPeriod}</span>
                <input
                  type="month"
                  value={month}
                  onChange={(event) => changeDashboardMonth(event.target.value)}
                  className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
                />
              </label>
              {activePrompt?.id === selectedPromptId && activePrompt.parameters.length ? (
                <fieldset
                  className="border-border grid w-full gap-3 rounded-[var(--radius-control)] border p-3"
                  data-testid="assistant-prompt-parameters"
                >
                  <legend className="text-body text-fg-primary px-1 font-semibold">
                    {labels.promptParameters}
                  </legend>
                  {activePrompt.parameters.map((parameter) => {
                    const value =
                      promptParameterValues[parameter.key] ?? parameter.defaultValue ?? "";
                    const invalidMonth =
                      parameter.type === "month" &&
                      Boolean(value) &&
                      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
                    const missing = parameter.required && !value.trim();
                    const state = invalidMonth
                      ? "invalid"
                      : missing
                        ? "missing"
                        : value
                          ? "ready"
                          : "optional";
                    const stateLabel = invalidMonth
                      ? labels.promptParameterInvalid
                      : missing
                        ? labels.promptParameterMissing
                        : value
                          ? labels.promptParameterResolved
                          : labels.promptParameterOptional;
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
                            setPromptParameterValues((current) => ({
                              ...current,
                              [parameter.key]: event.target.value,
                            }))
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
              <label className="sr-only" htmlFor={`${inputId}-advanced`}>
                {labels.placeholder}
              </label>
              <label className="text-label text-fg-secondary flex shrink-0 items-center gap-2">
                <span>{labels.model}</span>
                <select
                  value={selectedModel}
                  onChange={(event) => changeModel(event.target.value)}
                  className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
                  aria-label={labels.model}
                >
                  {allowedModels.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              {modelCapabilities?.reasoningEfforts.length ? (
                <label className="text-label text-fg-secondary flex shrink-0 items-center gap-2">
                  <span>{labels.reasoning}</span>
                  <select
                    value={reasoningEffort}
                    onChange={(event) =>
                      setReasoningEffort(event.target.value as typeof reasoningEffort)
                    }
                    className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
                  >
                    {modelCapabilities.reasoningEfforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort === "low"
                          ? labels.reasoningLow
                          : effort === "medium"
                            ? labels.reasoningMedium
                            : effort === "high"
                              ? labels.reasoningHigh
                              : effort === "xhigh"
                                ? labels.reasoningExtraHigh
                                : labels.reasoningMax}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <DirAwareTextarea
                id={`${inputId}-advanced`}
                locale={locale}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={labels.placeholder}
                maxLength={1_000}
                rows={2}
                className="border-border bg-surface text-body min-h-11 min-w-0 flex-1 resize-y rounded-[var(--radius-control)] border px-3 py-2"
                disabled={busy || archivedView}
              />
              <Button
                type="submit"
                disabled={busy || archivedView || !draft.trim() || !promptParametersReady}
                aria-label={labels.send}
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{labels.send}</span>
              </Button>
              {busy ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={!activeRunId}
                  onClick={() => void stopRun()}
                >
                  {labels.stop}
                </Button>
              ) : null}
            </form>
            <div className="text-label text-fg-muted flex flex-wrap items-center justify-between gap-2">
              <p
                id="workspace-assistant-mode-description"
                className="inline-flex items-center gap-1"
              >
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                {mode === "ask"
                  ? labels.modeAskDescription
                  : mode === "plan"
                    ? labels.modePlanDescription
                    : labels.modeApplyDescription}
              </p>
              <p>{labels.privacy}</p>
            </div>{" "}
          </details>
        </main>
        {historyVisible ? (
          <aside
            className="border-border bg-surface hidden min-h-0 rounded-[var(--radius-card)] border p-3 lg:flex lg:flex-col"
            dir={locale === "ar" ? "rtl" : "ltr"}
          >
            <AssistantHistoryPanel
              conversations={conversations}
              currentConversationId={conversationId}
              archivedView={archivedView}
              search={search}
              locale={locale}
              labels={{
                conversations: labels.conversations,
                newConversation: labels.newConversation,
                searchConversations: labels.searchConversations,
                rename: labels.rename,
                archive: labels.archive,
                deleteConversation: labels.deleteConversation,
                archivedConversations: labels.archivedConversations,
                activeConversations: labels.activeConversations,
                restoreConversation: labels.restoreConversation,
                pinConversation: labels.pinConversation,
                unpinConversation: labels.unpinConversation,
                pinnedConversation: labels.pinnedConversation,
                noConversations: labels.noConversations,
                noSearchResults: labels.noSearchResults,
              }}
              onSearchChange={setSearch}
              onArchivedViewChange={setArchivedView}
              onNewConversation={startNewConversation}
              onOpenConversation={(id) => void openConversation(id)}
              onRenameConversation={(id, title) => void renameConversation(id, title)}
              onArchiveConversation={(id) => void archiveConversation(id)}
              onDeleteConversation={(id) => void deleteConversation(id)}
              onRestoreConversation={(id) => void restoreConversation(id)}
              onTogglePin={(id, pinned) => void toggleConversationPin(id, pinned)}
            />
          </aside>
        ) : null}
      </div>
      {!showDashboardComposer ? (
        <form
          className="border-border bg-surface/95 sticky bottom-2 z-20 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border p-2 shadow-lg backdrop-blur"
          onSubmit={(event) => void submit(event)}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={dashboardLabels.toolsAndKnowledge}
            title={dashboardLabels.toolsAndKnowledge}
            onClick={() => setToolsOpen(true)}
          >
            <Library className="h-4 w-4" aria-hidden="true" />
          </Button>
          <label className="text-label text-fg-secondary flex shrink-0 items-center gap-2">
            <span className="sr-only">{labels.model}</span>
            <select
              value={selectedModel}
              onChange={(event) => changeModel(event.target.value)}
              className="border-border bg-surface text-body min-h-11 max-w-36 rounded-[var(--radius-control)] border px-2"
              aria-label={labels.model}
            >
              {allowedModels.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-label text-fg-secondary flex shrink-0 items-center gap-2">
            <span className="sr-only">{labels.mode}</span>
            <select
              value={mode}
              onChange={(event) => void changeMode(event.target.value as typeof mode)}
              className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
              aria-label={labels.mode}
              data-testid="assistant-sticky-mode"
              disabled={busy || archivedView}
            >
              <option value="ask">{labels.modeAsk}</option>
              <option value="plan">{labels.modePlan}</option>
              <option value="apply">{labels.modeApply}</option>
            </select>
          </label>
          <label className="sr-only" htmlFor={inputId}>
            {dashboardLabels.messageLabel}
          </label>
          <DirAwareInput
            id={inputId}
            locale={locale}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={dashboardLabels.heroPlaceholder}
            maxLength={1_000}
            className="border-border bg-surface text-body min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border px-3"
            disabled={busy || archivedView}
          />
          <Button
            type="submit"
            disabled={busy || archivedView || !draft.trim() || !promptParametersReady}
            aria-label={labels.send}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{labels.send}</span>
          </Button>
          {busy ? (
            <Button
              type="button"
              variant="outline"
              disabled={!activeRunId}
              onClick={() => void stopRun()}
            >
              {labels.stop}
            </Button>
          ) : null}
        </form>
      ) : null}
      <Dialog open={mobileHistoryOpen} onOpenChange={setMobileHistoryOpen}>
        <DialogContent className="max-h-[85vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{labels.assistantHistory}</DialogTitle>
          </DialogHeader>
          <AssistantHistoryPanel
            conversations={conversations}
            currentConversationId={conversationId}
            archivedView={archivedView}
            search={search}
            locale={locale}
            labels={{
              conversations: labels.conversations,
              newConversation: labels.newConversation,
              searchConversations: labels.searchConversations,
              rename: labels.rename,
              archive: labels.archive,
              deleteConversation: labels.deleteConversation,
              archivedConversations: labels.archivedConversations,
              activeConversations: labels.activeConversations,
              restoreConversation: labels.restoreConversation,
              pinConversation: labels.pinConversation,
              unpinConversation: labels.unpinConversation,
              pinnedConversation: labels.pinnedConversation,
              noConversations: labels.noConversations,
              noSearchResults: labels.noSearchResults,
            }}
            onSearchChange={setSearch}
            onArchivedViewChange={setArchivedView}
            onNewConversation={startNewConversation}
            onOpenConversation={(id) => void openConversation(id)}
            onRenameConversation={(id, title) => void renameConversation(id, title)}
            onArchiveConversation={(id) => void archiveConversation(id)}
            onDeleteConversation={(id) => void deleteConversation(id)}
            onRestoreConversation={(id) => void restoreConversation(id)}
            onTogglePin={(id, pinned) => void toggleConversationPin(id, pinned)}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PromptField({
  label,
  value,
  onChange,
  locale,
  required = true,
  maxLength = 1_000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="text-label text-fg-secondary grid gap-1">
      {label}
      <DirAwareInput
        locale={locale}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        required={required}
        className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-3"
      />
    </label>
  );
}
