/**
 * Single source of truth for AI capability metadata.
 *
 * Previously this lived in three places — the agency admin form
 * (`ai-settings-form.tsx`), the workspace status card
 * (`app/w/[slug]/ai-settings/page.tsx`), and the content detail
 * AI section (`planning/[id]/ai-assistance-section.tsx`) — each
 * with its own copy, its own `wired: boolean`, and its own
 * list of which capabilities to render. After FEAT-03 (which
 * closed out `campaign_ideas`, `platform_adaptation`, and
 * `related_format_ideas` in `lib/ai/index.ts` and
 * `api/ai/generate/route.ts`) the UI was out of sync with the
 * backend: the form showed three "Coming soon" chips and the
 * content detail page only rendered three buttons, even though
 * six capabilities are reachable in the route + entitlement.
 *
 * GAP-AI-UX-2026-08-26 — the form's `wired: false` was
 * wrong. This module is the canonical list. Adding a capability
 * here lights it up in the agency form, the workspace status
 * card, and the content detail page; flipping
 * `enabledOnContentDetail: false` hides it from the planner
 * without changing the admin surface (used for capabilities
 * that exist but don't have a button-shaped entry point yet).
 *
 * The data here is safe to ship to the client bundle (labels,
 * descriptions, and a public default base URL). The server-only
 * check belongs at the actual provider call site (`api/ai/generate`)
 * and at the key-resolving helpers in `lib/ai/index.ts` — not on
 * the metadata table that both server and client render from.
 */
import type { ReactNode } from "react";

export type AiCapabilityId =
  | "campaign_ideas"
  | "brief_improvement"
  | "caption_drafts"
  | "platform_adaptation"
  | "related_format_ideas"
  | "completeness_check";

export interface AiCapabilityMetadata {
  /** Server-side identifier — matches the §15 enum and the `aiFeatureSettings.enabledCapabilities` allowlist. */
  id: AiCapabilityId;
  /** Planner-facing label. This is what the user sees on the content detail page. */
  label: string;
  /** Admin-facing label. Kept in sync with `label` by the audit notes below; the agency form uses this name. */
  adminLabel: string;
  /** One-line description shown in the admin and workspace status cards. */
  description: string;
  /**
   * Whether a button for this capability is rendered on the content
   * detail page. `true` for all capabilities whose `/api/ai/generate`
   * branch is wired and whose output is text the planner can
   * Insert / Replace / Copy.
   */
  enabledOnContentDetail: boolean;
  /**
   * Optional extra context for the planner (e.g. why the button
   * exists, what kind of draft it produces). Shown as a small
   * caption under the action button on the content detail page.
   */
  hint?: string;
  /**
   * Optional icon override. Defaults to a single shared icon in the
   * content detail page; setting this lets a capability carry its
   * own visual signal (e.g. a globe for platform adaptation).
   */
  icon?: ReactNode;
  /**
   * Will update — the content-item fields this capability touches
   * when the user clicks Replace. Surfaced in the AI panel as a
   * "Will update / Will not change" contract per AGENTS.md §U.
   * The contract is the user-facing answer to "what does clicking
   * Replace actually do?" — a regression that silently overwrites
   * fields not on this list is caught by the contract test.
   *
   * Empty array = the capability is read-only (e.g. a score /
   * diagnostic). Empty array is also valid for capabilities whose
   * output is a free-text draft that the user manually pastes; the
   * contract is the draft text, not a field list.
   */
  willUpdate?: ReadonlyArray<string>;
  /**
   * Will not change — the content-item fields this capability
   * deliberately leaves alone. Surfaced in the AI panel for
   * multi-field capabilities so the user sees "this does not touch
   * the visual direction" before clicking Apply. The list is a
   * closed set per capability (it does NOT enumerate every
   * non-touched field); the message is "we will leave these alone
   * even if it looks like we should", not "we won't touch anything
   * else".
   */
  willNotChange?: ReadonlyArray<string>;
}

/**
 * Canonical capability list. The `id` is the §15 enum value; the
 * `label` is the user-facing name. The `description` is the same
 * on both admin and planner surfaces — the workspace status card
 * previously used a different copy and the difference tripped
 * planners when they toggled the admin form and didn't see the
 * same name on the content page.
 */
