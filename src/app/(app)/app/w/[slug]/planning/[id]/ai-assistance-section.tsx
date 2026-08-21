"use client";

import * as React from "react";
import { Sparkles, Wand2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  isManager,
  isPlanner,
  enabledCapabilities,
}: {
  workspaceSlug: string;
  contentItemId: string;
  isManager: boolean;
  isPlanner: boolean;
  enabledCapabilities: Set<string>;
}) {
  const [draft, setDraft] = React.useState<{
    capabilityId: string;
    text: string;
  } | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const canUse = isManager || isPlanner;

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
          const on = enabledCapabilities.has(
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
          <p className="text-label text-fg-muted">
            Insert / Replace / Try Again per §15. We never auto-save.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
