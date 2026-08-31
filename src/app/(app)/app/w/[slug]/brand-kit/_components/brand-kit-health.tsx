import * as React from "react";
import Link from "next/link";
import { Sparkles, CheckCircle2, AlertCircle, Info, Check, Clock } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

const AI_STATE: Record<Section, { state: AiState; description: string }> = {
  logos: {
    state: "no",
    description:
      "Not fed to the AI. Logos are visual brand-mark context reserved for a future image-generation capability.",
  },
  colors: {
    state: "live",
    description:
      "Fed to the AI when the Brand Visuals toggle is on. Color names, hex values, and roles surface in caption drafts so the model can recommend on-brand palettes.",
  },
  typography: {
    state: "live",
    description:
      "Fed to the AI when the Brand Visuals toggle is on. Font families, weights, and roles help the model reference the workspace's type system.",
  },
  voice: {
    state: "live",
    description:
      "Fed to the AI right now. Tone, do, and don't rules surface in caption drafts and brief improvements.",
  },
  pillars: {
    state: "live",
    description: "Fed to the AI right now. Pillar names and blurbs keep caption drafts on-topic.",
  },
  publishing: {
    state: "live",
    description:
      "Fed to the AI when the Brand Visuals toggle is on. Alt-text, hashtag, and compliance rules are appended to the prompt so the AI follows editorial guardrails.",
  },
  linked: {
    state: "no",
    description:
      "Not fed to the AI by design. Linked resources are for the human team; the activity feed also strips their URLs for viewer privacy.",
  },
};

const SECTION_LABEL: Record<Section, string> = {
  logos: "Logos",
  colors: "Colors",
  typography: "Typography",
  voice: "Voice & tone",
  pillars: "Pillars",
  publishing: "Publishing rules",
  linked: "Linked resources",
};

/**
 * Deterministic suggestion copy. Returns 1–2 short strings the
 * user can act on. Driven entirely by the supplied counts so
 * tests are pure functions of inputs.
 */
function suggestionsFor(
  section: Section,
  count: number,
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
): string[] {
  switch (section) {
    case "logos":
      if (count === 0)
        return ["Add your first logo so designers have a single source for the brand mark."];
      if (count === 1)
        return [
          "Add 2–3 variants (light, dark, monochrome) so designers can pick the right mark for each surface.",
        ];
      if (count <= 3)
        return [
          "Solid coverage. Consider an icon-only mark for small surfaces (favicons, app icons, avatars).",
        ];
      return ["Healthy library."];
    case "colors": {
      const b = breakdown ?? {};
      const missing: string[] = [];
      if ((b.primary ?? 0) === 0) missing.push("primary");
      if ((b.secondary ?? 0) === 0) missing.push("secondary");
      if ((b.accent ?? 0) === 0) missing.push("accent");
      if ((b.neutral ?? 0) === 0) missing.push("neutral");
      if (count === 0)
        return [
          "Add a Primary colour first. The AI uses it as the default recommendation in caption drafts.",
        ];
      if (missing.length === 4)
        return [
          "Mark a role for each color (Primary / Secondary / Accent / Neutral) so the AI can group recommendations.",
        ];
      if (missing.length > 0)
        return [
          `Add a ${missing.join(" / ")} color to round out the palette — the AI leans on these in caption drafts.`,
        ];
      if (count < 5)
        return [
          "Solid 4-role palette. Consider 1–2 more variants of each role for dark-mode and high-contrast use.",
        ];
      return ["Healthy palette with full role coverage."];
    }
    case "typography": {
      const roles = breakdown ?? {};
      const headlineMissing = (roles.headline ?? 0) === 0;
      const bodyMissing = (roles.body ?? 0) === 0;
      if (count === 0)
        return [
          "Add a headline + body font. Brand Visuals is on; the AI now uses these in caption drafts.",
        ];
      if (headlineMissing)
        return ["Add a Headline face first — it sets the tone for the entire type system."];
      if (bodyMissing)
        return ["Add a Body face to pair with your Headline so the type system has a hierarchy."];
      const accentOrMono = (roles.accent ?? 0) > 0 || (roles.mono ?? 0) > 0;
      if (!accentOrMono)
        return [
          "Solid pair. Add an Accent or Mono face if you need emphasis or code-style content.",
        ];
      return ["Healthy type system."];
    }
    case "voice": {
      const tone = breakdown?.tone ?? 0;
      const doCount = breakdown?.do ?? 0;
      const dont = breakdown?.dont ?? 0;
      if (count === 0)
        return ["Add at least 1 tone rule + 2 do rules + 1 don't rule. The AI mirrors all three."];
      if (tone === 0)
        return [
          "Add a tone rule. The AI uses tone as the single strongest voice signal in drafts.",
        ];
      if (doCount < 2) return ["Add 2–3 do rules. The AI mirrors them as positive patterns."];
      if (dont === 0)
        return [
          "Add 1–2 don't rules. Without them, the AI has no way to avoid the patterns you don't want.",
        ];
      return ["Healthy voice coverage."];
    }
    case "pillars":
      if (count === 0)
        return [
          "Add 3–5 pillars. The AI uses pillar names + blurbs to keep caption drafts on-topic.",
        ];
      if (count < 3)
        return ["Most agencies benefit from 3–5 pillars. Two is a thin basis for AI to lean on."];
      if (count <= 5) return ["Healthy pillar set."];
      return ["Six or more can dilute focus. Consider consolidating the least-active pillars."];
    case "publishing":
      if (count === 0)
        return [
          "Add 1–2 alt-text rules + 1–2 hashtag norms. Brand Visuals is on; the AI uses these in drafts.",
        ];
      if (count < 3)
        return [
          "Add at least one compliance + one channel-specific rule for full editorial coverage.",
        ];
      return ["Healthy publishing guardrails."];
    case "linked":
      if (count === 0)
        return [
          "Link a Figma or Drive library so the team has one place to find on-brand material.",
        ];
      if (count === 1)
        return ["Healthy. Add a second library (e.g. Canva + Figma) for cross-tool teams."];
      return [
        "Healthy. Linked resources are intentionally not fed to the AI — they stay for the human team.",
      ];
  }
}

