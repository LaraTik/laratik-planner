import * as React from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Info, Sparkles, ArrowRight } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * SettingsHealth — per-section coverage card on every settings
 * page (Settings refactor Phase A). Mirrors the brand-kit
 * equivalent but tailored to settings: each section has its
 * own "what feeds the AI" line and a deterministic suggestion
 * derived from the section's metrics.
 *
 * The card is intentionally pure (no AI call). Suggestions are
 * pure functions of the supplied metrics; tests can pin them.
 * The "AI suggests lead times" affordance ships in Phase B as
 * a per-section button.
 */
type Section = "lifecycle" | "lead-times" | "defaults" | "approvals";

type LifecycleMetrics = {
  hasTimezone?: boolean;
  hasMonthlyTarget?: boolean;
  monthlyTarget?: number | null;
};

type LeadTimeMetrics = {
  total?: number;
  contentApprovalLeadDays?: number;
  designCompleteLeadDays?: number;
  creativeApprovalLeadDays?: number;
  readyToPublishLeadDays?: number;
};

type DefaultsMetrics = {
  designer?: boolean;
  contentReviewer?: boolean;
  internalCreative?: boolean;
  clientReviewer?: boolean;
};

type ApprovalsMetrics = {
  mode?: "simple" | "internal_then_client";
};

type Metrics = LifecycleMetrics | LeadTimeMetrics | DefaultsMetrics | ApprovalsMetrics;

const SECTION_LABEL: Record<Section, string> = {
  lifecycle: "Lifecycle",
  "lead-times": "Lead times",
  defaults: "Default assignments",
  approvals: "Approval mode",
};

const SECTION_BLURB: Record<Section, string> = {
  lifecycle:
    "Timezone + monthly target. Used for the calendar, lead-time math, and the planning KPI bar.",
  "lead-times":
    "Four numbers that drive every 'auto-suggest a planned date' on the planning surface.",
  defaults:
    "Pre-fills on Quick Create. Per-item overrides always win — the default is a shortcut, not a rule.",
  approvals:
    "How many approval steps a piece of content needs before publish. Internal only, or internal + client.",
};

function suggestionsFor(section: Section, m: Metrics): string[] {
  switch (section) {
    case "lifecycle": {
      const mt = m as LifecycleMetrics;
      if (!mt.hasTimezone)
        return ["Pick a workspace timezone so the calendar renders in local time."];
      if (!mt.hasMonthlyTarget)
        return [
          "Set a monthly content target so the planning KPI bar can show on-track / at-risk / off-track.",
        ];
      if ((mt.monthlyTarget ?? 0) < 4)
        return [
          "Your target is fewer than 1 post per week. Most agencies plan against 8-24 posts per month.",
        ];
      if ((mt.monthlyTarget ?? 0) > 60)
        return [
          "A target above 60 posts / month means more than 2 posts per business day. Consider whether the team can sustain it.",
        ];
      return ["Healthy lifecycle setup."];
    }
    case "lead-times": {
      const lt = m as LeadTimeMetrics;
      const c = lt.contentApprovalLeadDays ?? 0;
      const d = lt.designCompleteLeadDays ?? 0;
      const cr = lt.creativeApprovalLeadDays ?? 0;
      const p = lt.readyToPublishLeadDays ?? 0;
      const total = c + d + cr + p;
      if (total === 0) return ["Set at least one lead time before planning the first post."];
      if (total < 5)
        return [
          "Total lead time under 5 business days. Most agencies need at least 8-12 to keep quality high.",
        ];
      if (total > 30)
        return [
          "Total lead time over 30 business days — a 6-week cycle. The planner may struggle to hit publishing windows.",
        ];
      if (c < 3)
        return [
          "Content approval under 3 days. The writer may not have time to incorporate the content lead's feedback.",
        ];
      if (c > 14)
        return [
          "Content approval over 14 days. The brief is sitting idle for too long before the first pass.",
        ];
      if (d < 2)
        return [
          "Design complete under 2 days. The designer is producing first-pass art in under 2 business days.",
        ];
      return ["Healthy lead-time spread."];
    }
    case "defaults": {
      const df = m as DefaultsMetrics;
      const filled = [
        df.designer,
        df.contentReviewer,
        df.internalCreative,
        df.clientReviewer,
      ].filter(Boolean).length;
      if (filled === 0)
        return [
          "No default assignees yet. Every new content item will require a manual pick on the Quick Create form.",
        ];
      if (filled < 2)
        return [
          "Only 1 default assignee. Plan against at least the designer + content reviewer so the team has a clear first stop.",
        ];
      if (filled < 4)
        return [
          "Most slots have a default. Add the missing slot so every role is auto-pre-filled on new items.",
        ];
      return ["All four roles have a default assignee."];
    }
    case "approvals": {
      const ap = m as ApprovalsMetrics;
      if (ap.mode === "simple")
        return [
          "Internal approval only. Switch to 'Internal, then client' if the brand has an external stakeholder who needs to sign off.",
        ];
      return ["Internal, then client. The creative_approval + client_review stages are active."];
    }
  }
}

