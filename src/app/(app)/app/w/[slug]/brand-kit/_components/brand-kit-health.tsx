"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, CheckCircle2, AlertCircle, Info, Check, Clock } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * BrandKitHealth — a per-section coverage card that tells the
 * user (1) what this section contributes to the AI generation
 * route, (2) where the section's coverage stands today, and
 * (3) what to add next.
 *
 * The component is deterministic — every suggestion is derived
 * from the `count` and optional per-section `breakdown` props,
 * so the output is reproducible and testable without a model
 * call. Phase 8 will replace the static "Phase 8 will add"
 * copy on colors / fonts / publishing with the live "now
 * loaded into the AI prompt" indicator once the AI context
 * expansion is wired in.
 */
type Section = "logos" | "colors" | "typography" | "voice" | "pillars" | "publishing" | "linked";

/**
 * The three "AI context" states.
 *   - "live"   — already loaded into the AI prompt via `loadAiContext`
 *   - "queued" — slated for Phase 8 (colors, fonts, publishing rules)
 *   - "no"     — intentionally not fed to the AI (logos, linked)
 */
type AiState = "live" | "queued" | "no";

const AI_STATE: Record<Section, { state: AiState; descriptionKey: string }> = {
  logos: {
    state: "no",
    descriptionKey: "brandKit.health.aiDescription.logos",
  },
  colors: {
    state: "live",
    descriptionKey: "brandKit.health.aiDescription.colors",
  },
  typography: {
    state: "live",
    descriptionKey: "brandKit.health.aiDescription.typography",
  },
  voice: {
    state: "live",
    descriptionKey: "brandKit.health.aiDescription.voice",
  },
  pillars: {
    state: "live",
    descriptionKey: "brandKit.health.aiDescription.pillars",
  },
  publishing: {
    state: "live",
    descriptionKey: "brandKit.health.aiDescription.publishing",
  },
  linked: {
    state: "no",
    descriptionKey: "brandKit.health.aiDescription.linked",
  },
};

const SECTION_LABEL_KEY: Record<Section, string> = {
  logos: "brandKit.section.logos",
  colors: "brandKit.section.colors",
  typography: "brandKit.section.typography",
  voice: "brandKit.section.voice",
  pillars: "brandKit.section.pillars",
  publishing: "brandKit.section.publishing",
  linked: "brandKit.section.linked",
};

/**
 * Deterministic suggestion copy. Returns 1–2 short strings the
 * user can act on. Driven entirely by the supplied counts so
 * tests are pure functions of inputs.
 */
type HealthSuggestion = {
  key: string;
  params?: Record<string, string | number>;
};

function suggestionsFor(
  section: Section,
  count: number,
  t: (key: string, params?: Record<string, string | number>) => string,
  breakdown?: {
    tone?: number;
    do?: number;
    dont?: number;
    headline?: number;
    body?: number;
    accent?: number;
    mono?: number;
    primary?: number;
    secondary?: number;
    neutral?: number;
  },
): HealthSuggestion[] {
  const suggestion = (
    key: string,
    params?: Record<string, string | number>,
  ): HealthSuggestion[] => [{ key, ...(params ? { params } : {}) }];
  switch (section) {
    case "logos":
      if (count === 0) return suggestion("brandKit.health.suggestions.logosEmpty");
      if (count === 1) return suggestion("brandKit.health.suggestions.logosOne");
      if (count <= 3) return suggestion("brandKit.health.suggestions.logosThin");
      return suggestion("brandKit.health.suggestions.logosHealthy");
    case "colors": {
      const b = breakdown ?? {};
      const missing: string[] = [];
      if ((b.primary ?? 0) === 0) missing.push("primary");
      if ((b.secondary ?? 0) === 0) missing.push("secondary");
      if ((b.accent ?? 0) === 0) missing.push("accent");
      if ((b.neutral ?? 0) === 0) missing.push("neutral");
      if (count === 0) return suggestion("brandKit.health.suggestions.colorsEmpty");
      if (missing.length === 4) return suggestion("brandKit.health.suggestions.colorsMissingRoles");
      if (missing.length > 0) {
        const roles = missing.map((role) => t(`brandKit.health.colorRoles.${role}`)).join(" / ");
        return suggestion("brandKit.health.suggestions.colorsMissingSome", { roles });
      }
      if (count < 5) return suggestion("brandKit.health.suggestions.colorsVariants");
      return suggestion("brandKit.health.suggestions.colorsHealthy");
    }
    case "typography": {
      const roles = breakdown ?? {};
      const headlineMissing = (roles.headline ?? 0) === 0;
      const bodyMissing = (roles.body ?? 0) === 0;
      if (count === 0) return suggestion("brandKit.health.suggestions.typographyEmpty");
      if (headlineMissing) return suggestion("brandKit.health.suggestions.typographyHeadline");
      if (bodyMissing) return suggestion("brandKit.health.suggestions.typographyBody");
      const accentOrMono = (roles.accent ?? 0) > 0 || (roles.mono ?? 0) > 0;
      if (!accentOrMono) return suggestion("brandKit.health.suggestions.typographyAccent");
      return suggestion("brandKit.health.suggestions.typographyHealthy");
    }
    case "voice": {
      const tone = breakdown?.tone ?? 0;
      const doCount = breakdown?.do ?? 0;
      const dont = breakdown?.dont ?? 0;
      if (count === 0) return suggestion("brandKit.health.suggestions.voiceEmpty");
      if (tone === 0) return suggestion("brandKit.health.suggestions.voiceTone");
      if (doCount < 2) return suggestion("brandKit.health.suggestions.voiceDo");
      if (dont === 0) return suggestion("brandKit.health.suggestions.voiceDont");
      return suggestion("brandKit.health.suggestions.voiceHealthy");
    }
    case "pillars":
      if (count === 0) return suggestion("brandKit.health.suggestions.pillarsEmpty");
      if (count < 3) return suggestion("brandKit.health.suggestions.pillarsThin");
      if (count <= 5) return suggestion("brandKit.health.suggestions.pillarsHealthy");
      return suggestion("brandKit.health.suggestions.pillarsMany");
    case "publishing":
      if (count === 0) return suggestion("brandKit.health.suggestions.publishingEmpty");
      if (count < 3) return suggestion("brandKit.health.suggestions.publishingThin");
      return suggestion("brandKit.health.suggestions.publishingHealthy");
    case "linked":
      if (count === 0) return suggestion("brandKit.health.suggestions.linkedEmpty");
      if (count === 1) return suggestion("brandKit.health.suggestions.linkedOne");
      return suggestion("brandKit.health.suggestions.linkedHealthy");
  }
}