export const AI_CAPABILITY_METADATA: ReadonlyArray<AiCapabilityMetadata> = [
  {
    id: "campaign_ideas",
    label: "Campaign ideas",
    adminLabel: "Campaign ideas",
    description: "Generate 3-5 campaign ideas that ladder up to the active brief.",
    enabledOnContentDetail: true,
    hint: "3-5 angle ideas, one line each.",
    // Read-only suggestion list — Replace / Insert do not write
    // back to the content item. The user picks one and uses it
    // as a starting point.
    willUpdate: [],
    willNotChange: ["title", "brief", "format", "channels", "schedule"],
  },
  {
    id: "brief_improvement",
    label: "Improve brief",
    adminLabel: "Brief improvement",
    description: "Tighten a vague brief into a clear Hook → Main message → CTA structure.",
    enabledOnContentDetail: true,
    hint: "Three labelled lines you can paste into the brief.",
    // Only the brief is touched. Everything else (format,
    // channels, schedule, format-specific payload) is left
    // alone so the planner's structural decisions survive.
    willUpdate: ["brief"],
    willNotChange: ["title", "format", "channels", "schedule", "format payload"],
  },
  {
    id: "caption_drafts",
    label: "Draft caption",
    adminLabel: "Caption / hook / CTA drafts",
    description: "Draft a caption with platform-aware tone; editable before save.",
    enabledOnContentDetail: true,
    hint: "One caption draft, ready to edit.",
    // Per-field scope: caption (and optional hashtags). The
    // per-field AI button surfaces the same contract.
    willUpdate: ["caption", "hashtags"],
    willNotChange: ["hook", "main message", "CTA", "visual direction"],
  },
  {
    id: "platform_adaptation",
    label: "Adapt to platform",
    adminLabel: "Platform adaptation",
    description: "Adapt a draft caption to a different channel (Instagram, TikTok, LinkedIn, X).",
    enabledOnContentDetail: true,
    hint: "Rewrites the draft for the target platform's conventions.",
    willUpdate: ["caption"],
    willNotChange: ["format", "channels", "schedule", "visual direction"],
  },
  {
    id: "related_format_ideas",
    label: "Related format ideas",
    adminLabel: "Related format ideas",
    description: "Suggest adjacent formats for a piece of content (carousel ↔ reel ↔ story).",
    enabledOnContentDetail: true,
    hint: "3-5 format suggestions from the fixed format list.",
    willUpdate: [],
    willNotChange: ["title", "brief", "format", "channels", "schedule"],
  },
  {
    id: "completeness_check",
    label: "Check completeness",
    adminLabel: "Brief completeness check",
    description: "Score how ready a brief is for creative handoff and flag the missing pieces.",
    enabledOnContentDetail: true,
    hint: "Score (0-100) plus the missing pieces.",
    // Read-only diagnostic — nothing is written.
    willUpdate: [],
    willNotChange: ["title", "brief", "format", "channels", "schedule", "format payload"],
  },
] as const;

const BY_ID = new Map(AI_CAPABILITY_METADATA.map((c) => [c.id, c] as const));

/**
 * Resolve metadata for a single capability by id. Returns `null`
 * for an unknown id so callers can degrade gracefully (e.g. an
 * older row in the DB that references a removed capability).
 */
export function getAiCapabilityMetadata(id: string): AiCapabilityMetadata | null {
  return BY_ID.get(id as AiCapabilityId) ?? null;
}

/**
 * The labels a workspace manager / planner sees on the workspace
 * status card and the content detail page. Order matches
 * `AI_CAPABILITY_METADATA`.
 */
export const PLANNER_FACING_CAPABILITIES: ReadonlyArray<AiCapabilityMetadata> =
  AI_CAPABILITY_METADATA;

/**
 * The labels an agency admin sees on the configuration form.
 * `adminLabel` is formal ("Brief improvement"); `label` is the
 * conversational version used on the planner surface.
 */
export const ADMIN_FACING_CAPABILITIES: ReadonlyArray<AiCapabilityMetadata> =
  AI_CAPABILITY_METADATA;

/**
 * Provider metadata for the agency / workspace status cards.
 *
 * The actual transport is Anthropic-compat at
 * `MINIMAX_BASE_URL/v1/messages` — verified against
 * `lib/ai/index.ts` and `api/ai/generate/route.ts` (both send
 * `x-api-key` + `anthropic-version: 2023-06-01`). AGENTS.md
 * previously claimed "OpenAI-compat" which was wrong; the model
 * is `MiniMax-M3` and the base URL defaults to
 * `https://api.minimax.io/anthropic`.
 */
export const AI_PROVIDER = {
  vendor: "MiniMax",
  compat: "Anthropic-compat",
  baseUrlEnv: "MINIMAX_BASE_URL",
  modelEnv: "MINIMAX_MODEL",
  defaultModel: "MiniMax-M3",
  defaultBaseUrl: "https://api.minimax.io/anthropic",
} as const;
