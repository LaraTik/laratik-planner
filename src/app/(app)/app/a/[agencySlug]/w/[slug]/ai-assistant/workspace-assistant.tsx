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
} from "react";
import {
  Archive,
  Bot,
  MessageSquarePlus,
  Pencil,
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
  getBuiltInAssistantPrompts,
  type AssistantPromptParameter,
} from "@/features/workspace-assistant";
import { getAiModelDefinition } from "@/lib/ai/model-registry";

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
  dismiss: string;
  showAllPrompts: string;
  showFewerPrompts: string;
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
type Conversation = {
  id: string;
  title: string;
  mode: "ask" | "plan" | "apply";
  updatedAt: string;
};
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
type AssistantProposal = {
  id: string;
  contentItemId: string;
  field: "title" | "brief" | "plannedPublishAt";
  title: string;
  beforeValue: string;
  afterValue: string;
  evidenceIds: string[];
  status:
    "proposed" | "applied" | "rejected" | "stale" | "expired" | "already_applied" | "applying";
  expiresAt: string;
};
type AssistantReply = {
  answer: {
    answer: string;
    findings: {
      title: string;
      detail: string;
      severity: "low" | "medium" | "high";
      evidenceIds: string[];
    }[];
    recommendations: { title: string; detail: string; evidenceIds: string[] }[];
    proposedChanges: [];
    limitations: string[];
  };
  evidence: {
    id: string;
    source: string;
    retrievedAt: string;
    period: string;
    version?: string | null;
    completeness: string;
    itemCount: number;
  }[];
  deterministicFindings: {
    title: string;
    detail: string;
    severity: string;
    evidenceIds: string[];
  }[];
  referencedItem?: { id: string; title: string; revision: number } | null;
  reviewedPlanMonth?: string;
  proposals: AssistantProposal[];
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
}) {
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
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [showAllPrompts, setShowAllPrompts] = useState(false);
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
  const [month, setMonth] = useState(currentMonth);
  const [reasoningEffort, setReasoningEffort] = useState<
    "low" | "medium" | "high" | "xhigh" | "max"
  >("medium");
  const [mode, setMode] = useState<"ask" | "plan" | "apply">("ask");
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const activeRunStorageKey = `planner-assistant-run:${workspaceSlug}`;
  const inputId = useId();
  const searchId = useId();

  function formatProposalDate(value: string) {
    const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: workspaceTimezone,
    }).format(new Date(dateValue));
  }

  async function refreshVisibleConversations() {
    const response = await fetch(
      `/api/ai/workspace-assistant?workspaceSlug=${encodeURIComponent(workspaceSlug)}${archivedView ? "&archived=true" : ""}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as { conversations: Conversation[] };
    setConversations(data.conversations);
  }

  async function refreshPrompts() {
    const response = await fetch(
      `/api/ai/workspace-assistant/prompts?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const data = (await response.json()) as { prompts: Prompt[] };
    setPrompts(data.prompts);
  }

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

  useEffect(() => {
    let cancelled = false;
    async function loadAssistantLibrary() {
      const [conversationResponse, promptResponse] = await Promise.all([
        fetch(
          `/api/ai/workspace-assistant?workspaceSlug=${encodeURIComponent(workspaceSlug)}${archivedView ? "&archived=true" : ""}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/ai/workspace-assistant/prompts?workspaceSlug=${encodeURIComponent(workspaceSlug)}`,
          { cache: "no-store" },
        ),
      ]);
      if (cancelled) return;
      if (conversationResponse.ok) {
        const data = (await conversationResponse.json()) as { conversations: Conversation[] };
        setConversations(data.conversations);
      }
      if (promptResponse.ok) {
        const data = (await promptResponse.json()) as { prompts: Prompt[] };
        setPrompts(data.prompts);
      }
    }
    void loadAssistantLibrary();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, archivedView]);

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
  const quickPrompts = [
    [labels.summarize, "Summarize this month's plan and highlight its main strengths.", "ask"],
    [labels.findGaps, "Find scheduling gaps and explain the evidence.", "ask"],
    [labels.improve, "Suggest practical improvements to this month's plan.", "plan"],
  ] as const;

  async function submit(
    event?: FormEvent<HTMLFormElement>,
    selected?: string,
    promptId?: string,
    selectedMode: "ask" | "plan" | "apply" = mode,
  ) {
    event?.preventDefault();
    const message = (selected ?? draft).trim();
    if (!message || busy) return;
    if (
      activePrompt?.id === selectedPromptId &&
      activePrompt.parameters.some((parameter) => {
        const value = (promptParameterValues[parameter.key] ?? parameter.defaultValue ?? "").trim();
        return (
          (parameter.required && !value) ||
          (parameter.type === "month" && value && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
        );
      })
    ) {
      return;
    }
    const nextMessages = [...messages, { role: "user" as const, content: message }];
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
          history: messages.slice(-8),
          ...(selectedContentItemId || contentItemReference.trim()
            ? { contentItemReference: selectedContentItemId ?? contentItemReference.trim() }
            : {}),
          ...(conversationId ? { conversationId } : {}),
          ...((promptId ?? selectedPromptId) ? { promptId: promptId ?? selectedPromptId } : {}),
          ...(activePrompt?.id === (promptId ?? selectedPromptId) && activePrompt.parameters.length
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
      if (data.reviewedPlanMonth) setMonth(data.reviewedPlanMonth);
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
          messages: { role: string; content: string; metadata: Record<string, unknown> | null }[];
          proposals: AssistantProposal[];
        };
      };
      setConversationId(data.conversation.id);
      setMode(data.conversation.mode);
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
  const visibleConversations = conversations.filter((conversation) =>
    conversation.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)),
  );
  const builtInPrompts: Prompt[] = getBuiltInAssistantPrompts(locale).map((prompt) => ({
    ...prompt,
    scope: "builtin",
    status: "published",
    ownerId: null,
    parameters: prompt.parameters ?? [],
    canEdit: false,
    canPublish: false,
  }));
  const displayedPrompts = [...prompts, ...builtInPrompts];
  const promptsToDisplay = showAllPrompts ? displayedPrompts : displayedPrompts.slice(0, 6);
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
        proposal.status === "proposed" && new Date(proposal.expiresAt).getTime() > Date.now(),
    );

  return (
    <section className="space-y-4" aria-label={labels.assistant}>
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
                      <option value="content_reference">{labels.promptParameterReference}</option>
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
                                ...(defaultValue ? { defaultValue } : { defaultValue: undefined }),
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
                              itemIndex === index ? { ...item, required: checked === true } : item,
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
        {displayedPrompts.length ? (
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
                    <span key={tag} className="bg-surface-subtle text-label rounded-full px-2 py-1">
                      {tag}
                    </span>
                  ))}
                </div>
                {activePrompt?.id === prompt.id && activePrompt.parameters.length ? (
                  <fieldset className="border-border mt-3 grid gap-3 rounded-[var(--radius-control)] border p-3">
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
        {displayedPrompts.length > 6 ? (
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
      <div className="border-border bg-surface rounded-[var(--radius-card)] border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={archivedView ? "outline" : "default"}
              onClick={() => setArchivedView(false)}
            >
              {labels.activeConversations}
            </Button>
            <Button
              type="button"
              variant={archivedView ? "default" : "outline"}
              onClick={() => setArchivedView(true)}
            >
              {labels.archivedConversations}
            </Button>
            {!archivedView ? (
              <Button type="button" variant="outline" onClick={startNewConversation}>
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                {labels.newConversation}
              </Button>
            ) : null}
          </div>
          <h2 className="text-title-card text-fg-primary font-semibold">{labels.conversations}</h2>
        </div>
        {conversations.length ? (
          <>
            <label htmlFor={searchId} className="sr-only">
              {labels.searchConversations}
            </label>
            <div className="border-border mt-3 flex items-center gap-2 rounded-[var(--radius-control)] border px-3">
              <Search className="text-fg-muted h-4 w-4" aria-hidden="true" />
              <DirAwareInput
                id={searchId}
                locale={locale}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={labels.searchConversations}
                className="text-body min-h-11 min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleConversations.map((conversation) => (
                <li
                  key={conversation.id}
                  className="border-border flex min-w-0 items-center gap-1 rounded-[var(--radius-control)] border p-1"
                >
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    aria-current={conversationId === conversation.id ? "page" : undefined}
                    className="text-body text-fg-primary hover:bg-surface-subtle min-h-11 min-w-0 flex-1 truncate rounded px-2 text-start focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {conversation.title}
                  </button>
                  {archivedView ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.restoreConversation}
                      title={labels.restoreConversation}
                      onClick={() => void restoreConversation(conversation.id)}
                    >
                      <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.rename}
                      title={labels.rename}
                      onClick={() => void renameConversation(conversation.id, conversation.title)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {!archivedView ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={labels.archive}
                      title={labels.archive}
                      onClick={() => void archiveConversation(conversation.id)}
                    >
                      <Archive className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={labels.deleteConversation}
                    title={labels.deleteConversation}
                    onClick={() => void deleteConversation(conversation.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
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
                  {message.content}
                </div>
              </li>
            ))}
            {busy ? (
              <li role="status" className="text-body text-fg-muted">
                {labels.sending}
              </li>
            ) : null}
            {busy && streamingText ? (
              <li className="max-w-[95%]">
                <p className="text-label text-fg-muted mb-1 font-semibold">{labels.assistant}</p>
                <div
                  className="bg-surface-subtle text-body text-fg-primary rounded-[var(--radius-control)] px-3 py-2"
                  aria-label={labels.activityWriting}
                >
                  {streamingText}
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
          <ol
            className="border-border mx-auto mt-4 max-w-3xl space-y-1 border-s-2 ps-3"
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
          <div className="border-border mx-auto mt-5 max-w-3xl space-y-4 border-t pt-4">
            {reply.reviewedPlanMonth ? (
              <p className="text-label text-fg-muted" role="status">
                {labels.reviewedPlan}: {formatPlanMonth(reply.reviewedPlanMonth, locale)}
              </p>
            ) : null}
            {reply.referencedItem ? (
              <p className="text-label text-fg-muted" role="status">
                {labels.selectedContent}: {reply.referencedItem.title} · revision{" "}
                {reply.referencedItem.revision}
              </p>
            ) : null}
            {reply.deterministicFindings.length ? (
              <section aria-label={labels.findGaps}>
                <h3 className="text-title-card text-fg-primary font-semibold">{labels.findGaps}</h3>
                <ul className="mt-2 space-y-2">
                  {reply.deterministicFindings.map((finding, index) => (
                    <li
                      key={`${finding.title}-${index}`}
                      className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
                    >
                      <p className="text-body text-fg-primary font-semibold">{finding.title}</p>
                      <p className="text-body text-fg-secondary mt-1">{finding.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {reply.answer.findings.length || reply.answer.recommendations.length ? (
              <section>
                <h3 className="text-title-card text-fg-primary font-semibold">{labels.improve}</h3>
                <ul className="mt-2 space-y-2">
                  {[...reply.answer.findings, ...reply.answer.recommendations].map(
                    (item, index) => (
                      <li
                        key={`${item.title}-${index}`}
                        className="bg-surface-subtle rounded-[var(--radius-control)] p-3"
                      >
                        <p className="text-body text-fg-primary font-semibold">{item.title}</p>
                        <p className="text-body text-fg-secondary mt-1">{item.detail}</p>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            ) : null}
            {reply.proposals.length ? (
              <section aria-label={labels.proposedEdits} data-testid="assistant-proposals">
                <h3 className="text-title-card text-fg-primary font-semibold">
                  {labels.proposedEdits}
                </h3>
                {selectedProposalIds.length >= 2 ? (
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={mode !== "apply" || !canApplySelectedProposals}
                      onClick={() =>
                        void applySelectedProposals(selectedProposals.map((item) => item.id))
                      }
                    >
                      {selectedProposals.some((proposal) => proposal.status === "applying")
                        ? labels.applyingSelectedEdits
                        : `${labels.applySelectedEdits} (${selectedProposals.length})`}
                    </Button>
                  </div>
                ) : null}
                <ul className="mt-2 space-y-2">
                  {reply.proposals.map((proposal) => {
                    const expired =
                      proposal.status === "proposed" &&
                      new Date(proposal.expiresAt).getTime() <= Date.now();
                    const status = expired ? "expired" : proposal.status;
                    const pending = status === "proposed";
                    const statusLabel =
                      status === "applied"
                        ? labels.editApplied
                        : status === "rejected"
                          ? labels.editRejected
                          : status === "stale"
                            ? labels.editStale
                            : status === "expired"
                              ? labels.editExpired
                              : status === "applying"
                                ? labels.applyingEdit
                                : "";
                    return (
                      <li
                        key={proposal.id}
                        className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                      >
                        {pending ? (
                          <div className="mb-2 flex min-h-11 items-center gap-2">
                            <Checkbox
                              id={`assistant-proposal-select-${proposal.id}`}
                              checked={selectedProposalIds.includes(proposal.id)}
                              onCheckedChange={(checked) =>
                                setSelectedProposalIds((current) =>
                                  checked === true
                                    ? [...new Set([...current, proposal.id])]
                                    : current.filter((id) => id !== proposal.id),
                                )
                              }
                            />
                            <label
                              htmlFor={`assistant-proposal-select-${proposal.id}`}
                              className="text-label text-fg-secondary cursor-pointer"
                            >
                              {labels.selectProposal}
                            </label>
                          </div>
                        ) : null}
                        <p className="text-body text-fg-primary font-semibold">{proposal.title}</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <div>
                            <p className="text-label text-fg-muted">{labels.before}</p>
                            <p
                              className="text-body text-fg-secondary whitespace-pre-wrap"
                              dir="auto"
                            >
                              {proposal.field === "plannedPublishAt"
                                ? formatProposalDate(proposal.beforeValue)
                                : proposal.beforeValue || "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-label text-fg-muted">{labels.after}</p>
                            <p className="text-body text-fg-primary whitespace-pre-wrap" dir="auto">
                              {proposal.field === "plannedPublishAt"
                                ? formatProposalDate(proposal.afterValue)
                                : proposal.afterValue}
                            </p>
                          </div>
                        </div>
                        {pending ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={mode !== "apply"}
                              onClick={() => void decideProposal(proposal.id, "apply")}
                            >
                              {labels.applyEdit}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void decideProposal(proposal.id, "reject")}
                            >
                              {labels.rejectEdit}
                            </Button>
                          </div>
                        ) : (
                          <p className="text-label text-fg-muted mt-2" role="status">
                            {statusLabel}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {proposalError ? (
                  <p role="alert" className="text-body text-danger mt-2">
                    {labels.editStatusError}
                  </p>
                ) : null}
              </section>
            ) : null}
            {reply.answer.limitations.length ? (
              <section>
                <h3 className="text-label text-fg-primary font-semibold">{labels.limitations}</h3>
                <ul className="text-label text-fg-secondary mt-1 list-inside list-disc">
                  {reply.answer.limitations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="text-label text-fg-muted">
              <p className="font-semibold">{labels.evidence}</p>
              {reply.evidence.map((item) => (
                <div key={item.id} className="mt-1">
                  <p>
                    {labels.source}: {item.source} · {item.period} · {item.itemCount}{" "}
                    {labels.itemCount}
                  </p>
                  {item.version ? <p>{item.version}</p> : null}
                  <p>
                    {labels.capturedAt}:{" "}
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      numberingSystem: "latn",
                    }).format(new Date(item.retrievedAt))}
                  </p>
                  <p>
                    {item.completeness === "bounded" ? labels.boundedData : labels.completeData}
                  </p>
                </div>
              ))}
            </section>
          </div>
        ) : null}
      </div>

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
            onChange={(event) => {
              setContentItemReference(event.target.value);
              setSelectedContentItemId(null);
              setContentCandidates([]);
              setContentReferenceNotFound(false);
            }}
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
            onChange={(event) => setMonth(event.target.value)}
            className="border-border bg-surface text-body min-h-11 rounded-[var(--radius-control)] border px-2"
          />
        </label>
        <label className="sr-only" htmlFor={inputId}>
          {labels.placeholder}
        </label>
        <label className="text-label text-fg-secondary flex shrink-0 items-center gap-2">
          <span>{labels.model}</span>
          <select
            value={selectedModel}
            onChange={(event) => {
              const next = event.target.value;
              if (!allowedModels.includes(next)) return;
              saveAssistantModelPreference(preferenceKey, next);
              const nextDefinition = getAiModelDefinition(next);
              if (!nextDefinition?.reasoningEfforts.includes(reasoningEffort)) {
                setReasoningEffort("medium");
              }
            }}
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
              onChange={(event) => setReasoningEffort(event.target.value as typeof reasoningEffort)}
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
          id={inputId}
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
        <p id="workspace-assistant-mode-description" className="inline-flex items-center gap-1">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
          {mode === "ask"
            ? labels.modeAskDescription
            : mode === "plan"
              ? labels.modePlanDescription
              : labels.modeApplyDescription}
        </p>
        <p>{labels.privacy}</p>
      </div>
    </section>
  );
}

function formatPlanMonth(month: string, locale: string) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(date);
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