function coverStatus(count: number, suggestions: HealthSuggestion[]): "empty" | "thin" | "ok" {
  if (count === 0) return "empty";
  if (suggestions[0]?.key.endsWith("Healthy")) return "ok";
  return "thin";
}

const COVER_LABEL: Record<
  "empty" | "thin" | "ok",
  { labelKey: string; icon: typeof CheckCircle2 }
> = {
  empty: { labelKey: "brandKit.health.cover.empty", icon: AlertCircle },
  thin: { labelKey: "brandKit.health.cover.thin", icon: Info },
  ok: { labelKey: "brandKit.health.cover.ok", icon: CheckCircle2 },
};

const COVER_CLASS: Record<"empty" | "thin" | "ok", string> = {
  empty: "text-danger",
  thin: "text-warning",
  ok: "text-success",
};

const AI_STATE_BADGE: Record<AiState, { labelKey: string; icon: typeof Check; className: string }> =
  {
    live: { labelKey: "brandKit.health.aiBadge.live", icon: Check, className: "text-success" },
    queued: { labelKey: "brandKit.health.aiBadge.queued", icon: Clock, className: "text-fg-muted" },
    no: { labelKey: "brandKit.health.aiBadge.no", icon: Info, className: "text-fg-muted" },
  };

export interface BrandKitHealthProps {
  section: Section;
  slug: string;
  count: number;
  /** Per-role counts — `voice`, `typography`, and `colors` read this today. */
  breakdown?: {
    tone?: number;
    do?: number;
    dont?: number;
    headline?: number;
    body?: number;
    accent?: number;
    mono?: number;
    primary?: number;
    secondary?: number;
    neutral?: number;
  };
}

export function BrandKitHealth({ section, slug, count, breakdown }: BrandKitHealthProps) {
  const t = useLocaleT();
  const suggestions = suggestionsFor(section, count, t, breakdown);
  const status = coverStatus(count, suggestions);
  const { labelKey: coverLabelKey, icon: CoverIcon } = COVER_LABEL[status];
  const ai = AI_STATE[section];
  const aiBadge = AI_STATE_BADGE[ai.state];
  const AiBadgeIcon = aiBadge.icon;
  const sectionLabel = t(SECTION_LABEL_KEY[section]);

  return (
    <Card
      padding="md"
      className="bg-surface-subtle"
      aria-label={`${sectionLabel} ${t("brandKit.health.label")}`}
      data-testid={`brand-kit-health-${section}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
              <CardTitle className="text-base">Brand Kit Health</CardTitle>
              <span
                className={cn(
                  "text-label inline-flex items-center gap-1 font-semibold",
                  COVER_CLASS[status],
                )}
                data-testid={`brand-kit-health-${section}-status`}
              >
                <CoverIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {t(coverLabelKey)}
              </span>
              <span
                className={cn(
                  "text-label inline-flex items-center gap-1 font-semibold",
                  aiBadge.className,
                )}
                data-testid={`brand-kit-health-${section}-ai-state`}
                aria-label={`${t("brandKit.health.aiContext")}: ${t(aiBadge.labelKey)}`}
              >
                <AiBadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {t(aiBadge.labelKey)}
              </span>
            </div>
            <p className="text-body text-fg-secondary">
              <span className="text-fg-primary font-semibold">{count}</span>{" "}
              {t(count === 1 ? "brandKit.health.entry" : "brandKit.health.entries")}
            </p>
            <p
              className="text-label text-fg-muted mt-1"
              data-testid={`brand-kit-health-${section}-ai-contribution`}
            >
              {t(ai.descriptionKey)}
            </p>
          </div>
          <Link
            href={`/app/w/${slug}/brand-kit`}
            className="text-label text-primary inline-flex items-center gap-1 font-semibold hover:underline"
          >
            {t("brandKit.health.overviewLink")}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {suggestions.length > 0 ? (
          <ul
            className="border-border bg-surface space-y-1 rounded-[var(--radius-control)] border p-3"
            data-testid={`brand-kit-health-${section}-suggestions`}
          >
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="text-body text-fg-primary flex items-start gap-2"
                data-testid={`brand-kit-health-${section}-suggestion-${i}`}
              >
                <span
                  className={cn(
                    "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                    status === "ok" ? "bg-success" : status === "thin" ? "bg-warning" : "bg-danger",
                  )}
                  aria-hidden="true"
                />
                {t(s.key, s.params)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