function coverStatus(count: number, suggestions: string[]): "empty" | "thin" | "ok" {
  if (count === 0) return "empty";
  if (suggestions[0]?.startsWith("Healthy")) return "ok";
  return "thin";
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

const AI_STATE_BADGE: Record<AiState, { label: string; icon: typeof Check; className: string }> = {
  live: { label: "AI uses this", icon: Check, className: "text-success" },
  queued: { label: "Phase 8", icon: Clock, className: "text-fg-muted" },
  no: { label: "Not fed to AI", icon: Info, className: "text-fg-muted" },
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
  const suggestions = suggestionsFor(section, count, breakdown);
  const status = coverStatus(count, suggestions);
  const { label: coverLabel, icon: CoverIcon } = COVER_LABEL[status];
  const ai = AI_STATE[section];
  const aiBadge = AI_STATE_BADGE[ai.state];
  const AiBadgeIcon = aiBadge.icon;

  return (
    <Card
      padding="md"
      className="bg-surface-subtle"
      aria-label={`${SECTION_LABEL[section]} health`}
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
                {coverLabel}
              </span>
              <span
                className={cn(
                  "text-label inline-flex items-center gap-1 font-semibold",
                  aiBadge.className,
                )}
                data-testid={`brand-kit-health-${section}-ai-state`}
                aria-label={`AI context: ${aiBadge.label}`}
              >
                <AiBadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {aiBadge.label}
              </span>
            </div>
            <p className="text-body text-fg-secondary">
              <span className="text-fg-primary font-semibold">{count}</span>{" "}
              {count === 1 ? "entry" : "entries"} in this section.
            </p>
            <p
              className="text-label text-fg-muted mt-1"
              data-testid={`brand-kit-health-${section}-ai-contribution`}
            >
              {ai.description}
            </p>
          </div>
          <Link
            href={`/app/w/${slug}/brand-kit`}
            className="text-label text-primary inline-flex items-center gap-1 font-semibold hover:underline"
          >
            Brand Kit overview
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
                {s}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
