import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  brandAssets,
  brandPublishingRules,
  brandVoiceRules,
  campaigns,
  contentItems,
  contentPillars,
  socialChannels,
} from "@/lib/db/schema";

/**
 * AI context loader.
 *
 * Pre-FEAT-09 the `/api/ai/generate` route accepted a
 * `contextSelection` and logged it to the audit table, but the
 * prompt builders in `lib/ai/index.ts` never actually consumed
 * the data — the model got `Title: ..., Format: ...,
 * Audience: <workspace name>, Brief: ...` and nothing else. The
 * `Audience: <workspace name>` was a misnomer too: it was the
 * workspace's display name, not the actual audience.
 *
 * FEAT-09 closes the gap. The route passes a selection like
 * `{ brandKit: true, campaign: true }`; this module resolves the
 * selection against the workspace's data and returns a typed
 * object the builders can append to the user message. The model
 * now sees real Brand Kit tone, the active campaign's objective,
 * the workspace's content pillars, the platforms it's publishing
 * to, and a small sample of recently-approved content so the
 * rewrite can mirror the agency's editorial style.
 *
 * Phase 8 (2026-08-28) extends the loader with a `brandVisuals`
 * toggle that pulls brand colors, fonts, and publishing rules
 * into the prompt. The visual brand context lets the AI
 * recommend on-brand palettes and type pairings in caption
 * drafts, and the publishing rules let it follow the agency's
 * editorial guardrails (alt-text conventions, hashtag norms,
 * compliance reminders) at draft time.
 *
 * Each branch is gated by its own `if` so a workspace with no
 * Brand Kit rows, no active campaign, etc. is graceful — the
 * prompt just omits the empty sections.
 */
export interface AiContextSelection {
  brandKit?: boolean;
  /** Phase 8 — load brand colors, fonts, and publishing rules. */
  brandVisuals?: boolean;
  campaign?: boolean;
  pillars?: boolean;
  channels?: boolean;
  approvedContent?: boolean;
}

export interface AiContext {
  brandVoice: { tone: string[]; do: string[]; dont: string[] };
  /**
   * Phase 8 — workspace visual brand. Omitted (or `null`) when the
   * planner did not tick the `brandVisuals` toggle. The shape is
   * the same regardless of population; empty arrays are valid (the
   * prompt just omits the empty sections).
   */
  brandVisuals?: {
    colors: { name: string; hex: string; role: string | null }[];
    fonts: { name: string; family: string; weight: number; role: string }[];
    publishingRules: { ruleType: string; title: string; content: string }[];
  } | null;
  campaign: { name: string; objective: string | null; description: string | null } | null;
  pillars: { name: string; description: string | null }[];
  channels: { platform: string; accountName: string }[];
  approvedContentSamples: { title: string; brief: string | null }[];
}

export const EMPTY_CONTEXT: AiContext = {
  brandVoice: { tone: [], do: [], dont: [] },
  brandVisuals: null,
  campaign: null,
  pillars: [],
  channels: [],
  approvedContentSamples: [],
};

/**
 * Resolve the context for a content item. The `selection` is the
 * bitmask the planner toggled in the UI; the loader respects it
 * and skips the corresponding DB query when the bit is off. The
 * returned object always has the same shape — empty arrays /
 * nulls for the unused branches — so the prompt builder can
 * render the same template regardless of selection.
 */