function coverStatus(section: Section, m: Metrics): "empty" | "thin" | "ok" {
  switch (section) {
    case "lifecycle": {
      const mt = m as LifecycleMetrics;
      if (!mt.hasTimezone) return "empty";
      if (!mt.hasMonthlyTarget) return "thin";
      return "ok";
    }
    case "lead-times": {
      const lt = m as LeadTimeMetrics;
      const total = lt.total ?? 0;
      if (total === 0) return "empty";
      if (total < 5 || total > 30) return "thin";
      return "ok";
    }
    case "defaults": {
      const df = m as DefaultsMetrics;
      const filled = [
        df.designer,
        df.contentReviewer,
        df.internalCreative,
        df.clientReviewer,
      ].filter(Boolean).length;
      if (filled === 0) return "empty";
      if (filled < 2) return "thin";
      return "ok";
    }
    case "approvals": {
      return "ok";
    }
  }
}

const COVER_LABEL: Record<"empty" | "thin" | "ok", { label: string; icon: typeof CheckCircle2 }> = {
  empty: { label: "Empty", icon: AlertCircle },
  thin: { label: "Getting started", icon: Info },
  ok: { label: "Healthy", icon: CheckCircle2 },
};

const COVER_CLASS: Record<"empty" | "thin" | "ok", string> = {
  empty: "text-danger",
  thin: "text-warning",
  ok: "text-success",
};

export interface SettingsHealthProps {
  section: Section;
  slug: string;
  metrics: Metrics;
}

export function SettingsHealth({ section, slug, metrics }: SettingsHealthProps) {
  const suggestions = suggestionsFor(section, metrics);
  const status = coverStatus(section, metrics);
  const { label: coverLabel, icon: CoverIcon } = COVER_LABEL[status];

  return (
    <Card
      padding="md"
      className="bg-surface-subtle"
      aria-label={`${SECTION_LABEL[section]} health`}
      data-testid={`settings-health-${section}`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
          <CardTitle className="text-base">Settings Health</CardTitle>
          <span
            className={cn(
              "text-label inline-flex items-center gap-1 font-semibold",
              COVER_CLASS[status],
            )}
            data-testid={`settings-health-${section}-status`}
          >
            <CoverIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {coverLabel}
          </span>
          <Link
            href={`/app/w/${slug}/settings`}
            className="text-label text-primary ml-auto inline-flex items-center gap-1 font-semibold hover:underline"
          >
            Settings overview
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        <p className="text-label text-fg-muted">{SECTION_BLURB[section]}</p>
        {suggestions.length > 0 ? (
          <ul className="space-y-1" data-testid={`settings-health-${section}-suggestions`}>
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="text-body text-fg-primary flex items-start gap-2"
                data-testid={`settings-health-${section}-suggestion-${i}`}
              >
                <span
                  className={cn(
                    "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    status === "ok" ? "bg-success" : status === "thin" ? "bg-warning" : "bg-danger",
                  )}
                  aria-hidden="true"
                />
                {s}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
