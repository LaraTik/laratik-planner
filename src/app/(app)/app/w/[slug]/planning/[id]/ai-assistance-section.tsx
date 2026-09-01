"use client";

import * as React from "react";
import {
  Sparkles,
  Wand2,
  CornerDownLeft,
  Replace,
  RefreshCcw,
  Lightbulb,
  ListChecks,
  Globe2,
  Link2,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { applyAiDraftAction } from "../actions";
import {
  AI_CAPABILITY_METADATA,
  getAiCapabilityMetadata,
  type AiCapabilityMetadata,
} from "@/lib/ai/capabilities";
import { DiffPreview } from "@/components/ai/diff-preview";

/**
 * AI assistance entry points on the content detail page.
 *
 * FEAT-09 — the section was previously a thin wrapper around
 * three hard-coded action buttons. The route now loads brand
 * voice / campaign / pillars / channels / approved-content
 * context per the planner's selection, and `brief_improvement`
 * returns three variants the planner can pick from. The
 * Replace action is gated by an explicit DiffPreview confirm
 * because the old brief was previously overwritten silently.
 *
 * Insert is hidden for `brief_improvement` — appending a 3-line
 * "Hook: / Main: / CTA:" block below an existing brief makes
 * no sense; the whole point of the capability is replacement.
 * Insert is still the right action for `caption_drafts`
 * (append a caption below a brief).
 */

const ICON_BY_ID = {
  campaign_ideas: Lightbulb,
  brief_improvement: ListChecks,
  caption_drafts: Wand2,
  platform_adaptation: Globe2,
  related_format_ideas: Link2,
  completeness_check: ListChecks,
} as const;

// The planner-detail surface lists AI capabilities that
// complement the per-field buttons in the format-payload
// editor. We intentionally EXCLUDE `caption_drafts` here:
// the per-field `<PerFieldAiSuggest>` button next to every
// caption/hook/CTA field is the primary surface, and a
// separate "Draft caption" card would be a duplicate entry
// point. The metadata registry still lists it for surfaces
// where the per-field button doesn't apply (e.g. the team
// page).
const PLANNER_CAPABILITIES: ReadonlyArray<AiCapabilityMetadata> = AI_CAPABILITY_METADATA.filter(
  (c) => c.enabledOnContentDetail && c.id !== "caption_drafts",
);

type OffReason = "agency-disabled" | "no-key" | "capability-off";

function offReasonFor(
  cap: AiCapabilityMetadata,
  agencyEnabled: boolean,
  enabledCapabilities: ReadonlyArray<string>,
  hasKey: boolean,
): OffReason | null {
  if (!agencyEnabled) return "agency-disabled";
  if (!hasKey) return "no-key";
  if (!enabledCapabilities.includes(cap.id)) return "capability-off";
  return null;
}

const OFF_REASON_LABEL: Record<OffReason, string> = {
  "agency-disabled": "Agency switch is off",
  "no-key": "No AI key configured",
  "capability-off": "Agency disabled this capability",
};

/**
 * The categories a planner can include with their request.
 * Mirrors the `AiContextSelection` shape in `lib/ai/context.ts`
 * but kept inline (server-only modules can't be imported into
 * a client component) so the route's `loadAiContext` receives
 * the same keys.
 */
const CONTEXT_TOGGLES: ReadonlyArray<{
  key: "brandKit" | "campaign" | "pillars" | "channels" | "approvedContent";
  label: string;
  description: string;
}> = [
  {
    key: "brandKit",
    label: "Brand voice",
    description: "Apply the workspace's tone / do / don't rules.",
  },
  {
    key: "campaign",
    label: "Active campaign",
    description: "Tie the rewrite to the current campaign objective.",
  },
  {
    key: "pillars",
    label: "Content pillars",
    description: "Reference the workspace's content pillars.",
  },
  {
    key: "channels",
    label: "Target channels",
    description: "Mention the platforms this will publish to.",
  },
  {
    key: "approvedContent",
    label: "Approved content samples",
    description: "Mirror the tone of recently shipped content.",
  },
];

const DEFAULT_CONTEXT_SELECTION: Record<string, boolean> = {
  brandKit: true,
  campaign: true,
  pillars: true,
  channels: false,
  approvedContent: false,
};

interface DraftVariant {
  /** The variant text exactly as the model returned it. */
  text: string;
  /** Stable client-side id for React keys. */
  id: string;
}

interface DraftState {
  capabilityId: string;
  variants: DraftVariant[];
}

export function AiAssistanceSection({
  workspaceSlug,
  contentItemId,
  contentStatus,
  isManager,
  isPlanner,
  enabledCapabilities,
  agencyEnabled,
  hasKey,
  currentBrief,
}: {
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  isManager: boolean;
  isPlanner: boolean;
  enabledCapabilities: string[];
  agencyEnabled: boolean;
  hasKey: boolean;
  /**
   * The current brief text. The route already has this; the
   * server passes it down so the DiffPreview can render the
   * "before" side without an extra round-trip.
   */
  currentBrief: string;
}) {
  const [draft, setDraft] = React.useState<DraftState | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [applyError, setApplyError] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState<null | "insert" | "replace">(null);
  const [applying, setApplying] = React.useState(false);
  const [selectedVariantId, setSelectedVariantId] = React.useState<string | null>(null);
  const [replaceConfirmed, setReplaceConfirmed] = React.useState(false);
  const [contextSelection, setContextSelection] =
    React.useState<Record<string, boolean>>(DEFAULT_CONTEXT_SELECTION);
  const [platformTarget, setPlatformTarget] = React.useState<
    "instagram" | "tiktok" | "linkedin" | "x"
  >("instagram");

  const canUse = isManager || isPlanner;
  const canEditBrief = contentStatus === "draft" || contentStatus === "changes_requested";

  // Wrap the variant-selection setter so the diff confirm is
  // reset on every pick. This avoids a useEffect (React 19
  // discourages setState in effects for this case — the new
  // confirmation context is meaningful only at the moment the
  // pick happens, not on a later render).
  const pickVariant = React.useCallback((id: string) => {
    setSelectedVariantId(id);
    setReplaceConfirmed(false);
  }, []);

  const onInvoke = async (capabilityId: string) => {
    setError(null);
    setPendingId(capabilityId);
    setDraft(null);
    setApplied(null);
    setSelectedVariantId(null);
    setReplaceConfirmed(false);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentItemId,
          capability: capabilityId,
          contextSelection,
          ...(capabilityId === "platform_adaptation"
            ? { targetPlatform: platformTarget, sourceText: draft?.variants[0]?.text ?? "" }
            : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      const body = (await res.json()) as {
        text?: string;
        caption?: string;
        variants?: string[];
      };
      // `brief_improvement` returns `variants: string[]`; every
      // other capability returns a single `text`. Fall back to
      // splitting on `---` for older servers that don't include
      // the `variants` field.
      const text = body.text ?? body.caption ?? "";
      const rawVariants =
        body.variants && body.variants.length > 0
          ? body.variants
          : text.includes("---")
            ? text
                .split(/\n\s*---\s*\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : [text];
      const variants: DraftVariant[] = rawVariants.map((v, i) => ({
        id: `${capabilityId}-${Date.now()}-${i}`,
        text: v,
      }));
      setDraft({ capabilityId, variants });
      setSelectedVariantId(variants[0]?.id ?? null);
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
    if (!draft || !selectedVariantId) return;
    const variant = draft.variants.find((v) => v.id === selectedVariantId);
    if (!variant) return;
    if (mode === "replace" && !replaceConfirmed) return;
    setApplyError(null);
    setApplied(null);
    setApplying(true);
    try {
      const res = await applyAiDraftAction({
        workspaceSlug,
        contentItemId,
        draftText: variant.text,
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

  const selectedVariant =
    draft && selectedVariantId
      ? (draft.variants.find((v) => v.id === selectedVariantId) ?? null)
      : null;

  const isBriefImprovement = draft?.capabilityId === "brief_improvement";

  return (
    <Card data-testid="ai-assistance-section">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="text-primary h-5 w-5" aria-hidden="true" />
          <CardTitle>AI assistance</CardTitle>
        </div>
        {/* The previous "Status (read-only)" link was a developer
            affordance. The agency admin can still open the
            configuration page from the AI settings page; here we
            just show the contextual note. The link is preserved
            for operators only. */}
        {isManager ? (
          <a
            href={`/app/w/${workspaceSlug}/ai-settings`}
            className="text-label text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            data-testid="ai-open-workspace-settings"
          >
            AI settings
          </a>
        ) : null}
      </header>
      <CardDescription>Drafts only — the human inserts or replaces.</CardDescription>

      {!agencyEnabled || !hasKey ? (
        <div
          className="border-border bg-warning-soft text-body text-fg-primary mt-4 space-y-2 rounded-[var(--radius-control)] border p-3"
          data-testid="ai-assistance-disabled-banner"
          role="status"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">AI assistance is currently off</p>
              <p className="text-fg-secondary mt-1">
                {!agencyEnabled
                  ? "An agency admin needs to enable the AI master switch before any capability button can run."
                  : "No AI API key is configured. The agency admin can paste one at Agency Settings → AI configuration."}
              </p>
            </div>
          </div>
          {isManager ? (
            <div className="border-border bg-surface-subtle text-label ms-6 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border p-2">
              <span className="text-fg-secondary">
                Need to know <em>why</em> it&apos;s off?
              </span>
              <a
                href="/app/agency-settings/ai"
                className="text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                data-testid="ai-open-agency-config-from-banner"
              >
                Open the AI diagnostic panel
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <details
        className="border-border bg-surface-subtle mt-4 rounded-[var(--radius-control)] border p-3"
        data-testid="ai-context-selection"
      >
        {/* Re-labeled: the previous copy "Send with context (3 of 5 on)"
            was a technical progress indicator. The new summary tells
            the user *what* AI is using and exposes the per-context
            toggles behind the same disclosure. The visible summary
            on the normal (collapsed) state is a single line that
            reads as a product affordance, not a configuration panel. */}
        <summary className="text-label text-fg-primary cursor-pointer font-semibold">
          AI uses your brand, campaign and content context
        </summary>
        <p className="text-label text-fg-muted mt-2">
          By default AI includes the workspace&apos;s brand voice, active campaign and content
          pillars. Turn any of these off for a clean-room draft.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {CONTEXT_TOGGLES.map((toggle) => (
            <li
              key={toggle.key}
              className="border-border bg-surface flex items-start gap-2 rounded-[var(--radius-control)] border p-2"
            >
              <Checkbox
                id={`ai-context-${toggle.key}`}
                checked={Boolean(contextSelection[toggle.key])}
                onCheckedChange={(checked) =>
                  setContextSelection((s) => ({ ...s, [toggle.key]: checked === true }))
                }
                className="mt-0.5 shrink-0"
                data-testid={`ai-context-toggle-${toggle.key}`}
              />
              <label
                htmlFor={`ai-context-${toggle.key}`}
                className="text-label text-fg-primary flex min-w-0 flex-1 flex-col gap-0.5"
              >
                <span className="font-semibold">{toggle.label}</span>
                <span className="text-fg-muted">{toggle.description}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>

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
              {/* Header — label + icon. The previous "Ready / Off"
                  badges provided no actionable signal to a normal
                  user; we now only surface the off reason as plain
                  text when the capability is unavailable. The
                  `data-ai-state` attribute is the test contract. */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-body text-fg-primary flex items-center gap-2 font-semibold">
                  <Icon className="text-fg-secondary h-3.5 w-3.5" aria-hidden="true" />
                  {cap.label}
                </p>
              </div>
              <p className="text-label text-fg-muted">{cap.description}</p>
              {cap.hint ? <p className="text-label text-fg-muted italic">{cap.hint}</p> : null}
              {!on && reason ? (
                <p
                  className="text-label text-warning"
                  data-testid={`ai-action-off-reason-${cap.id}`}
                  data-ai-state="off"
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
          className="border-border bg-surface mt-4 space-y-3 rounded-[var(--radius-control)] border p-3"
          data-testid="ai-assistance-draft"
        >
          <p className="text-label text-fg-muted font-semibold">
            {draft.variants.length > 1
              ? `${draft.variants.length} ${AI_CAPABILITY_METADATA.find((c) => c.id === draft.capabilityId)?.label ?? ""} drafts — pick one`
              : `Draft from ${AI_CAPABILITY_METADATA.find((c) => c.id === draft.capabilityId)?.label ?? ""}`}
          </p>

          {draft.variants.length > 1 ? (
            <ul
              className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="ai-assistance-variants"
            >
              {draft.variants.map((variant, idx) => {
                const isSelected = variant.id === selectedVariantId;
                return (
                  <li
                    key={variant.id}
                    className={`flex flex-col gap-2 rounded-[var(--radius-control)] border p-3 ${
                      isSelected
                        ? "border-primary bg-primary-subtle/40"
                        : "border-border bg-surface-subtle"
                    }`}
                    data-testid={`ai-assistance-variant-${idx}`}
                  >
                    <p className="text-label text-fg-muted flex items-center justify-between font-semibold">
                      Variant {idx + 1}
                      {isSelected ? (
                        <Check className="text-primary h-3.5 w-3.5" aria-hidden="true" />
                      ) : null}
                    </p>
                    <p className="text-body text-fg-primary whitespace-pre-wrap">{variant.text}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => pickVariant(variant.id)}
                      data-testid={`ai-assistance-variant-${idx}-select`}
                    >
                      {isSelected ? "Selected" : "Use this"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : selectedVariant ? (
            <div
              className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
              data-testid="ai-assistance-single-draft"
            >
              <p className="text-body text-fg-primary whitespace-pre-wrap">
                {selectedVariant.text}
              </p>
            </div>
          ) : null}

          {selectedVariant ? (
            <>
              {/* Will update / Will not change contract (AGENTS.md §U).
                  For capabilities that touch content fields, the user
                  MUST see exactly which fields the AI will write before
                  they click Replace. The contract is also the
                  audit-trail signal: a regression that silently writes
                  a field not listed here is caught by the contract
                  test in `tests/unit/ai/capabilities-metadata.test.ts`.
                  Read-only capabilities (campaign_ideas,
                  related_format_ideas, completeness_check) collapse
                  the contract to a single "Read-only — nothing is
                  written" line so the user is never left guessing. */}
              <AiWillUpdateWillNotChange capabilityId={draft.capabilityId} />
              <div className="flex flex-wrap items-center gap-2">
                {/* Insert is hidden for brief_improvement — the whole
                  point of "improve brief" is replacement, and
                  appending a 3-line structured rewrite below an
                  existing brief is a worse outcome than no action. */}
                {!isBriefImprovement ? (
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
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onApply("replace")}
                  disabled={applying || !canEditBrief || (isBriefImprovement && !replaceConfirmed)}
                  title={
                    isBriefImprovement && !replaceConfirmed
                      ? "Confirm the diff below to enable Replace"
                      : canEditBrief
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
                  onClick={() => onCopy(selectedVariant.text)}
                  data-testid="ai-assistance-copy"
                >
                  Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onInvoke(draft.capabilityId)}
                  disabled={pendingId === draft.capabilityId}
                  data-testid="ai-assistance-try-again"
                >
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {pendingId === draft.capabilityId ? "Working…" : "Re-roll"}
                </Button>
              </div>
            </> // close the contract + action button fragment
          ) : null}

          {/* FEAT-09 — the diff gate. Only rendered for
              brief_improvement (the capability where Replace
              silently overwrites a possibly-large brief). For
              caption_drafts and the others, Replace targets
              format-specific fields, not the brief, and the
              existing one-click affordance is fine. */}
          {isBriefImprovement && selectedVariant ? (
            <DiffPreview
              before={currentBrief}
              after={selectedVariant.text}
              beforeLabel="Current brief"
              afterLabel="AI draft"
              confirmed={replaceConfirmed}
              onConfirmedChange={setReplaceConfirmed}
              testIdPrefix="ai-diff"
            />
          ) : null}

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
          {!canEditBrief ? (
            <p className="text-label text-fg-muted">
              Item is in {contentStatus.replaceAll("_", " ")} — the brief is frozen for review. Use
              &ldquo;Re-roll&rdquo; for a fresh draft, or copy the text manually.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * AiWillUpdateWillNotChange — the "Will update / Will not change"
 * contract per AGENTS.md §U. Surfaces exactly which fields the
 * selected capability writes to when the user clicks Replace.
 *
 * The contract is intentionally per-capability (not a generic
 * "may modify some fields" disclaimer) so the planner sees the
 * real field names — a vague disclaimer is what AGENTS.md §U
 * flagged as the source of the "AI silently overwrote my
 * caption" bug.
 *
 * Rendering rules:
 *  - Capability has `willUpdate.length > 0` → render both
 *    "Will update" and "Will not change" lists.
 *  - Capability has `willUpdate.length === 0` → render a
 *    single "Read-only — nothing is written" line. This covers
 *    campaign_ideas, related_format_ideas, completeness_check.
 *  - Unknown capability id → render a defensive "unknown"
 *    line. The route rejects unknown ids at the server, but
 *    a stale client bundle could carry one; the user deserves
 *    a clear signal rather than a silent no-op.
 *
 * Pure presentational — server-renderable, no client state.
 */
function AiWillUpdateWillNotChange({ capabilityId }: { capabilityId: string }) {
  const meta = getAiCapabilityMetadata(capabilityId);
  if (!meta) {
    return (
      <p
        data-testid="ai-assistance-contract-unknown"
        className="text-label text-fg-muted font-semibold"
      >
        Unknown capability — nothing will be written.
      </p>
    );
  }
  const willUpdate = meta.willUpdate ?? [];
  const willNotChange = meta.willNotChange ?? [];
  if (willUpdate.length === 0) {
    return (
      <p
        data-testid="ai-assistance-contract-readonly"
        className="text-label text-fg-muted font-semibold"
      >
        Read-only suggestion — nothing is written to the content item.
      </p>
    );
  }
  return (
    <div
      className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
      data-testid="ai-assistance-contract"
    >
      <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">
        Clicking Replace will…
      </p>
      <ul className="mt-1 space-y-0.5" data-testid="ai-assistance-contract-will-update">
        {willUpdate.map((field) => (
          <li
            key={field}
            className="text-body text-fg-primary inline-flex items-center gap-1.5 font-medium"
          >
            <Check className="text-success h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              update <span className="font-semibold">{field}</span>
            </span>
          </li>
        ))}
      </ul>
      {willNotChange.length > 0 ? (
        <>
          <p className="text-label text-fg-muted mt-2 font-semibold tracking-wide uppercase">
            …and will not touch
          </p>
          <ul className="mt-1 space-y-0.5" data-testid="ai-assistance-contract-will-not-change">
            {willNotChange.map((field) => (
              <li
                key={field}
                className="text-body text-fg-secondary inline-flex items-center gap-1.5 font-medium"
              >
                <X className="text-fg-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="italic">{field}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