export async function loadAiContext(input: {
  workspaceId: string;
  contentItemId: string;
  selection: AiContextSelection;
}): Promise<AiContext> {
  const out: AiContext = {
    brandVoice: { tone: [], do: [], dont: [] },
    brandVisuals: null,
    campaign: null,
    pillars: [],
    channels: [],
    approvedContentSamples: [],
  };

  // Pull every enabled branch in parallel. Each query is
  // workspace-scoped and uses an existing index; even a fully
  // checked selection is a single round-trip group.
  const tasks: Promise<void>[] = [];

  if (input.selection.brandKit) {
    tasks.push(
      db
        .select({ ruleType: brandVoiceRules.ruleType, content: brandVoiceRules.content })
        .from(brandVoiceRules)
        .where(
          and(
            eq(brandVoiceRules.workspaceId, input.workspaceId),
            isNull(brandVoiceRules.archivedAt),
          ),
        )
        .orderBy(brandVoiceRules.sortOrder)
        .then((rows) => {
          for (const r of rows) {
            if (r.ruleType === "tone") out.brandVoice.tone.push(r.content);
            else if (r.ruleType === "do") out.brandVoice.do.push(r.content);
            else if (r.ruleType === "dont") out.brandVoice.dont.push(r.content);
          }
        }),
    );
  }

  // Phase 8 — load brand visuals (colors, fonts, publishing rules).
  // The toggle is independent of `brandKit` so a planner who only
  // wants visual context doesn't have to also pull voice rules.
  if (input.selection.brandVisuals) {
    out.brandVisuals = { colors: [], fonts: [], publishingRules: [] };
    tasks.push(
      db
        .select({
          name: brandAssets.name,
          value: brandAssets.value,
          colorRole: brandAssets.colorRole,
        })
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.workspaceId, input.workspaceId),
            eq(brandAssets.kind, "color"),
            isNull(brandAssets.archivedAt),
          ),
        )
        .orderBy(brandAssets.createdAt)
        .then((rows) => {
          for (const r of rows) {
            const v = (r.value ?? {}) as Record<string, unknown>;
            const hex =
              (typeof v.hex === "string" && v.hex) ||
              (typeof v.color === "string" && v.color) ||
              (typeof v.value === "string" && v.value) ||
              "";
            if (!hex) continue;
            // Prefer the column over the jsonb value so a future
            // column-only update does not require a value rewrite.
            // Legacy rows (pre-Phase-8) had role in the jsonb
            // value; the fallback chain reads both shapes.
            const role =
              (typeof r.colorRole === "string" && r.colorRole) ||
              (typeof v.role === "string" && v.role) ||
              (typeof v.colorRole === "string" && v.colorRole) ||
              null;
            out.brandVisuals?.colors.push({ name: r.name, hex, role });
          }
        }),
    );
    tasks.push(
      db
        .select({ name: brandAssets.name, value: brandAssets.value })
        .from(brandAssets)
        .where(
          and(
            eq(brandAssets.workspaceId, input.workspaceId),
            eq(brandAssets.kind, "font"),
            isNull(brandAssets.archivedAt),
          ),
        )
        .orderBy(brandAssets.createdAt)
        .then((rows) => {
          for (const r of rows) {
            const v = (r.value ?? {}) as Record<string, unknown>;
            const family =
              (typeof v.family === "string" && v.family) ||
              (typeof v.name === "string" && v.name) ||
              "";
            const weight =
              typeof v.weight === "number"
                ? v.weight
                : typeof v.weight === "string"
                  ? Number(v.weight) || 400
                  : 400;
            const role = (typeof v.role === "string" && v.role) || "body";
            if (!family) continue;
            out.brandVisuals?.fonts.push({ name: r.name, family, weight, role });
          }
        }),
    );
    tasks.push(
      db
        .select({
          ruleType: brandPublishingRules.ruleType,
          title: brandPublishingRules.title,
          content: brandPublishingRules.content,
        })
        .from(brandPublishingRules)
        .where(
          and(
            eq(brandPublishingRules.workspaceId, input.workspaceId),
            isNull(brandPublishingRules.archivedAt),
          ),
        )
        .orderBy(brandPublishingRules.sortOrder, brandPublishingRules.createdAt)
        .then((rows) => {
          for (const r of rows) {
            out.brandVisuals?.publishingRules.push({
              ruleType: r.ruleType,
              title: r.title,
              content: r.content,
            });
          }
        }),
    );
  }

  if (input.selection.campaign) {
    tasks.push(
      db
        .select({
          name: campaigns.name,
          objective: campaigns.objective,
          description: campaigns.description,
        })
        .from(campaigns)
        .where(
          and(
            eq(campaigns.workspaceId, input.workspaceId),
            eq(campaigns.status, "active"),
            isNull(campaigns.archivedAt),
          ),
        )
        .orderBy(desc(campaigns.createdAt))
        .limit(1)
        .then((rows) => {
          if (rows[0]) {
            out.campaign = {
              name: rows[0].name,
              objective: rows[0].objective,
              description: rows[0].description,
            };
          }
        }),
    );
  }

  if (input.selection.pillars) {
    tasks.push(
      db
        .select({ name: contentPillars.name, description: contentPillars.description })
        .from(contentPillars)
        .where(
          and(eq(contentPillars.workspaceId, input.workspaceId), isNull(contentPillars.archivedAt)),
        )
        .orderBy(contentPillars.name)
        .then((rows) => {
          out.pillars = rows.map((r) => ({ name: r.name, description: r.description }));
        }),
    );
  }

  if (input.selection.channels) {
    tasks.push(
      db
        .select({ platform: socialChannels.platform, accountName: socialChannels.accountName })
        .from(socialChannels)
        .where(
          and(
            eq(socialChannels.workspaceId, input.workspaceId),
            eq(socialChannels.isActive, true),
            isNull(socialChannels.archivedAt),
          ),
        )
        .orderBy(socialChannels.platform, socialChannels.accountName)
        .then((rows) => {
          out.channels = rows.map((r) => ({ platform: r.platform, accountName: r.accountName }));
        }),
    );
  }

  if (input.selection.approvedContent) {
    // The last 5 shipped items give the model concrete examples
    // of what "good" looks like in this agency. We keep the
    // payload tiny (title + first 240 chars of brief) so the
    // prompt stays under the budget. `published` and
    // `partially_published` are the truly-shipped states;
    // `ready_to_publish` is the agency-approved and queued state.
    tasks.push(
      db
        .select({
          title: contentItems.title,
          brief: contentItems.brief,
        })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.workspaceId, input.workspaceId),
            sql`${contentItems.status} IN ('ready_to_publish', 'published', 'partially_published')`,
          ),
        )
        .orderBy(desc(contentItems.updatedAt))
        .limit(5)
        .then((rows) => {
          out.approvedContentSamples = rows.map((r) => ({
            title: r.title,
            brief: r.brief ? r.brief.slice(0, 240) : null,
          }));
        }),
    );
  }

  await Promise.all(tasks);
  return out;
}

/**
 * True when the resolved context has at least one branch with
 * data. Used by the route to decide whether to log
 * `contextManifest` as "used" — if the planner ticked the
 * Brand Kit box but the workspace has zero voice rules, the
 * manifest is honest about that instead of pretending context
 * was included.
 */
export function isContextMeaningful(ctx: AiContext): boolean {
  if (
    ctx.brandVoice.tone.length > 0 ||
    ctx.brandVoice.do.length > 0 ||
    ctx.brandVoice.dont.length > 0
  ) {
    return true;
  }
  if (ctx.brandVisuals) {
    if (
      ctx.brandVisuals.colors.length > 0 ||
      ctx.brandVisuals.fonts.length > 0 ||
      ctx.brandVisuals.publishingRules.length > 0
    ) {
      return true;
    }
  }
  return (
    ctx.campaign !== null ||
    ctx.pillars.length > 0 ||
    ctx.channels.length > 0 ||
    ctx.approvedContentSamples.length > 0
  );
}
