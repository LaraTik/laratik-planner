"use client";

import * as React from "react";
import { Sparkles, Wand2, Bot, CornerDownLeft, Replace, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { applyAiDraftAction } from "../actions";

/**
 * AI assistance entry points on the content detail page.
 *
 * Surfaces the capabilities defined in STUDIOFLOW_MASTER_PROMPT.md §15
 * and lets the user invoke them where the work actually happens:
 *
 *  - "Draft caption" — calls /api/ai/generate with the current
 *    contentItem. Already implemented end-to-end (MiniMax-M3).
 *  - "Improve brief" — same provider call shape; reuses the
 *    improveBrief capability once it's enabled in the agency
 *    config. Returns a suggested rewrite the user can copy.
 *  - "Check completeness" — scores a brief and lists the missing
 *    pieces (Hook / Main message / CTA / Scenes / Captions). TBD:
 *    reuses the same endpoint with capability=completeness_check.
 *
 * Every draft is shown in a copy-able block — the user stays in
 * control of "Insert / Replace / Copy / Try Again" per §15. We
 * never auto-write to the database.
 */
type Capability = {
  id: string;
  label: string;
  description: string;
  status: "ready" | "coming-soon";
};

const CAPABILITIES: Capability[] = [
  {
    id: "draft_caption",
    label: "Draft caption",
    description: "Generate a platform-aware caption draft. Edit before saving.",
    status: "ready",
  },
  {
    id: "improve_brief",
    label: "Improve brief",
    description: "Tighten a vague brief into Hook → Main message → CTA.",
    status: "ready",
  },
  {
    id: "completeness_check",
    label: "Check completeness",
    description: "Score how ready this brief is for creative handoff.",
    status: "ready",
  },
];

export function AiAssistanceSection({
  workspaceSlug,
  contentItemId,
  contentStatus,
  isManager,
  isPlanner,
  enabledCapabilities,
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

  const canUse = isManager || isPlanner;
  // Mirrors UPDATEABLE_STATUSES in the content service. Kept inline
  // (the service module is "server-only" and can't be imported into a
  // client component).
  const canEditBrief = contentStatus === "draft" || contentStatus === "changes_requested";

  const onInvoke = async (capabilityId: string) => {
    setError(null);
    setPendingId(capabilityId);
    setDraft(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentItemId,
          capability: capabilityId,
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

  return (
    <Card data-testid="ai-assistance-section">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>AI assistance</CardTitle>
        </div>
        <a
          href={`/app/w/${workspaceSlug}/ai-settings`}
          className="text-label text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          data-testid="ai-open-workspace-settings"
        >
          Status &amp; capabilities
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </header>
      <CardDescription>
        Drafts only — the human inserts or replaces. Configure capabilities at the agency level.
      </CardDescription>

      <ul className="mt-4 grid gap-2 sm:grid-cols-3" data-testid="ai-capability-actions">
        {CAPABILITIES.filter((c) => c.status === "ready").map((cap) => {
          const on = enabledCapabilities.includes(
            cap.id === "draft_caption"
              ? "caption_drafts"
              : cap.id === "improve_brief"
                ? "brief_improvement"
                : "completeness_check",
          );
          const isPending = pendingId === cap.id;
          return (
            <li
              key={cap.id}
              className="border-border bg-surface-subtle flex flex-col gap-2 rounded-[var(--radius-control)] border p-3"
              data-testid={`ai-action-${cap.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-body text-fg-primary font-semibold">{cap.label}</p>
                <Badge variant={on ? "success" : "outline"}>{on ? "Ready" : "Off"}</Badge>
              </div>
              <p className="text-label text-fg-muted">{cap.description}</p>
              <Button
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => onInvoke(cap.id)}
                disabled={isPending || !on}
                data-testid={`ai-action-${cap.id}-button`}
              >
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                {isPending ? "Working…" : "Run"}
              </Button>
            </li>
          );
        })}
      </ul>

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
              Draft from {CAPABILITIES.find((c) => c.id === draft.capabilityId)?.label}
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
              {applying ? "Working…" : "Insert"}
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
              {applying ? "Working…" : "Replace"}
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
