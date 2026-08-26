"use client";

import * as React from "react";
import {
  Sparkles,
  Wand2,
  Bot,
  CornerDownLeft,
  Replace,
  RefreshCcw,
  Lightbulb,
  ListChecks,
  Globe2,
  Link2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { applyAiDraftAction } from "../actions";
import { AI_CAPABILITY_METADATA, type AiCapabilityMetadata } from "@/lib/ai/capabilities";

/**
 * AI assistance entry points on the content detail page.
 *
 * Surfaces the capabilities defined in STUDIOFLOW_MASTER_PROMPT.md §15
 * and lets the user invoke them where the work actually happens. After
 * FEAT-03 the route handles all six capabilities; the section used to
 * hard-code a 3-tile subset, which left `campaign_ideas`,
 * `platform_adaptation`, and `related_format_ideas` reachable in the
 * agency config but invisible on the planner surface. We now drive the
 * tile list from `@/lib/ai/capabilities` so the planner surface
 * matches the backend and the agency form in one place.
 *
 * Every draft is shown in a copy-able block — the user stays in
 * control of "Insert / Replace / Copy / Try Again" per §15. We
 * never auto-write to the database.
 */

const ICON_BY_ID = {
  campaign_ideas: Lightbulb,
  brief_improvement: ListChecks,
  caption_drafts: Wand2,
  platform_adaptation: Globe2,
  related_format_ideas: Link2,
  completeness_check: ListChecks,
} as const;

const PLANNER_CAPABILITIES: ReadonlyArray<AiCapabilityMetadata> = AI_CAPABILITY_METADATA.filter(
  (c) => c.enabledOnContentDetail,
);

type OffReason = "agency-disabled" | "no-key" | "capability-off";

function offReasonFor(
  cap: AiCapabilityMetadata,
  agencyEnabled: boolean,
  enabledCapabilities: ReadonlyArray<string>,
  hasKey: boolean,
): OffReason | null {
  // The master switch on the agency form is the loudest signal — if
  // it's off, every capability is off for the same reason.
  if (!agencyEnabled) return "agency-disabled";
  // No API key at all (env or managed secret) is a separate bucket so
  // the user can tell "agency says off" from "platform has no key".
  if (!hasKey) return "no-key";
  if (!enabledCapabilities.includes(cap.id)) return "capability-off";
  return null;
}

const OFF_REASON_LABEL: Record<OffReason, string> = {
  "agency-disabled": "Agency switch is off",
  "no-key": "No AI key configured",
  "capability-off": "Agency disabled this capability",
};

export function AiAssistanceSection({
  workspaceSlug,
  contentItemId,
  contentStatus,
  isManager,
  isPlanner,
  enabledCapabilities,
  agencyEnabled,
  hasKey,
}: {
  workspaceSlug: string;
  contentItemId: string;
  /**
   * Current workflow status of the content item. Insert/Replace are
   * only enabled for `draft` and `changes_requested` — same guard the
   * `updateContentItem` service uses — so the UI never offers a write
   * that the server would reject.
   */
  contentStatus: string;
  isManager: boolean;
  isPlanner: boolean;
  /**
   * Plain string array (not Set) — the page is a Server Component and
   * must serialise everything it passes across the RSC boundary. A
   * `Set` here would throw "An error occurred in the Server Components
   * render" (minified to React #441) when AI is enabled in prod.
   */
  enabledCapabilities: string[];
  /**
   * Master switch from `ai_feature_setting.enabled`. Drives the
   * "agency switch is off" off-reason so the user can tell at a
   * glance whether the agency disabled AI or just this capability.
   */
  agencyEnabled: boolean;
  /**
   * True when the agency has a working API key (env or managed
   * secret). Mirrors the `effectiveEnabled` computation on the
   * workspace status page.
   */
  hasKey: boolean;
}) {
  const [draft, setDraft] = React.useState<{
    capabilityId: string;
    text: string;
  } | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState<null | "insert" | "replace">(null);
  const [applying, setApplying] = React.useState(false);
  const [platformTarget, setPlatformTarget] = React.useState<
    "instagram" | "tiktok" | "linkedin" | "x"
  >("instagram");

  const canUse = isManager || isPlanner;
  // Mirrors UPDATEABLE_STATUSES in the content service. Kept inline
  // (the service module is "server-only" and can't be imported into a
  // client component).
  const canEditBrief = contentStatus === "draft" || contentStatus === "changes_requested";

  const onInvoke = async (capabilityId: string) => {
    setError(null);
    setPendingId(capabilityId);
    setDraft(null);
    setApplied(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentItemId,
          capability: capabilityId,
          ...(capabilityId === "platform_adaptation"
            ? { targetPlatform: platformTarget, sourceText: draft?.text ?? "" }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as { text?: string; caption?: string };
      const text = body.text ?? body.caption ?? "";
      setDraft({ capabilityId, text });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingId(null);
    }
  };

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore — user can still select and copy manually
    }
  };

  const onApply = async (mode: "insert" | "replace") => {
    if (!draft) return;
    setApplyError(null);
    setApplied(null);
    setApplying(true);
    try {
      const res = await applyAiDraftAction({
        workspaceSlug,
        contentItemId,
        draftText: draft.text,
        mode,
      });
      if (res.error) {
        setApplyError(res.error);
        return;
      }
      setApplied(mode);
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  if (!canUse) return null;

  const usableCount = PLANNER_CAPABILITIES.filter(
    (cap) => agencyEnabled && hasKey && enabledCapabilities.includes(cap.id),
  ).length;

  return (
    <Card data-testid="ai-assistance-section">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>AI assistance</CardTitle>
        </div>
        <a
          href={`/app/w/${workspaceSlug}/ai-settings`}
          aria-label="Open AI status and capabilities (read-only)"
          className="text-label text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          data-testid="ai-open-workspace-settings"
        >
          Status (read-only)
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </header>
      <CardDescription>
        Drafts only — the human inserts or replaces. Configure capabilities at the agency level.
      </CardDescription>

      {!agencyEnabled || !hasKey ? (
        <div
          className="border-border bg-warning-soft text-body text-fg-primary mt-4 flex items-start gap-2 rounded-[var(--radius-control)] border p-3"
          data-testid="ai-assistance-disabled-banner"
          role="status"
        >
          <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">AI assistance is currently off</p>
            <p className="text-fg-secondary mt-1">
              {!agencyEnabled
                ? "An agency admin needs to enable the AI master switch before any capability button can run."
                : "No AI API key is configured. An agency admin can set one at Agency Settings → AI configuration."}
              {isManager ? (
                <>
                  {" "}
                  <a
                    href="/app/agency-settings/ai"
                    className="text-primary underline-offset-4 hover:underline"
                    data-testid="ai-open-agency-config-from-banner"
                  >
                    Open AI configuration
                  </a>
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      <ul
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="ai-capability-actions"
      >
        {PLANNER_CAPABILITIES.map((cap) => {
          const on = agencyEnabled && hasKey && enabledCapabilities.includes(cap.id);
          const isPending = pendingId === cap.id;
          const Icon = ICON_BY_ID[cap.id];
          const reason = on ? null : offReasonFor(cap, agencyEnabled, enabledCapabilities, hasKey);
          return (
            <li
              key={cap.id}
              className="border-border bg-surface-subtle flex flex-col gap-2 rounded-[var(--radius-control)] border p-3"
              data-testid={`ai-action-${cap.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-body text-fg-primary flex items-center gap-2 font-semibold">
                  <Icon className="text-fg-secondary h-3.5 w-3.5" aria-hidden="true" />
                  {cap.label}
                </p>
                <Badge
                  variant={on ? "success" : "outline"}
                  data-testid={`ai-action-status-${cap.id}`}
                >
                  {on ? "Ready" : "Off"}
                </Badge>
              </div>
              <p className="text-label text-fg-muted">{cap.description}</p>
              {cap.hint ? <p className="text-label text-fg-muted italic">{cap.hint}</p> : null}
              {!on && reason ? (
                <p
                  className="text-label text-warning"
                  data-testid={`ai-action-off-reason-${cap.id}`}
                >
                  {OFF_REASON_LABEL[reason]}
                </p>
              ) : null}
              {cap.id === "platform_adaptation" && on ? (
                <label className="text-label text-fg-secondary grid gap-1">
                  <span>Adapt for</span>
                  <select
                    value={platformTarget}
                    onChange={(e) =>
                      setPlatformTarget(e.target.value as "instagram" | "tiktok" | "linkedin" | "x")
                    }
                    className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-9 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                    data-testid="ai-action-platform-target"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="x">X (Twitter)</option>
                  </select>
                </label>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => onInvoke(cap.id)}
                disabled={isPending || !on}
                data-testid={`ai-action-${cap.id}-button`}
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                {isPending ? "Working…" : on ? "Run" : reason ? OFF_REASON_LABEL[reason] : "Off"}
              </Button>
            </li>
          );
        })}
      </ul>

      {usableCount === 0 && agencyEnabled && hasKey ? (
        <p className="text-label text-fg-muted mt-3" data-testid="ai-assistance-no-capabilities">
          Every AI capability is currently off at the agency level. Ask an agency admin to turn on
          at least one capability.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="ai-assistance-error"
          className="text-body text-danger mt-4 font-semibold"
        >
          {error}
        </p>
      ) : null}

      {draft ? (
        <div
          className="border-border bg-surface mt-4 space-y-2 rounded-[var(--radius-control)] border p-3"
          data-testid="ai-assistance-draft"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-label text-fg-muted font-semibold">
              Draft from {AI_CAPABILITY_METADATA.find((c) => c.id === draft.capabilityId)?.label}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onCopy(draft.text)}
              data-testid="ai-assistance-copy"
            >
              Copy
            </Button>
          </div>
          <p className="text-body text-fg-primary whitespace-pre-wrap">{draft.text}</p>
          {applyError ? (
            <p
              role="alert"
              data-testid="ai-assistance-apply-error"
              className="text-body text-danger font-semibold"
            >
              {applyError}
            </p>
          ) : null}
          {applied ? (
            <p
              data-testid="ai-assistance-apply-success"
              className="text-body text-success font-semibold"
            >
              {applied === "insert"
                ? "Added to the brief below the existing text."
                : "Replaced the brief with this draft."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => onApply("insert")}
              disabled={applying || !canEditBrief}
              title={
                canEditBrief
                  ? "Append this draft below the current brief"
                  : "Insert is only available while the item is in draft or changes requested"
              }
              data-testid="ai-assistance-insert"
            >
              <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {applying ? "Working…" : "Insert (append below)"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onApply("replace")}
              disabled={applying || !canEditBrief}
              title={
                canEditBrief
                  ? "Overwrite the current brief with this draft"
                  : "Replace is only available while the item is in draft or changes requested"
              }
              data-testid="ai-assistance-replace"
            >
              <Replace className="h-3.5 w-3.5" aria-hidden="true" />
              {applying ? "Working…" : "Replace brief"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onInvoke(draft.capabilityId)}
              disabled={pendingId === draft.capabilityId}
              data-testid="ai-assistance-try-again"
            >
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {pendingId === draft.capabilityId ? "Working…" : "Try again"}
            </Button>
          </div>
          {!canEditBrief ? (
            <p className="text-label text-fg-muted">
              Item is in {contentStatus.replaceAll("_", " ")} — the brief is frozen for review. Use
              &ldquo;Try again&rdquo; for a fresh draft, or copy the text manually.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
